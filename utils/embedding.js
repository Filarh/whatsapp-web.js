// utils/embedding.js (versión mejorada e inteligente)
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
let extractor = null;

const instructDataPath = path.resolve('./datos-instruct-tagged.jsonl');
const localModelDir = path.resolve('./models');
const cache = []; // Renombrado para claridad y consistencia

// Coseno de similitud entre dos vectores
function cosineSimilarity(a, b) {
  const dotProduct = a.reduce((acc, val, i) => acc + val * b[i], 0);
  const normA = Math.sqrt(a.reduce((acc, val) => acc + val ** 2, 0));
  const normB = Math.sqrt(b.reduce((acc, val) => acc + val ** 2, 0));
  return dotProduct / (normA * normB);
}

// Inicializa y carga el modelo de embeddings
async function ensureModelLoaded() {
  if (extractor) return extractor;
  
  try {
    const transformers = await import('@xenova/transformers');
    if (!fs.existsSync(localModelDir)) fs.mkdirSync(localModelDir);
    transformers.env.cacheDir = localModelDir;

    // Usar un modelo específico para español
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

// Carga los embeddings precalculados desde el archivo JSONL
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
      const embedding = await generateEmbedding(data.input);
      cache.push({
        ...data,
        embedding,
        inputLower: data.input.toLowerCase() // Versión en minúsculas para búsquedas rápidas
      });
    } catch (err) {
      console.warn(`[Embedding] Error al generar embedding (línea ${contador}):`, data.input);
      errores++;
    }
  }
  
  console.log(`[Embedding] Cargadas ${cache.length} entradas (${errores} errores de ${contador} total)`);
  
  // Precomputar algunos valores útiles
  precomputeMetadata();
}

// Añadir metadatos útiles a la caché
function precomputeMetadata() {
  // Extraer todos los tags únicos
  const allTags = new Set();
  cache.forEach(item => {
    if (item.tags && Array.isArray(item.tags)) {
      item.tags.forEach(tag => allTags.add(tag));
    }
  });
  
  // Agrupar entradas por tag para búsquedas eficientes
  const entriesByTag = {};
  allTags.forEach(tag => {
    entriesByTag[tag] = cache.filter(item => 
      item.tags && item.tags.includes(tag)
    );
  });
  
  // Almacenar estos metadatos
  cache.metadata = {
    tags: Array.from(allTags),
    entriesByTag,
    count: cache.length,
    lastUpdated: new Date()
  };
  
  console.log(`[Embedding] Metadatos computados: ${cache.metadata.tags.length} tags únicos`);
}

// Generar embedding para un texto
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

// Encontrar la coincidencia más cercana
async function findClosestMatch(query, threshold = 0.65) {
  if (!query || typeof query !== 'string') return null;
  if (!extractor) await ensureModelLoaded();
  
  const queryEmbedding = await generateEmbedding(query);
  let bestMatch = null;
  let bestSimilarity = -1;

  for (const item of cache) {
    const similarity = cosineSimilarity(queryEmbedding, item.embedding);
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
      id: bestMatch.id || null
    };
  }
  
  return null;
}

// Encontrar múltiples coincidencias
async function findMultipleMatches(query, threshold = 0.60, limit = 3) {
  if (!query || typeof query !== 'string') return [];
  if (!extractor) await ensureModelLoaded();
  
  const queryEmbedding = await generateEmbedding(query);
  const matches = [];
  
  // Primero buscar coincidencias exactas (búsqueda léxica)
  const queryLower = query.toLowerCase();
  const exactMatches = cache.filter(item => 
    item.inputLower.includes(queryLower) || 
    queryLower.includes(item.inputLower)
  );
  
  // Si hay coincidencias léxicas, priorizarlas
  if (exactMatches.length > 0) {
    console.log(`[Embedding] ${exactMatches.length} coincidencias léxicas encontradas`);
    // Añadir estas primero con similitud alta
    for (const item of exactMatches) {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);
      if (similarity >= threshold - 0.05) { // Umbral reducido para coincidencias léxicas
        matches.push({
          text: item.input,
          output: item.output,
          similarity: Math.max(similarity, 0.70), // Bonificación por coincidencia léxica
          tags: item.tags || [],
          id: item.id || null,
          lexicalMatch: true
        });
      }
    }
  }
  
  // Luego buscar por similitud semántica
  for (const item of cache) {
    // Saltamos las que ya están en matches
    if (matches.some(m => m.id === item.id)) continue;
    
    const similarity = cosineSimilarity(queryEmbedding, item.embedding);
    if (similarity >= threshold) {
      matches.push({
        text: item.input,
        output: item.output,
        similarity,
        tags: item.tags || [],
        id: item.id || null
      });
    }
  }
  
  // Ordenar por similitud descendente y limitar resultados
  return matches
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// Buscar por tags específicos
function findByTags(tags, threshold = 0.60, limit = 10) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }
  
  // Buscar entradas que tengan al menos uno de los tags especificados
  let results = [];
  tags.forEach(tag => {
    if (cache.metadata?.entriesByTag[tag]) {
      results = results.concat(cache.metadata.entriesByTag[tag]);
    }
  });
  
  // Eliminar duplicados
  results = [...new Map(results.map(item => [item.id, item])).values()];
  
  // Convertir al formato de salida y limitar
  return results
    .slice(0, limit)
    .map(item => ({
      text: item.input,
      output: item.output,
      tags: item.tags || [],
      id: item.id || null
    }));
}

// Calcular similitud semántica entre dos textos
async function cosineEmbeddingSimilarity(text1, text2) {
  const embedding1 = await generateEmbedding(text1);
  const embedding2 = await generateEmbedding(text2);
  return cosineSimilarity(embedding1, embedding2);
}

// ... (todo tu código intacto hasta el final)

async function hasIntentChanged(prev, current, threshold = 0.55) {
  if (!prev || !current) return false;

  if (prev.length < 6 || current.length < 6) return false;

  const frasesConectadas = /^(y|también|entonces|ahora|pero|o|en cambio)\b/i;
  if (frasesConectadas.test(current.trim())) return false;

  let adjustedThreshold = threshold;
  if (current.length < 15) adjustedThreshold -= 0.1;

  const embPrev = await generateEmbedding(prev);
  const embCurrent = await generateEmbedding(current);
  const sim = cosineSimilarity(embPrev, embCurrent);
  console.log(`[Embedding] Similitud entre intenciones: ${sim.toFixed(4)}`);
  return sim < adjustedThreshold;
}
async function findReverseMatches(query, threshold = 0.45, limit = 3) {
  const queryEmbedding = await generateEmbedding(query);
  const matches = [];

  for (const item of cache) {
    const sim = cosineSimilarity(queryEmbedding, item.outputEmbedding || item.embedding);
    if (sim >= threshold) {
      matches.push({
        text: item.input,
        output: item.output,
        similarity: sim,
        origin: 'output'
      });
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

module.exports = {
  cache,
  cosineSimilarity,
  ensureModelLoaded,
  generateEmbedding,
  findClosestMatch,
  findMultipleMatches,
  findByTags,
  cosineEmbeddingSimilarity,
  hasIntentChanged,
  findReverseMatches
};
