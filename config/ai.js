  //config/index.js
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
      debugMode: process.env.RAG_DEBUG_MODE === 'true'
    },

    model: {
      path: path.resolve(process.env.MODEL_PATH || './models/Phi-3-mini-4k-instruct-q4.gguf'),
      maxTokens: parseInt(process.env.MODEL_MAX_TOKENS) || 120,
      temperature: parseFloat(process.env.MODEL_TEMPERATURE) || 0.6,
      maxContext: parseInt(process.env.MODEL_MAX_CONTEXT) || 512
    },

    data: {
      jsonlFile: path.resolve(process.env.DATA_JSONL_FILE || './models/faq_mini_2.jsonl'),
      indexFile: path.resolve(process.env.DATA_INDEX_FILE || './models/faq_mini_2.index'),
      idsFile: path.resolve(process.env.DATA_IDS_FILE || './models/faq_mini_2.ids.json'),
      outputsFile: path.resolve(process.env.DATA_OUTPUTS_FILE || './models/faq_mini_2.outputs.json'),
      hashFile: path.resolve(process.env.DATA_HASH_FILE || './models/faq_mini_2.hash')
    },

    embedding: {
      model: process.env.EMBEDDING_MODEL || 'Allenbv/mks-similarity-onnx',
      modelsDir: path.resolve(process.env.MODELS_DIR || './models')
    }
  };

  module.exports = config;