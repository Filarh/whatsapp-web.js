'use strict';

const fs = require('fs');
const crypto = require('crypto');
const faiss = require('faiss-node');
const cliProgress = require('cli-progress');
const config = require('../config/ai');
const Logger = require('./logger');

const { IndexFlatIP } = faiss;

let extractor = null;
let faissIndex = null;
let ids = [];
let outputs = [];

function computeFileHash(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(data).digest('hex');
}

function loadIndexFiles() {
  try {
    faissIndex = IndexFlatIP.read(config.data.indexFile);
    ids = JSON.parse(fs.readFileSync(config.data.idsFile, 'utf8'));
    outputs = JSON.parse(fs.readFileSync(config.data.outputsFile, 'utf8'));
    Logger.info('Embedding', 'Índice FAISS cargado desde disco.');
    return true;
  } catch (err) {
    Logger.warn('Embedding', 'Error al cargar el índice desde disco: ' + err.message);
    return false;
  }
}

function saveIndexFiles(currentHash) {
  try {
    faissIndex.write(config.data.indexFile);
    fs.writeFileSync(config.data.idsFile, JSON.stringify(ids, null, 2), 'utf8');
    fs.writeFileSync(config.data.outputsFile, JSON.stringify(outputs, null, 2), 'utf8');
    fs.writeFileSync(config.data.hashFile, currentHash, 'utf8');
    Logger.info('Embedding', 'Índice FAISS y metadatos guardados correctamente.');
  } catch (err) {
    Logger.error('Embedding', 'Error al guardar el índice: ' + err.message);
  }
}

async function ensureModelLoaded() {
  if (extractor) return;

  const { pipeline, env } = await import('@xenova/transformers');
  if (!fs.existsSync(config.embedding.modelsDir)) {
    fs.mkdirSync(config.embedding.modelsDir, { recursive: true });
  }
  env.cacheDir = config.embedding.modelsDir;

  extractor = await pipeline('feature-extraction', config.embedding.model);

  const currentHash = computeFileHash(config.data.jsonlFile);
  const storedHash = fs.existsSync(config.data.hashFile)
    ? fs.readFileSync(config.data.hashFile, 'utf8').trim()
    : null;

  const hasIndexFiles = fs.existsSync(config.data.indexFile) &&
                        fs.existsSync(config.data.idsFile) &&
                        fs.existsSync(config.data.outputsFile);

  if (hasIndexFiles && storedHash === currentHash && loadIndexFiles()) {
    Logger.info('Embedding', 'Carga rápida del índice (hash coincide)');
  } else {
    Logger.info('Embedding', 'Reconstruyendo índice...');
    await buildIndex();
    saveIndexFiles(currentHash);
  }
}

async function buildIndex() {
  ids = [];
  outputs = [];
  faissIndex = null;

  const lines = fs.readFileSync(config.data.jsonlFile, 'utf8')
    .split('\n')
    .filter(l => l.trim());

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
      Logger.warn('Embedding', `JSON inválido en línea ${i + 1}: ${lines[i].slice(0, 60)}`);
      continue;
    }

    const { id, input, output = '', tags = [] } = parsed;
    if (!id || typeof input !== 'string' || !input.trim()) continue;

    const tagText = Array.isArray(tags) ? tags.join(' ') : String(tags);
    const enrichedText = `${input} ${tagText}`.trim();
    if (!enrichedText) continue;

    try {
      const vec = await generateEmbedding(enrichedText);

      if (!faissIndex) {
        faissIndex = new IndexFlatIP(vec.length);
      }

      faissIndex.add(vec);
      ids.push(id);
      outputs.push(output);
    } catch (err) {
      Logger.warn('Embedding', `Fallo al procesar embedding línea ${i + 1}: ${err.message}`);
    }
  }

  progress.stop();
  Logger.info('Embedding', `Embeddings generados: ${ids.length}`);
}

async function generateEmbedding(text) {
  if (!extractor) await ensureModelLoaded();
  const { data } = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.isArray(data) ? data : Array.from(data);
}

async function findMultipleMatches(query, k = null, threshold = null) {
  await ensureModelLoaded();

  if (!faissIndex || faissIndex.ntotal() === 0) {
    throw new Error('El índice FAISS no está inicializado o está vacío.');
  }

  const vec = await generateEmbedding(query);
  const { labels, distances } = faissIndex.search(vec, k || config.rag.maxMatches);

  return labels.map((idx, i) => ({
    id: ids[idx],
    output: outputs[idx],
    similarity: distances[i]
  })).filter(c => c.similarity >= (threshold || config.rag.minSimilarity));
}

module.exports = { ensureModelLoaded, findMultipleMatches };
