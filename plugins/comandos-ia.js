'use strict';

const config = require('../config/ai');
const Logger = require('../utils/logger');
const llama = require('../utils/llama');
const TemplateManager = require('../utils/template');
const { searchEngine } = require('../utils/embedding_search');

// Análisis de consultas usando el template manager
function analyzeQuery(text) {
  return TemplateManager.analyzeQuery(text);
}

function buildIntelligentContext(searchResults) {
  const { matches, usedDataset, attemptedDatasets, fallbackReason, formattedResults } = searchResults;
  
  if (!matches.length) {
    return {
      context: TemplateManager.getFallback('no_data'),
      stats: { 
        total: 0, 
        highQuality: 0, 
        avgSimilarity: 0, 
        usedDataset: null,
        attemptedDatasets,
        fallbackReason,
        strategy: searchResults.strategy
      }
    };
  }

  const highQuality = matches.filter(m => m.similarity >= config.rag.contextBoostThreshold);
  const avgSimilarity = matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length;

  let contextParts = [];
  const templates = TemplateManager.promptData.response_templates;
  
  // Si hay resultados formateados (como lista de productos), usar esos
  if (formattedResults) {
    contextParts.push("INSTRUCCIÓN ESPECIAL: El usuario ha hecho una consulta que requiere mostrar múltiples productos o información estructurada.");
    
    if (formattedResults.type === 'product_list') {
      contextParts.push("FORMATO REQUERIDO: Presenta los productos de manera organizada y amigable, agrupados por categoría si es posible.");
      contextParts.push("PRODUCTOS ENCONTRADOS:");
      
      for (const [category, products] of Object.entries(formattedResults.categories)) {
        contextParts.push(`\n**${category}:**`);
        products.slice(0, 8).forEach((product, index) => {
          if (product.nombre) {
            let productLine = `${index + 1}. ${product.nombre}`;
            if (product.codigo) productLine += ` (Código: ${product.codigo})`;
            if (product.marca) productLine += ` - Marca: ${product.marca}`;
            if (product.precio) productLine += ` - Precio: $${product.precio}`;
            contextParts.push(productLine);
          } else if (product.contenido) {
            contextParts.push(`${index + 1}. ${product.contenido}`);
          }
        });
      }
      
      contextParts.push(`\nTotal de productos encontrados: ${formattedResults.totalProducts}`);
      contextParts.push("IMPORTANTE: Presenta esta información de manera conversacional y amigable, no como datos técnicos.");
    }
  } else {
    // Contexto tradicional para búsquedas específicas
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
  }

  const finalContext = contextParts.join('\n').substring(0, config.rag.maxContextLength);
  const contextPrefix = TemplateManager.promptData.system_prompts.context_prefix;
  
  return {
    context: `${contextPrefix}\n${finalContext}`,
    stats: {
      total: matches.length,
      highQuality: highQuality.length,
      avgSimilarity: Math.round(avgSimilarity * 100) / 100,
      usedDataset,
      attemptedDatasets,
      fallbackReason,
      strategy: searchResults.strategy
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
  Logger.info('Plugin IA', `🚀 Inicializando RAG Pro para ${companyInfo.company.name}...`);

  try {
    // Inicializar LLM
    await llama.initModel();
    Logger.info('Plugin IA', '✅ Modelo LLM inicializado');
    
    // Inicializar motor de búsqueda
    await searchEngine.initialize();
    Logger.info('Plugin IA', '✅ Motor de búsqueda inicializado');
    
  } catch (err) {
    Logger.error('Plugin IA', '💥 Error crítico inicializando sistema RAG', err);
    return;
  }

  // Debug de mensajes
  client.on('message_create', async msg => {
    if (config.rag.debugMode) {
      console.log('[DEBUG] Mensaje recibido:', {
        from: msg.from,
        body: msg.body,
        fromMe: msg.fromMe
      });
    }
  });

  client.on('message_create', async msg => {
    // Usar número autorizado del template
    const NUMERO_AUTORIZADO = config.bot.authorizedNumber;
    if (!msg.body || msg.fromMe || msg.from !== NUMERO_AUTORIZADO) return;

    const query = msg.body.trim();
    if (!query || query.length < 3) return;

    const startTime = Date.now();
    
    try {
      console.log('[DEBUG IA] 🔄 Procesando consulta para', companyInfo.company.name);

      // 1. Análizar consulta e intenciones
      const queryAnalysis = analyzeQuery(query);
      const detectedIntentions = Object.entries(queryAnalysis)
        .filter(([key, value]) => value === true)
        .map(([key]) => key);
      
      Logger.ragDebug('consulta', { consulta: query, analisis: queryAnalysis, intenciones: detectedIntentions });

      // 2. Determinar prioridad de datasets basado en intenciones
      const datasetPriorities = config.getBestDatasetForQuery(queryAnalysis);
      Logger.info('Embedding', `🎯 Intenciones detectadas: [${detectedIntentions.join(', ')}] → Prioridad de datasets: [${datasetPriorities.join(' → ')}]`);

      // 3. Búsqueda inteligente con estrategias avanzadas
      const searchResults = await searchEngine.intelligentSearch(query, datasetPriorities, queryAnalysis);
      
      // Log detallado de la búsqueda
      if (searchResults.usedDataset) {
        Logger.info('Embedding', `✅ Respuesta derivada desde dataset '${searchResults.usedDataset}' con ${searchResults.matches.length} matches usando estrategia '${searchResults.strategy}'`);
      } else {
        Logger.warn('Embedding', `⚠️ No se pudieron obtener resultados de ningún dataset. Datasets intentados: [${searchResults.attemptedDatasets.join(', ')}]`);
      }

      if (searchResults.fallbackReason && searchResults.attemptedDatasets.length > 1) {
        Logger.info('Embedding', `🔄 Razón de fallback: ${searchResults.fallbackReason}`);
      }

      Logger.ragDebug('busqueda', { searchResults });

      // 4. Construir contexto inteligente
      const { context, stats } = buildIntelligentContext(searchResults);
      Logger.ragDebug('contexto', { context: context.substring(0, 200) + '...', stats });

      // 5. Generar respuesta usando LLM
      let response = await llama.generateResponse(query, context, msg.from);

      // 6. Validar y usar fallback si es necesario
      const isValid = validateResponse(response, query);
      let fallbackType = null;

      if (!isValid) {
        if (searchResults.formattedResults) {
          // Si tenemos resultados formateados (como lista de productos), usar el formateador del template
          response = TemplateManager.formatProductResponse(searchResults.formattedResults, query);
          fallbackType = 'formatted_results';
        } else if (searchResults.matches.length > 0 && searchResults.matches[0].similarity > 0.6) {
          response = searchResults.matches[0].output.trim();
          fallbackType = 'mejor_coincidencia';
        } else {
          response = TemplateManager.getQueryFallback(queryAnalysis);
          fallbackType = 'fallback_inteligente';
        }
      }

      const processingTime = Date.now() - startTime;
      
      // Log final con información completa
      Logger.ragDebug('respuesta', { 
        respuesta: response.substring(0, 100) + '...', 
        esValida: isValid && !fallbackType, 
        fallback: !!fallbackType,
        tipoFallback: fallbackType,
        datasetUsado: stats.usedDataset,
        datasetsIntentados: stats.attemptedDatasets,
        estrategia: stats.strategy
      });

      const processingMsg = `🤖 Consulta procesada en ${processingTime}ms usando dataset '${stats.usedDataset || 'ninguno'}' con estrategia '${stats.strategy}' (intentados: ${stats.attemptedDatasets.join(', ')})`;
      Logger.info('Plugin IA', processingMsg);
      
      await msg.reply(response);

    } catch (err) {
      Logger.ragDebug('error', { error: err.message, stack: err.stack });
      Logger.error('Plugin IA', `💥 Error procesando consulta: ${err.message}`);
      const errorMsg = TemplateManager.getFallback('error');
      await msg.reply(errorMsg);
    }
  });

  return {
    nombre: `${companyInfo.company.displayName} RAG Pro`,
    descripcion: `Sistema RAG avanzado para ${companyInfo.company.name}`,
    version: '12.0.0',
    comandos: ['ia']
  };
};