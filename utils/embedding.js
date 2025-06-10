'use strict';

const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const readline = require('readline');
const faiss    = require('faiss-node');
const cliProgress = require('cli-progress');
const { IndexFlatIP } = faiss;

// --- Rutas y nombres de archivos ---
const localModelDir = path.resolve('./models');
const jsonlFile     = path.resolve('./productos_augmented.jsonl');
const indexFile     = path.resolve('./productos.index');
const idsFile       = path.resolve('./productos.ids.json');
const outputsFile   = path.resolve('./productos.outputs.json');
const hashFile      = path.resolve('./productos.hash');

// Estado interno
let extractor   = null;
let faissIndex  = null;
let ids         = [];
let outputs     = [];
let texts       = [];

/**
 * Calcula el hash MD5 de un archivo completo.
 */
function computeFileHash(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Inicializa el pipeline de embeddings y carga o crea el índice Faiss.
 */
async function ensureModelLoaded() {
  if (extractor) return;

  const { pipeline, env } = await import('@xenova/transformers');
  if (!fs.existsSync(localModelDir)) fs.mkdirSync(localModelDir, { recursive: true });
  env.cacheDir = localModelDir;

  extractor = await pipeline(
    'feature-extraction',
    'Allenbv/mks-similarity-onnx'
  );

  const currentHash = computeFileHash(jsonlFile);
  const storedHash  = fs.existsSync(hashFile)
    ? fs.readFileSync(hashFile, 'utf8').trim()
    : null;

  const hasIndexFiles = fs.existsSync(indexFile)
                     && fs.existsSync(idsFile)
                     && fs.existsSync(outputsFile);

  if (hasIndexFiles && storedHash === currentHash) {
    faissIndex = IndexFlatIP.read(indexFile);
    ids        = JSON.parse(fs.readFileSync(idsFile, 'utf8'));
    outputs    = JSON.parse(fs.readFileSync(outputsFile, 'utf8'));
    console.log('[Embedding] Carga rápida de índice Faiss (hash coincide)');
  } else {
    console.log('[Embedding] Rebuild de índice Faiss (hash distinto o archivos faltantes)');
    await buildIndex();
    fs.writeFileSync(hashFile, currentHash, 'utf8');
  }
}

/**
 * Lee el JSONL, genera embeddings, crea el índice y guarda en disco.
 */
async function buildIndex() {
  ids = [];
  outputs = [];
  texts = [];
  faissIndex = null;

  const lines = fs.readFileSync(jsonlFile, 'utf8').split('\n').filter(l => l.trim());
  const progress = new cliProgress.SingleBar({
    format: '[{bar}] {percentage}% | {value}/{total} líneas',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true
  }, cliProgress.Presets.shades_classic);

  progress.start(lines.length, 0);

  for (let i = 0; i < lines.length; i++) {
    progress.update(i + 1);

    let parsed;
    try {
      parsed = JSON.parse(lines[i]);
    } catch (err) {
      console.warn('[Embedding] Línea JSON inválida, se omite:', lines[i].slice(0, 60));
      continue;
    }

    const { id, input, output = '', tags = [] } = parsed;

    if (!id || typeof input !== 'string' || !input.trim()) {
      console.warn('[Embedding] Entrada sin input válido, se omite:', id || '(sin ID)');
      continue;
    }

    const enrichedText = [input, ...(Array.isArray(tags) ? tags : [])].join(' ').trim();
    if (!enrichedText) continue;

    const vec = await generateEmbedding(enrichedText);

    if (!faissIndex) {
      faissIndex = new IndexFlatIP(vec.length);
    }

    faissIndex.add(vec);
    ids.push(id);
    outputs.push(output);
    texts.push(enrichedText);
  }

  progress.stop();

  faissIndex.write(indexFile);
  fs.writeFileSync(idsFile,     JSON.stringify(ids,     null, 2), 'utf8');
  fs.writeFileSync(outputsFile, JSON.stringify(outputs, null, 2), 'utf8');

  console.log(`[Embedding] Embeddings generados: ${ids.length}`);
}

/**
 * Genera el embedding de un texto dado (JS Array de números).
 */
async function generateEmbedding(text) {
  if (!extractor) await ensureModelLoaded();
  const { data } = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.isArray(data) ? data : Array.from(data);
}

/**
 * Busca la coincidencia más cercana (solo si similarity > 0.3).
 */
async function findClosestMatch(query) {
  await ensureModelLoaded();
  const vec = await generateEmbedding(query);
  const { labels, distances } = faissIndex.search(vec, 1);
  const idx = labels[0];
  if (idx < 0 || distances[0] < 0.3) return null;
  return {
    id: ids[idx],
    output: outputs[idx],
    similarity: distances[0]
  };
}

/**
 * Busca las k coincidencias más cercanas (filtradas por similarity).
 */
async function findMultipleMatches(query, k = 5, threshold = 0.3) {
  await ensureModelLoaded();
  const vec = await generateEmbedding(query);
  const { labels, distances } = faissIndex.search(vec, k);
  return labels.map((idx, i) => ({
    id: ids[idx],
    output: outputs[idx],
    similarity: distances[i]
  })).filter(c => c.similarity >= threshold);
}

// Carga todos los tags únicos desde el JSONL original
async function getKnownTags() {
  const tagsSet = new Set();

  const rl = readline.createInterface({
    input: fs.createReadStream(jsonlFile),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const { tags = [] } = JSON.parse(line);
      for (const tag of tags) {
        if (tag && typeof tag === 'string') {
          tagsSet.add(tag.toLowerCase());
        }
      }
    } catch (e) {
      continue;
    }
  }

  return Array.from(tagsSet);
}




module.exports = {
  ensureModelLoaded,
  generateEmbedding,
  findClosestMatch,
  findMultipleMatches,
  getKnownTags
};
