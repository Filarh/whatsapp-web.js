'use strict';

const config = require('../config/ai');
const Logger = require('./logger');
const TemplateManager = require('./template');
const { EmbeddingCore, DatasetIndex } = require('./embedding_core');

class SearchEngine {
  constructor() {
    this.core = new EmbeddingCore();
    this.datasets = new Map();
    this.searchStrategies = new Map();
    this.initialized = false;
    
    this.initializeSearchStrategies();
  }

  initializeSearchStrategies() {
    // Estrategia para búsquedas generales de productos
    this.searchStrategies.set('product_general', {
      name: 'Búsqueda General de Productos',
      detector: (query, analysis) => {
        const productTerms = ['modelos', 'tipos', 'opciones', 'productos', 'variedades', 'catálogo'];
        const hasProductTerm = productTerms.some(term => 
          query.toLowerCase().includes(term)
        );
        const hasGeneralIntent = analysis.producto && !this.hasSpecificProductMention(query);
        return hasProductTerm || hasGeneralIntent;
      },
      searchParams: {
        k: 20,
        threshold: 0.3,
        useExpansion: true,
        groupByCategory: true
      },
      postProcessor: 'formatProductList'
    });

    // Estrategia para búsquedas específicas
    this.searchStrategies.set('specific_search', {
      name: 'Búsqueda Específica',
      detector: (query, analysis) => true, // Default fallback
      searchParams: {
        k: 5,
        threshold: 0.5,
        useExpansion: false,
        groupByCategory: false
      },
      postProcessor: 'formatSpecificResult'
    });
  }

  hasSpecificProductMention(query) {
    const specificTerms = ['bajaj', 'pulsar', 'honda', 'yamaha', 'suzuki'];
    return specificTerms.some(term => 
      query.toLowerCase().includes(term.toLowerCase())
    );
  }

  async initialize() {
    if (this.initialized) return;

    Logger.info('SearchEngine', '🚀 Inicializando motor de búsqueda...');
    
    // Verificar disponibilidad de datasets
    const availabilityReport = await this.checkDatasetAvailability();
    
    // Inicializar datasets disponibles
    const initPromises = [];
    for (const [datasetName, status] of Object.entries(availabilityReport)) {
      if (status.available) {
        const dataset = new DatasetIndex(datasetName, this.core);
        this.datasets.set(datasetName, dataset);
        
        initPromises.push(
          dataset.ensureLoaded()
            .then(() => {
              Logger.info('SearchEngine', `✅ Dataset '${datasetName}' cargado`);
            })
            .catch(err => {
              Logger.error('SearchEngine', `❌ Error cargando '${datasetName}': ${err.message}`);
            })
        );
      }
    }
    
    await Promise.allSettled(initPromises);
    
    const availableCount = this.datasets.size;
    const totalCount = Object.keys(config.dataSets).length;
    Logger.info('SearchEngine', `🎯 Motor inicializado: ${availableCount}/${totalCount} datasets`);
    
    this.initialized = true;
  }

  async checkDatasetAvailability() {
    const availabilityReport = {};
    
    for (const [datasetName, datasetConfig] of Object.entries(config.dataSets)) {
      const dataset = new DatasetIndex(datasetName, this.core);
      const isAvailable = dataset.checkAvailability();
      
      availabilityReport[datasetName] = {
        available: isAvailable,
        required: datasetConfig.isRequired || false,
        description: datasetConfig.description,
        error: dataset.errorReason
      };
    }

    return availabilityReport;
  }

  detectSearchStrategy(query, analysis) {
    for (const [strategyName, strategy] of this.searchStrategies) {
      if (strategy.detector(query, analysis)) {
        Logger.info('SearchEngine', `🎯 Estrategia detectada: ${strategy.name}`);
        return { name: strategyName, strategy };
      }
    }
    return { name: 'specific_search', strategy: this.searchStrategies.get('specific_search') };
  }

  async expandQuery(query, strategy) {
    if (!strategy.searchParams.useExpansion) return [query];

    const expanded = [query];
    
    // Expansión para búsquedas generales de productos
    if (strategy.searchParams.useExpansion) {
      const synonyms = TemplateManager.getQuerySynonyms();
      const lowerQuery = query.toLowerCase();
      
      for (const [term, alternatives] of Object.entries(synonyms)) {
        if (lowerQuery.includes(term)) {
          alternatives.forEach(alt => {
            expanded.push(query.replace(new RegExp(term, 'gi'), alt));
          });
        }
      }
    }

    return expanded;
  }

  async executeSearch(queries, datasetPriorities, strategy) {
    const allResults = new Map();
    
    for (const datasetName of datasetPriorities) {
      const dataset = this.datasets.get(datasetName);
      if (!dataset) continue;

      try {
        for (const query of queries) {
          const results = await dataset.search(
            query,
            strategy.searchParams.k,
            strategy.searchParams.threshold
          );
          
          // Agregar resultados únicos
          results.forEach(result => {
            const key = `${result.dataset}-${result.id}`;
            if (!allResults.has(key) || allResults.get(key).similarity < result.similarity) {
              allResults.set(key, result);
            }
          });
        }
        
        if (allResults.size > 0) {
          Logger.info('SearchEngine', `✅ Encontrados ${allResults.size} resultados en dataset '${datasetName}'`);
          return {
            matches: Array.from(allResults.values()).sort((a, b) => b.similarity - a.similarity),
            usedDataset: datasetName,
            attemptedDatasets: [datasetName],
            fallbackReason: null
          };
        }
      } catch (err) {
        Logger.warn('SearchEngine', `⚠️ Error en dataset '${datasetName}': ${err.message}`);
      }
    }

    return {
      matches: [],
      usedDataset: null,
      attemptedDatasets: datasetPriorities,
      fallbackReason: 'No se encontraron resultados en ningún dataset'
    };
  }

  formatProductList(results) {
    const grouped = {};
    const categories = new Set();
    
    results.forEach(result => {
      try {
        const output = JSON.parse(result.output);
        const category = output.categoria || 'Sin categoría';
        categories.add(category);
        
        if (!grouped[category]) {
          grouped[category] = [];
        }
        
        grouped[category].push({
          nombre: output.nombre,
          codigo: output.codigo,
          marca: output.marca,
          precio: output.precio,
          similarity: result.similarity
        });
      } catch (err) {
        // Si no es JSON, tratar como texto simple
        const category = result.metadata.category || 'General';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push({
          contenido: result.output,
          similarity: result.similarity
        });
      }
    });

    return {
      type: 'product_list',
      categories: grouped,
      totalProducts: results.length,
      categoriesCount: categories.size
    };
  }

  formatSpecificResult(results) {
    return {
      type: 'specific_result',
      matches: results.slice(0, 3),
      totalMatches: results.length
    };
  }

  async intelligentSearch(query, datasetPriorities, queryAnalysis) {
    await this.initialize();

    const { name: strategyName, strategy } = this.detectSearchStrategy(query, queryAnalysis);
    
    // Expandir consulta si es necesario
    const expandedQueries = await this.expandQuery(query, strategy);
    Logger.info('SearchEngine', `🔍 Consultas expandidas: ${expandedQueries.length}`);

    // Ejecutar búsqueda
    const searchResults = await this.executeSearch(expandedQueries, datasetPriorities, strategy);
    
    // Post-procesar resultados
    if (searchResults.matches.length > 0) {
      const processor = strategy.postProcessor;
      searchResults.formattedResults = this[processor](searchResults.matches);
    }

    searchResults.strategy = strategyName;
    return searchResults;
  }
}

// Singleton para el motor de búsqueda
const searchEngine = new SearchEngine();

// Funciones de compatibilidad
async function findMatchesWithFallback(query, datasetPriorities, k = null, threshold = null) {
  const queryAnalysis = TemplateManager.analyzeQuery ? TemplateManager.analyzeQuery(query) : {};
  return await searchEngine.intelligentSearch(query, datasetPriorities, queryAnalysis);
}

async function ensureModelLoaded(datasetName = 'faq') {
  await searchEngine.initialize();
}

async function checkDatasetAvailability() {
  return await searchEngine.checkDatasetAvailability();
}

module.exports = { 
  SearchEngine,
  searchEngine,
  findMatchesWithFallback,
  ensureModelLoaded,
  checkDatasetAvailability
};