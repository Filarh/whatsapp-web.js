'use strict';

const config = require('../config/ai');
const Logger = require('../utils/logger');
const llama = require('../utils/llama');
const embedding = require('../utils/embedding');
const TemplateManager = require('../utils/template');

// Análisis de consultas usando patrones del template
function analyzeQuery(text) {
  const patterns = TemplateManager.getQueryPatterns();
  const analysis = {};
  
  for (const [key, pattern] of Object.entries(patterns)) {
    analysis[key] = pattern.test(text);
  }
  
  return analysis;
}

function buildIntelligentContext(matches = []) {
  if (!matches.length) {
    return {
      context: TemplateManager.getFallback('no_data'),
      stats: { total: 0, highQuality: 0, avgSimilarity: 0 }
    };
  }

  const highQuality = matches.filter(m => m.similarity >= config.rag.contextBoostThreshold);
  const avgSimilarity = matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length;

  let contextParts = [];
  const templates = TemplateManager.promptData.response_templates;
  
  if (highQuality.length > 0) {
    contextParts.push(templates.high_quality_context);
    highQuality.forEach((m, i) => {
      contextParts.push(`${i + 1}. ${m.output.trim()}`);
    });
  } else {
    contextParts.push(templates.additional_context);
    matches.slice(0, 3).forEach(m => {
      contextParts.push(`- ${m.output.trim()}`);
    });
  }

  const finalContext = contextParts.join('\n').substring(0, config.rag.maxContextLength);
  const contextPrefix = TemplateManager.promptData.system_prompts.context_prefix;
  
  return {
    context: `${contextPrefix}\n${finalContext}`,
    stats: {
      total: matches.length,
      highQuality: highQuality.length,
      avgSimilarity: Math.round(avgSimilarity * 100) / 100
    }
  };
}

function validateResponse(response, query) {
  if (!response || typeof response !== 'string') return false;
  
  const validationConfig = TemplateManager.getValidationConfig();
  const clean = response.trim().toLowerCase();
  
  // Verificar patrones inválidos
  const invalidPatterns = validationConfig.invalid_patterns.map(p => new RegExp(p, 'i'));
  const hasInvalidPattern = invalidPatterns.some(pattern => pattern.test(clean));
  
  return !hasInvalidPattern &&
         clean.length >= validationConfig.min_length &&
         response.length <= validationConfig.max_length;
}

module.exports = async function (client, pluginConfig) {
  if (!pluginConfig.plugins.ia) return;

  const companyInfo = TemplateManager.getCompanyInfo();
  Logger.info('Plugin IA', `Inicializando RAG para ${companyInfo.company.name}...`);

  try {
    await llama.initModel();
    await embedding.ensureModelLoaded();
    Logger.info('Plugin IA', '✅ Modelos cargados correctamente');
  } catch (err) {
    Logger.error('Plugin IA', 'Error inicializando modelos', err);
    return;
  }

  client.on('message_create', async msg => {
    console.log('[DEBUG] Mensaje recibido:', {
      from: msg.from,
      body: msg.body,
      fromMe: msg.fromMe
    });
  });

  client.on('message_create', async msg => {
    // Usar número autorizado del template
    const NUMERO_AUTORIZADO = companyInfo.contact.whatsapp;
    if (!msg.body || msg.fromMe || msg.from !== NUMERO_AUTORIZADO) return;

    const query = msg.body.trim();
    if (!query || query.length < 3) return;

    const startTime = Date.now();
    
    try {
      console.log('[DEBUG IA] Procesando consulta para', companyInfo.company.name);

      // 1. Analizar consulta
      const queryAnalysis = analyzeQuery(query);
      Logger.ragDebug('consulta', { consulta: query, analisis: queryAnalysis });

      // 2. Búsqueda RAG
      const matches = await embedding.findMultipleMatches(query);
      Logger.ragDebug('busqueda', { matches });

      // 3. Construir contexto inteligente
      const { context, stats } = buildIntelligentContext(matches);
      Logger.ragDebug('contexto', { context, stats });

      // 4. Generar respuesta
      let response = await llama.generateResponse(query, context, msg.from);

      // 5. Validar y usar fallback si es necesario
      const isValid = validateResponse(response, query);
      let fallbackType = null;

      if (!isValid) {
        if (matches.length > 0 && matches[0].similarity > 0.6) {
          response = matches[0].output.trim();
          fallbackType = 'mejor_coincidencia';
        } else {
          response = TemplateManager.getQueryFallback(queryAnalysis);
          fallbackType = 'fallback_inteligente';
        }
      }

      const processingTime = Date.now() - startTime;
      Logger.ragDebug('respuesta', { 
        respuesta: response, 
        esValida: isValid && !fallbackType, 
        fallback: !!fallbackType,
        tipoFallback: fallbackType 
      });

      const processingMsg = TemplateManager.replaceVars(
        TemplateManager.promptData.response_templates.processing_info,
        { time: processingTime }
      );
      Logger.info('Plugin IA', processingMsg);
      
      await msg.reply(response);

    } catch (err) {
      Logger.ragDebug('error', { error: err });
      const errorMsg = TemplateManager.getFallback('error');
      await msg.reply(errorMsg);
    }
  });

  return {
    nombre: `${companyInfo.company.displayName} RAG Pro`,
    descripcion: `Sistema RAG avanzado para ${companyInfo.company.name}`,
    version: '9.0.0',
    comandos: ['ia']
  };
};