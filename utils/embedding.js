'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
let extractor = null;

const instructDataPath = path.resolve('./datos-instruct-tagged.jsonl');
const localModelDir = path.resolve('./models');
const embeddingCache = [];
const keywordIndex = new Map(); // Índice para búsqueda por palabras clave

/**
 * Calcula la similitud de coseno entre dos vectores
 * @param {Array<number>} a - Primer vector
 * @param {Array<number>} b - Segundo vector
 * @returns {number} - Valor de similitud entre 0 y 1
 */
function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((acc, val, i) => acc + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((acc, val) => acc + val ** 2, 0));
  const normB = Math.sqrt(b.reduce((acc, val) => acc + val ** 2, 0));
  return dotProduct / (normA * normB);
}

/**
 * Calcula similitud aproximada entre textos (sin embeddings)
 */
function textSimilarity(text1, text2) {
  const set1 = new Set(text1.toLowerCase().split(/\s+/));
  const set2 = new Set(text2.toLowerCase().split(/\s+/));
  const intersection = new Set([...set1].filter(word => set2.has(word)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Carga e inicializa el modelo de embeddings
 */
async function ensureModelLoaded() {
  if (extractor) return extractor;
  
  try {
    const transformers = await import('@xenova/transformers');
    if (!fs.existsSync(localModelDir)) fs.mkdirSync(localModelDir);
    transformers.env.cacheDir = localModelDir;

    // Modelo optimizado para español
    extractor = await transformers.pipeline(
      'feature-extraction',
      'Allenbv/all-MiniLM-L6-v2-similarity-es-onnx'
    );

    await loadCachedEmbeddings();
    return extractor;
  } catch (error) {
    console.error('[Embedding] Error al cargar el modelo:', error);
    throw error;
  }
}

/**
 * Carga datos y embeddings desde archivo JSONL
 */
async function loadCachedEmbeddings() {
  console.log('[Embedding] Cargando datos desde:', instructDataPath);
  
  if (!fs.existsSync(instructDataPath)) {
    throw new Error(`El archivo de datos no existe en: ${instructDataPath}`);
  }
  
  const rl = readline.createInterface({
    input: fs.createReadStream(instructDataPath),
    crlfDelay: Infinity
  });

  let contador = 0;
  let errores = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    contador++;
    
    let data;
    try {
      data = JSON.parse(line);
    } catch (err) {
      console.warn(`[Embedding] JSON inválido (línea ${contador}):`, line.substring(0, 30) + '...');
      errores++;
      continue;
    }

    if (!data.input || typeof data.input !== 'string' || !data.input.trim()) {
      console.warn(`[Embedding] Entrada inválida (línea ${contador})`);
      errores++;
      continue;
    }

    try {
      // Genera embeddings para entrada y salida
      const inputEmbedding = await generateEmbedding(data.input);
      const outputEmbedding = await generateEmbedding(data.output || '');
      
      // Agrega IDs si no existen
      const id = data.id || `entry-${contador}`;
      
      // Almacena en caché
      const entry = {
        ...data,
        id,
        inputEmbedding,
        outputEmbedding,
        inputLower: data.input.toLowerCase(),
        outputLower: (data.output || '').toLowerCase(),
        keywords: extractKeywords(data.input + ' ' + (data.output || ''))
      };
      
      embeddingCache.push(entry);
      
      // Indexa por palabras clave
      indexKeywords(entry);
      
    } catch (err) {
      console.warn(`[Embedding] Error al generar embedding (línea ${contador}):`, data.input);
      errores++;
    }
  }
  
  console.log(`[Embedding] Cargadas ${embeddingCache.length} entradas (${errores} errores de ${contador} total)`);
  console.log(`[Embedding] Índice de palabras clave creado con ${keywordIndex.size} términos`);
}

/**
 * Extrae palabras clave relevantes de un texto
 */
function extractKeywords(text) {
  const stopwords = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'a', 'ante', 'bajo', 'con', 'de', 'desde', 'en', 'entre', 'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'sobre', 'tras'];
  
  return text
    .toLowerCase()
    .replace(/[^\w\sáéíóúüñ]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopwords.includes(word));
}

/**
 * Indexa entrada por palabras clave para búsqueda eficiente
 */
function indexKeywords(entry) {
  if (!entry.keywords || !Array.isArray(entry.keywords)) return;
  
  entry.keywords.forEach(keyword => {
    if (!keywordIndex.has(keyword)) {
      keywordIndex.set(keyword, []);
    }
    keywordIndex.get(keyword).push(entry.id);
  });
}

/**
 * Genera embedding vectorial para un texto
 */
async function generateEmbedding(text) {
  if (!extractor) await ensureModelLoaded();
  
  // Preprocesamiento básico
  const processedText = text.trim();
  
  try {
    const result = await extractor(processedText, { 
      pooling: 'mean', 
      normalize: true 
    });
    return result.data;
  } catch (error) {
    console.error('[Embedding] Error generando embedding:', error);
    throw error;
  }
}

/**
 * Encuentra la mejor coincidencia para una consulta
 */
async function findClosestMatch(query, threshold = 0.65) {
  if (!query || typeof query !== 'string') return null;
  if (!extractor) await ensureModelLoaded();
  
  const queryEmbedding = await generateEmbedding(query);
  let bestMatch = null;
  let bestSimilarity = -1;

  for (const item of embeddingCache) {
    const similarity = cosineSimilarity(queryEmbedding, item.inputEmbedding);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = item;
    }
  }

  if (bestMatch && bestSimilarity >= threshold) {
    return {
      text: bestMatch.input,
      output: bestMatch.output,
      similarity: bestSimilarity,
      tags: bestMatch.tags || [],
      id: bestMatch.id
    };
  }
  
  return null;
}

/**
 * Encuentra múltiples coincidencias semánticas
 */
async function findMultipleMatches(query, threshold = 0.60, limit = 3) {
  if (!query || typeof query !== 'string') return [];
  if (!extractor) await ensureModelLoaded();
  
  const queryEmbedding = await generateEmbedding(query);
  const matches = [];
  
  // Búsqueda léxica primero (coincidencias textuales)
  const queryLower = query.toLowerCase();
  const exactMatches = embeddingCache.filter(item => 
    item.inputLower.includes(queryLower) || 
    queryLower.includes(item.inputLower)
  );
  
  // Prioriza coincidencias léxicas
  if (exactMatches.length > 0) {
    console.log(`[Embedding] ${exactMatches.length} coincidencias léxicas encontradas`);
    
    for (const item of exactMatches) {
      const similarity = cosineSimilarity(queryEmbedding, item.inputEmbedding);
      if (similarity >= threshold - 0.05) { // Umbral reducido para coincidencias léxicas
        matches.push({
          text: item.input,
          output: item.output,
          similarity: Math.max(similarity, 0.70), // Bonificación por coincidencia léxica
          tags: item.tags || [],
          id: item.id,
          lexicalMatch: true
        });
      }
    }
  }
  
  // Búsqueda semántica por vectores
  for (const item of embeddingCache) {
    // Evita duplicados
    if (matches.some(m => m.id === item.id)) continue;
    
    const similarity = cosineSimilarity(queryEmbedding, item.inputEmbedding);
    if (similarity >= threshold) {
      matches.push({
        text: item.input,
        output: item.output,
        similarity,
        tags: item.tags || [],
        id: item.id
      });
    }
  }
  
  // Ordena por relevancia y limita resultados
  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Busca por palabras clave específicas
 */
function findByKeywords(keywords, limit = 5) {
  if (!Array.isArray(keywords) || keywords.length === 0) return [];
  
  // Mapeo de IDs de entrada a número de coincidencias de palabras clave
  const matchCounts = new Map();
  
  // Cuenta coincidencias por cada entrada
  keywords.forEach(keyword => {
    const matches = keywordIndex.get(keyword) || [];
    matches.forEach(id => {
      matchCounts.set(id, (matchCounts.get(id) || 0) + 1);
    });
  });
  
  // Convierte el mapa a array y ordena por número de coincidencias
  const sortedEntries = Array.from(matchCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => {
      const entry = embeddingCache.find(item => item.id === id);
      if (!entry) return null;
      
      return {
        text: entry.input,
        output: entry.output,
        similarity: 0.6 + (matchCounts.get(id) / keywords.length * 0.3), // Puntaje basado en coincidencias
        tags: entry.tags || [],
        id: entry.id,
        keywordMatch: true
      };
    })
    .filter(Boolean);
  
  return sortedEntries;
}

/**
 * Calcula similitud semántica entre dos textos
 */
async function cosineEmbeddingSimilarity(text1, text2) {
  const embedding1 = await generateEmbedding(text1);
  const embedding2 = await generateEmbedding(text2);
  return cosineSimilarity(embedding1, embedding2);
}

/**
 * Detecta si ha cambiado la intención entre consultas
 */
async function hasIntentChanged(prev, current, threshold = 0.55) {
  if (!prev || !current) return false;
  if (prev.length < 6 || current.length < 6) return false;

  // Si la nueva consulta comienza con conectores, probablemente continúa la anterior
  const frasesConectadas = /^(y|también|entonces|ahora|pero|o|en cambio|además|por eso|así que)\b/i;
  if (frasesConectadas.test(current.trim())) return false;

  // Ajusta el umbral según la longitud (consultas cortas tienden a ser más ambiguas)
  let adjustedThreshold = threshold;
  if (current.length < 15) adjustedThreshold -= 0.1;

  // Compara los embeddings
  const embPrev = await generateEmbedding(prev);
  const embCurrent = await generateEmbedding(current);
  const sim = cosineSimilarity(embPrev, embCurrent);
  console.log(`[Embedding] Similitud entre intenciones: ${sim.toFixed(4)}`);
  
  return sim < adjustedThreshold;
}

/**
 * Busca coincidencias inversas (por similitud en respuestas)
 */
async function findReverseMatches(query, threshold = 0.45, limit = 3) {
  if (!query || typeof query !== 'string') return [];
  if (!extractor) await ensureModelLoaded();
  
  const queryEmbedding = await generateEmbedding(query);
  const matches = [];

  for (const item of embeddingCache) {
    // Usa el embedding de salida (respuesta) para comparar
    const similarity = cosineSimilarity(queryEmbedding, item.outputEmbedding);
    if (similarity >= threshold) {
      matches.push({
        text: item.input,
        output: item.output,
        similarity,
        tags: item.tags || [],
        id: item.id,
        origin: 'output'
      });
    }
  }

  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

module.exports = {
  embeddingCache,
  cosineSimilarity,
  textSimilarity,
  ensureModelLoaded,
  generateEmbedding,
  findClosestMatch,
  findMultipleMatches,
  findByKeywords,
  cosineEmbeddingSimilarity,
  hasIntentChanged,
  findReverseMatches
};