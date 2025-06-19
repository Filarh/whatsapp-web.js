'use strict';

const fs = require('fs');
const crypto = require('crypto');
const faiss = require('faiss-node');
const cliProgress = require('cli-progress');
const config = require('../config/ai');
const Logger = require('./logger');

const { IndexFlatIP } = faiss;

// Cache de índices por dataset y estado de disponibilidad
const datasetCache = new Map();
const datasetStatus = new Map();

class DatasetManager {
  constructor(datasetName) {
    this.datasetName = datasetName;
    this.datasetConfig = config.dataSets[datasetName];
    this.paths = config.getDatasetPaths(datasetName);
    this.extractor = null;
    this.faissIndex = null;
    this.ids = [];
    this.outputs = [];
    this.isAvailable = false;
    this.errorReason = null;
  }

  computeFileHash(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(data).digest('hex');
  }

  checkAvailability() {
    try {
      if (!fs.existsSync(this.paths.jsonlFile)) {
        this.isAvailable = false;
        this.errorReason = `Archivo JSONL no encontrado: ${this.paths.jsonlFile}`;
        return false;
      }

      // Verificar que el archivo no esté vacío
      const stats = fs.statSync(this.paths.jsonlFile);
      if (stats.size === 0) {
        this.isAvailable = false;
        this.errorReason = `Archivo JSONL está vacío: ${this.paths.jsonlFile}`;
        return false;
      }

      this.isAvailable = true;
      this.errorReason = null;
      return true;
    } catch (err) {
      this.isAvailable = false;
      this.errorReason = `Error verificando disponibilidad: ${err.message}`;
      return false;
    }
  }

  loadIndexFiles() {
    try {
      this.faissIndex = IndexFlatIP.read(this.paths.indexFile);
      this.ids = JSON.parse(fs.readFileSync(this.paths.idsFile, 'utf8'));
      this.outputs = JSON.parse(fs.readFileSync(this.paths.outputsFile, 'utf8'));
      Logger.info('Embedding', `✅ Índice FAISS cargado desde disco para dataset '${this.datasetName}'.`);
      return true;
    } catch (err) {
      Logger.warn('Embedding', `⚠️ Error al cargar el índice para dataset '${this.datasetName}': ${err.message}`);
      return false;
    }
  }

  saveIndexFiles(currentHash) {
    try {
      // Asegurar que el directorio .faiss existe
      if (!fs.existsSync(config.dirs.faiss)) {
        fs.mkdirSync(config.dirs.faiss, { recursive: true });
      }

      this.faissIndex.write(this.paths.indexFile);
      fs.writeFileSync(this.paths.idsFile, JSON.stringify(this.ids, null, 2), 'utf8');
      fs.writeFileSync(this.paths.outputsFile, JSON.stringify(this.outputs, null, 2), 'utf8');
      fs.writeFileSync(this.paths.hashFile, currentHash, 'utf8');
      Logger.info('Embedding', `💾 Índice FAISS y metadatos guardados correctamente para dataset '${this.datasetName}'.`);
    } catch (err) {
      Logger.error('Embedding', `❌ Error al guardar el índice para dataset '${this.datasetName}': ${err.message}`);
      throw err;
    }
  }

  async ensureModelLoaded() {
    // Verificar disponibilidad del dataset primero
    if (!this.checkAvailability()) {
      throw new Error(this.errorReason);
    }

    if (this.extractor) return;

    const { pipeline, env } = await import('@xenova/transformers');
    if (!fs.existsSync(config.embedding.modelsDir)) {
      fs.mkdirSync(config.embedding.modelsDir, { recursive: true });
    }
    env.cacheDir = config.embedding.modelsDir;

    Logger.info('Embedding', `🔄 Cargando modelo de embeddings para dataset '${this.datasetName}'...`);
    this.extractor = await pipeline('feature-extraction', config.embedding.model);

    // Verificar si necesitamos reconstruir el índice
    const currentHash = this.computeFileHash(this.paths.jsonlFile);
    const storedHash = fs.existsSync(this.paths.hashFile)
      ? fs.readFileSync(this.paths.hashFile, 'utf8').trim()
      : null;

    const hasIndexFiles = fs.existsSync(this.paths.indexFile) &&
                          fs.existsSync(this.paths.idsFile) &&
                          fs.existsSync(this.paths.outputsFile);

    if (hasIndexFiles && storedHash === currentHash && this.loadIndexFiles()) {
      Logger.info('Embedding', `⚡ Carga rápida del índice para dataset '${this.datasetName}' (hash coincide)`);
    } else {
      Logger.info('Embedding', `🔨 Reconstruyendo índice para dataset '${this.datasetName}'...`);
      await this.buildIndex();
      this.saveIndexFiles(currentHash);
    }

    // Marcar como disponible después de carga exitosa
    datasetStatus.set(this.datasetName, {
      available: true,
      entriesCount: this.ids.length,
      description: this.datasetConfig.description
    });
  }

  async buildIndex() {
    this.ids = [];
    this.outputs = [];
    this.faissIndex = null;

    const lines = fs.readFileSync(this.paths.jsonlFile, 'utf8')
      .split('\n')
      .filter(l => l.trim());

    if (lines.length === 0) {
      throw new Error(`El archivo JSONL para dataset '${this.datasetName}' está vacío`);
    }

    const progress = new cliProgress.SingleBar({
      format: `[{bar}] {percentage}% | {value}/{total} líneas - Dataset: ${this.datasetName}`,
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
        Logger.warn('Embedding', `⚠️ JSON inválido en línea ${i + 1} del dataset '${this.datasetName}': ${lines[i].slice(0, 60)}`);
        continue;
      }

      const { id, input, output = '', tags = [] } = parsed;
      if (!id || typeof input !== 'string' || !input.trim()) continue;

      const tagText = Array.isArray(tags) ? tags.join(' ') : String(tags);
      const enrichedText = `${input} ${tagText}`.trim();
      if (!enrichedText) continue;

      try {
        const vec = await this.generateEmbedding(enrichedText);

        if (!this.faissIndex) {
          this.faissIndex = new IndexFlatIP(vec.length);
        }

        this.faissIndex.add(vec);
        this.ids.push(id);
        this.outputs.push(output);
      } catch (err) {
        Logger.warn('Embedding', `⚠️ Fallo al procesar embedding línea ${i + 1} del dataset '${this.datasetName}': ${err.message}`);
      }
    }

    progress.stop();
    Logger.info('Embedding', `✅ Embeddings generados para dataset '${this.datasetName}': ${this.ids.length}`);
  }

  async generateEmbedding(text) {
    if (!this.extractor) await this.ensureModelLoaded();
    const { data } = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.isArray(data) ? data : Array.from(data);
  }

  async findMultipleMatches(query, k = null, threshold = null) {
    await this.ensureModelLoaded();

    if (!this.faissIndex || this.faissIndex.ntotal() === 0) {
      throw new Error(`El índice FAISS para dataset '${this.datasetName}' no está inicializado o está vacío.`);
    }

    const vec = await this.generateEmbedding(query);
    const { labels, distances } = this.faissIndex.search(vec, k || config.rag.maxMatches);

    return labels.map((idx, i) => ({
      id: this.ids[idx],
      output: this.outputs[idx],
      similarity: distances[i],
      dataset: this.datasetName
    })).filter(c => c.similarity >= (threshold || config.rag.minSimilarity));
  }
}

// Función para obtener o crear un manager de dataset
function getDatasetManager(datasetName) {
  if (!datasetCache.has(datasetName)) {
    datasetCache.set(datasetName, new DatasetManager(datasetName));
  }
  return datasetCache.get(datasetName);
}

// Función para verificar qué datasets están disponibles
async function checkDatasetAvailability() {
  const availabilityReport = {};
  
  for (const [datasetName, datasetConfig] of Object.entries(config.dataSets)) {
    const manager = getDatasetManager(datasetName);
    const isAvailable = manager.checkAvailability();
    
    availabilityReport[datasetName] = {
      available: isAvailable,
      required: datasetConfig.isRequired || false,
      description: datasetConfig.description,
      error: manager.errorReason
    };

    if (isAvailable) {
      Logger.info('Embedding', `✅ Dataset '${datasetName}': Disponible (${datasetConfig.description})`);
    } else {
      const logLevel = datasetConfig.isRequired ? 'error' : 'warn';
      const icon = datasetConfig.isRequired ? '❌' : '⚠️';
      Logger[logLevel]('Embedding', `${icon} Dataset '${datasetName}': ${manager.errorReason}`);
    }
  }

  return availabilityReport;
}

// Búsqueda inteligente con fallback jerárquico
async function findMatchesWithFallback(query, datasetPriorities, k = null, threshold = null) {
  const fallbackThreshold = config.rag.fallbackThreshold;
  const searchResults = {
    matches: [],
    usedDataset: null,
    attemptedDatasets: [],
    fallbackReason: null
  };

  for (const datasetName of datasetPriorities) {
    searchResults.attemptedDatasets.push(datasetName);
    
    try {
      Logger.info('Embedding', `🔍 Intentando búsqueda en dataset '${datasetName}'...`);
      
      const manager = getDatasetManager(datasetName);
      const matches = await manager.findMultipleMatches(query, k, threshold);
      
      if (matches.length > 0) {
        const bestSimilarity = Math.max(...matches.map(m => m.similarity));
        
        if (bestSimilarity >= fallbackThreshold) {
          // Encontró resultados de buena calidad
          searchResults.matches = matches;
          searchResults.usedDataset = datasetName;
          Logger.info('Embedding', `✅ Búsqueda exitosa en dataset '${datasetName}': ${matches.length} matches (mejor similitud: ${bestSimilarity.toFixed(3)})`);
          break;
        } else {
          // Resultados de baja calidad, continuar con fallback
          Logger.info('Embedding', `⚠️ Dataset '${datasetName}': resultados de baja calidad (mejor similitud: ${bestSimilarity.toFixed(3)} < ${fallbackThreshold})`);
          searchResults.fallbackReason = `Baja similitud en '${datasetName}' (${bestSimilarity.toFixed(3)} < ${fallbackThreshold})`;
        }
      } else {
        Logger.info('Embedding', `⚠️ Dataset '${datasetName}': sin resultados que superen el umbral`);
        searchResults.fallbackReason = `Sin resultados en '${datasetName}'`;
      }
      
    } catch (err) {
      Logger.warn('Embedding', `⚠️ Dataset '${datasetName}' no disponible: ${err.message}`);
      searchResults.fallbackReason = `Error en '${datasetName}': ${err.message}`;
      continue;
    }
  }

  // Si llegamos aquí sin resultados, usar el último dataset intentado con cualquier resultado
  if (!searchResults.usedDataset && searchResults.attemptedDatasets.length > 0) {
    const lastDataset = searchResults.attemptedDatasets[searchResults.attemptedDatasets.length - 1];
    try {
      const manager = getDatasetManager(lastDataset);
      const matches = await manager.findMultipleMatches(query, k, threshold);
      if (matches.length > 0) {
        searchResults.matches = matches;
        searchResults.usedDataset = lastDataset;
        Logger.info('Embedding', `🆘 Usando resultados de fallback final desde '${lastDataset}': ${matches.length} matches`);
      }
    } catch (err) {
      Logger.error('Embedding', `❌ Fallback final falló: ${err.message}`);
    }
  }

  return searchResults;
}

// Funciones de compatibilidad con la API existente
async function ensureModelLoaded(datasetName = 'faq') {
  const manager = getDatasetManager(datasetName);
  await manager.ensureModelLoaded();
}

async function findMultipleMatches(query, k = null, threshold = null, datasetName = 'faq') {
  const manager = getDatasetManager(datasetName);
  return await manager.findMultipleMatches(query, k, threshold);
}

module.exports = { 
  ensureModelLoaded, 
  findMultipleMatches,
  findMatchesWithFallback,
  checkDatasetAvailability,
  getDatasetManager
};