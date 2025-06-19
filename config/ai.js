'use strict';

const path = require('path');

const config = {
  bot: {
    authorizedNumber: process.env.AUTHORIZED_NUMBER || '593964001175@c.us'
  },
  
  rag: {
    maxMatches: parseInt(process.env.RAG_MAX_MATCHES) || 5,
    minSimilarity: parseFloat(process.env.RAG_MIN_SIMILARITY) || 0.3,
    contextBoostThreshold: parseFloat(process.env.RAG_CONTEXT_BOOST_THRESHOLD) || 0.7,
    maxContextLength: parseInt(process.env.RAG_MAX_CONTEXT_LENGTH) || 800,
    debugMode: process.env.RAG_DEBUG_MODE === 'true',
    // Umbral mínimo para considerar que una búsqueda fue exitosa
    fallbackThreshold: parseFloat(process.env.RAG_FALLBACK_THRESHOLD) || 0.6
  },

  model: {
    path: path.resolve(process.env.MODEL_PATH || './models/Phi-3-mini-4k-instruct-q4.gguf'),
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS) || 120,
    temperature: parseFloat(process.env.MODEL_TEMPERATURE) || 0.6,
    maxContext: parseInt(process.env.MODEL_MAX_CONTEXT) || 512
  },

  // Configuración de datasets con prioridades y fallbacks
  dataSets: {
    precios: { 
      baseName: 'precios',
      priority: 1, // Mayor prioridad para consultas de precios
      description: 'Información específica de precios y tarifas'
    },
    productos: { 
      baseName: 'productos',
      priority: 2, // Segunda prioridad
      description: 'Catálogo de productos y características'
    },
    servicios: { 
      baseName: 'servicios',
      priority: 3, // Tercera prioridad
      description: 'Información de servicios disponibles'
    },
    faq: { 
      baseName: process.env.FAQ_DATASET_NAME || 'faq_mini_2',
      priority: 99, // Siempre como fallback principal
      description: 'Base de conocimiento general (FAQ)',
      isRequired: true // Este dataset debe existir siempre
    }
  },

  // Mapeo de intenciones a datasets (en orden de preferencia)
  intentionMapping: {
    precio: ['precios', 'productos', 'faq'],
    producto: ['productos', 'precios', 'faq'],
    servicio: ['servicios', 'faq'],
    urgente: ['faq'],
    ubicacion: ['faq'],
    horario: ['faq'],
    general: ['faq']
  },

  // Directorios base
  dirs: {
    data: path.resolve('./data'),
    faiss: path.resolve('./.faiss'),
    models: path.resolve(process.env.MODELS_DIR || './models')
  },

  embedding: {
    model: process.env.EMBEDDING_MODEL || 'Allenbv/mks-similarity-onnx',
    modelsDir: path.resolve(process.env.MODELS_DIR || './models')
  }
};

// Función para resolver automáticamente las rutas de un dataset
function resolveDatasetPaths(baseName) {
  const fs = require('fs');
  
  // Crear directorio .faiss si no existe
  if (!fs.existsSync(config.dirs.faiss)) {
    fs.mkdirSync(config.dirs.faiss, { recursive: true });
  }

  return {
    jsonlFile: path.join(config.dirs.data, `${baseName}.jsonl`),
    indexFile: path.join(config.dirs.faiss, `${baseName}.index`),
    idsFile: path.join(config.dirs.faiss, `${baseName}.ids.json`),
    outputsFile: path.join(config.dirs.faiss, `${baseName}.outputs.json`),
    hashFile: path.join(config.dirs.faiss, `${baseName}.hash`)
  };
}

// Función helper para obtener las rutas de un dataset específico
function getDatasetPaths(datasetName) {
  const dataset = config.dataSets[datasetName];
  if (!dataset) {
    throw new Error(`Dataset '${datasetName}' no encontrado en la configuración`);
  }
  return resolveDatasetPaths(dataset.baseName);
}

// Función para determinar el mejor dataset según intenciones detectadas
function getBestDatasetForQuery(queryAnalysis) {
  // Encontrar la intención más específica (que no sea general)
  const detectedIntentions = Object.entries(queryAnalysis)
    .filter(([key, value]) => value === true && key !== 'general')
    .map(([key]) => key);

  // Si no hay intenciones específicas, usar general
  if (detectedIntentions.length === 0) {
    return config.intentionMapping.general;
  }

  // Tomar la primera intención detectada y obtener su mapeo
  const primaryIntention = detectedIntentions[0];
  return config.intentionMapping[primaryIntention] || config.intentionMapping.general;
}

// Mantener compatibilidad con el código existente
config.data = getDatasetPaths('faq');

module.exports = {
  ...config,
  resolveDatasetPaths,
  getDatasetPaths,
  getBestDatasetForQuery
};