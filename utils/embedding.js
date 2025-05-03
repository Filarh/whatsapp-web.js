'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const faiss = require('faiss-node'); // ← npm install faiss-node

let extractor = null;
let faissIndex = null;
let faissMetadata = [];

const instructDataPath = path.resolve('datos-instruct-tagged.jsonl');
const localModelDir = path.resolve('./models');
const FAISS_INDEX_PATH = path.resolve('./faiss_index.bin');
const FAISS_META_PATH = path.resolve('./faiss_metadata.json');

/**
 * Inicializa el modelo de embeddings
 */
async function ensureModelLoaded() {
  if (extractor) return extractor;

  try {
    const transformers = await import('@xenova/transformers');
    if (!fs.existsSync(localModelDir)) fs.mkdirSync(localModelDir);
    transformers.env.cacheDir = localModelDir;

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
 * Genera embedding para texto
 */
async function generateEmbedding(text) {
  if (!extractor) await ensureModelLoaded();
  const result = await extractor(text.trim(), { pooling: 'mean', normalize: true });
  return result.data; // devuelve Float32Array directamente
}



/**
 * Carga desde disco o genera FAISS desde JSONL
 */
async function loadCachedEmbeddings() {
  if (fs.existsSync(FAISS_INDEX_PATH) && fs.existsSync(FAISS_META_PATH)) {
    faissIndex = faiss.readIndex(FAISS_INDEX_PATH);
    faissMetadata = JSON.parse(fs.readFileSync(FAISS_META_PATH, 'utf8'));
    console.log(`[FAISS] Índice cargado desde disco con ${faissMetadata.length} entradas`);
    return;
  }

  console.log('[Embedding] Generando índice FAISS desde JSONL...');
  await regenerateFaissIndex();
}



async function regenerateFaissIndex() {
  const rl = readline.createInterface({
    input: fs.createReadStream(instructDataPath),
    crlfDelay: Infinity
  });

  let contador = 0;
  let errores = 0;
  let vectorLength = null;
  const allVectors = [];
  faissMetadata = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    contador++;

    let data;
    try {
      data = JSON.parse(line);
    } catch {
      console.warn(`[FAISS] JSON inválido en línea ${contador}`);
      errores++;
      continue;
    }

    if (!data.input || typeof data.input !== 'string') {
      console.warn(`[FAISS] Entrada inválida (línea ${contador})`);
      errores++;
      continue;
    }

    let embedding;
    try {
      embedding = await generateEmbedding(data.input);
    } catch (err) {
      console.warn(`[FAISS] Error generando embedding (línea ${contador}): ${err.message}`);
      errores++;
      continue;
    }

    if (!(embedding instanceof Float32Array) || embedding.length === 0 || isNaN(embedding[0])) {
      console.warn(`[FAISS] Embedding inválido (línea ${contador})`);
      errores++;
      continue;
    }

    if (!vectorLength) vectorLength = embedding.length;
    else if (embedding.length !== vectorLength) {
      console.warn(`[FAISS] Longitud inesperada en línea ${contador}: ${embedding.length} (esperado: ${vectorLength})`);
      errores++;
      continue;
    }

    const id = data.id || `entry-${contador}`;
    faissMetadata.push({ ...data, id });
    allVectors.push(embedding);
  }

  console.log(`[Embedding] Generando índice con ${allVectors.length} vectores válidos...`);

  if (!vectorLength || allVectors.length === 0) {
    throw new Error("No se generaron vectores válidos para crear el índice FAISS.");
  }

  // Flatten Float32Array[] → Float32Array continuo
  const totalSize = allVectors.length * vectorLength;
  const flatArray = new Float32Array(totalSize);
  allVectors.forEach((vec, i) => flatArray.set(vec, i * vectorLength));

  // Crear índice FAISS
  faissIndex = new faiss.IndexFlatL2(vectorLength);
  faissIndex.add(flatArray, allVectors.length);

  // Guardar índice y metadatos
  faiss.writeIndex(faissIndex, FAISS_INDEX_PATH);
  fs.writeFileSync(FAISS_META_PATH, JSON.stringify(faissMetadata, null, 2));

  console.log(`[FAISS] Índice FAISS creado con ${allVectors.length} vectores (longitud: ${vectorLength}, errores: ${errores})`);
}





/**
 * Busca la mejor coincidencia
 */
async function findClosestMatch(query, threshold = 0.65) {
  if (!query || typeof query !== 'string') return null;
  if (!extractor) await ensureModelLoaded();
  if (!faissIndex) return null;

  const queryEmbedding = await generateEmbedding(query);
  const result = faissIndex.search([queryEmbedding], 1);
  const bestIndex = result.indices[0];
  const similarity = 1 / (1 + result.distances[0]);

  if (bestIndex >= 0 && similarity >= threshold) {
    const match = faissMetadata[bestIndex];
    return {
      text: match.input,
      output: match.output,
      similarity,
      tags: match.tags || [],
      id: match.id
    };
  }

  return null;
}

/**
 * Busca múltiples coincidencias
 */
async function findMultipleMatches(query, threshold = 0.6, limit = 3) {
  if (!query || typeof query !== 'string') return [];
  if (!extractor) await ensureModelLoaded();
  if (!faissIndex) return [];

  const queryEmbedding = await generateEmbedding(query);
  const result = faissIndex.search([queryEmbedding], limit);
  const matches = [];

  for (let i = 0; i < result.indices.length; i++) {
    const idx = result.indices[i];
    const dist = result.distances[i];
    const sim = 1 / (1 + dist);

    if (sim >= threshold && faissMetadata[idx]) {
      matches.push({
        text: faissMetadata[idx].input,
        output: faissMetadata[idx].output,
        similarity: sim,
        tags: faissMetadata[idx].tags || [],
        id: faissMetadata[idx].id
      });
    }
  }

  return matches;
}

module.exports = {
  ensureModelLoaded,
  generateEmbedding,
  findClosestMatch,
  findMultipleMatches,
  regenerateFaissIndex
};
