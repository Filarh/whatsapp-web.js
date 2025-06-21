'use strict';

const fs = require('fs');
const crypto = require('crypto');
const faiss = require('faiss-node');
const cliProgress = require('cli-progress');
const config = require('../config/ai');
const Logger = require('./logger');

const { IndexFlatIP } = faiss;

class EmbeddingCore {
  constructor() {
    this.extractor = null;
    this.modelLoaded = false;
  }

  async ensureModelLoaded() {
    if (this.modelLoaded) return;

    const { pipeline, env } = await import('@xenova/transformers');
    if (!fs.existsSync(config.embedding.modelsDir)) {
      fs.mkdirSync(config.embedding.modelsDir, { recursive: true });
    }
    env.cacheDir = config.embedding.modelsDir;

    Logger.info('EmbeddingCore', '🔄 Cargando modelo de embeddings...');
    this.extractor = await pipeline('feature-extraction', config.embedding.model);
    this.modelLoaded = true;
    Logger.info('EmbeddingCore', '✅ Modelo de embeddings cargado');
  }

  async generateEmbedding(text) {
    await this.ensureModelLoaded();
    const { data } = await this.extractor(text, { pooling: 'mean', normalize: true });
    return Array.isArray(data) ? data : Array.from(data);
  }

  computeFileHash(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(data).digest('hex');
  }

  createFaissIndex(dimension) {
    return new IndexFlatIP(dimension);
  }

  loadFaissIndex(indexPath) {
    return IndexFlatIP.read(indexPath);
  }

  saveFaissIndex(index, indexPath) {
    index.write(indexPath);
  }
}

class DatasetIndex {
  constructor(datasetName, core) {
    this.datasetName = datasetName;
    this.core = core;
    this.datasetConfig = config.dataSets[datasetName];
    this.paths = config.getDatasetPaths(datasetName);
    this.faissIndex = null;
    this.ids = [];
    this.outputs = [];
    this.metadata = [];
    this.isLoaded = false;
    this.isAvailable = false;
    this.errorReason = null;
  }

  checkAvailability() {
    try {
      if (!fs.existsSync(this.paths.jsonlFile)) {
        this.isAvailable = false;
        this.errorReason = `Archivo JSONL no encontrado: ${this.paths.jsonlFile}`;
        return false;
      }

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

  async loadFromDisk() {
    try {
      this.faissIndex = this.core.loadFaissIndex(this.paths.indexFile);
      this.ids = JSON.parse(fs.readFileSync(this.paths.idsFile, 'utf8'));
      this.outputs = JSON.parse(fs.readFileSync(this.paths.outputsFile, 'utf8'));
      
      // Cargar metadata si existe
      if (fs.existsSync(this.paths.metadataFile)) {
        this.metadata = JSON.parse(fs.readFileSync(this.paths.metadataFile, 'utf8'));
      } else {
        this.metadata = new Array(this.ids.length).fill({});
      }

      this.isLoaded = true;
      Logger.info('EmbeddingCore', `✅ Índice cargado desde disco para dataset '${this.datasetName}'`);
      return true;
    } catch (err) {
      Logger.warn('EmbeddingCore', `⚠️ Error cargando índice para '${this.datasetName}': ${err.message}`);
      return false;
    }
  }

  async saveToDisk(currentHash) {
    try {
      if (!fs.existsSync(config.dirs.faiss)) {
        fs.mkdirSync(config.dirs.faiss, { recursive: true });
      }

      this.core.saveFaissIndex(this.faissIndex, this.paths.indexFile);
      fs.writeFileSync(this.paths.idsFile, JSON.stringify(this.ids, null, 2), 'utf8');
      fs.writeFileSync(this.paths.outputsFile, JSON.stringify(this.outputs, null, 2), 'utf8');
      fs.writeFileSync(this.paths.metadataFile, JSON.stringify(this.metadata, null, 2), 'utf8');
      fs.writeFileSync(this.paths.hashFile, currentHash, 'utf8');
      
      Logger.info('EmbeddingCore', `💾 Índice guardado para dataset '${this.datasetName}'`);
    } catch (err) {
      Logger.error('EmbeddingCore', `❌ Error guardando índice para '${this.datasetName}': ${err.message}`);
      throw err;
    }
  }

  async buildIndex() {
    if (!this.checkAvailability()) {
      throw new Error(this.errorReason);
    }

    this.ids = [];
    this.outputs = [];
    this.metadata = [];
    this.faissIndex = null;

    const lines = fs.readFileSync(this.paths.jsonlFile, 'utf8')
      .split('\n')
      .filter(l => l.trim());

    if (lines.length === 0) {
      throw new Error(`Archivo JSONL vacío para dataset '${this.datasetName}'`);
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
        Logger.warn('EmbeddingCore', `⚠️ JSON inválido en línea ${i + 1}: ${lines[i].slice(0, 60)}`);
        continue;
      }

      const { id, input, output = '', tags = [], ...otherFields } = parsed;
      if (!id || typeof input !== 'string' || !input.trim()) continue;

      const tagText = Array.isArray(tags) ? tags.join(' ') : String(tags);
      const enrichedText = `${input} ${tagText}`.trim();
      if (!enrichedText) continue;

      try {
        const vec = await this.core.generateEmbedding(enrichedText);

        if (!this.faissIndex) {
          this.faissIndex = this.core.createFaissIndex(vec.length);
        }

        this.faissIndex.add(vec);
        this.ids.push(id);
        this.outputs.push(output);
        
        // Guardar metadata adicional (útil para productos)
        this.metadata.push({
          tags,
          dataset: this.datasetName,
          type: this.datasetConfig.type || 'general',
          ...otherFields
        });
      } catch (err) {
        Logger.warn('EmbeddingCore', `⚠️ Error procesando línea ${i + 1}: ${err.message}`);
      }
    }

    progress.stop();
    this.isLoaded = true;
    Logger.info('EmbeddingCore', `✅ Índice construido para '${this.datasetName}': ${this.ids.length} entradas`);
  }

  async ensureLoaded() {
    if (this.isLoaded) return;

    if (!this.checkAvailability()) {
      throw new Error(this.errorReason);
    }

    await this.core.ensureModelLoaded();

    const currentHash = this.core.computeFileHash(this.paths.jsonlFile);
    const storedHash = fs.existsSync(this.paths.hashFile)
      ? fs.readFileSync(this.paths.hashFile, 'utf8').trim()
      : null;

    const hasIndexFiles = fs.existsSync(this.paths.indexFile) &&
                          fs.existsSync(this.paths.idsFile) &&
                          fs.existsSync(this.paths.outputsFile);

    if (hasIndexFiles && storedHash === currentHash && await this.loadFromDisk()) {
      Logger.info('EmbeddingCore', `⚡ Carga rápida del índice para '${this.datasetName}'`);
    } else {
      Logger.info('EmbeddingCore', `🔨 Reconstruyendo índice para '${this.datasetName}'...`);
      await this.buildIndex();
      await this.saveToDisk(currentHash);
    }
  }

  async search(query, k = 10, threshold = 0.0) {
    await this.ensureLoaded();

    if (!this.faissIndex || this.faissIndex.ntotal() === 0) {
      throw new Error(`Índice vacío para dataset '${this.datasetName}'`);
    }

    const vec = await this.core.generateEmbedding(query);
    const { labels, distances } = this.faissIndex.search(vec, k);

    return labels.map((idx, i) => ({
      id: this.ids[idx],
      output: this.outputs[idx],
      similarity: distances[i],
      dataset: this.datasetName,
      metadata: this.metadata[idx] || {}
    })).filter(match => match.similarity >= threshold);
  }
}

module.exports = { EmbeddingCore, DatasetIndex };