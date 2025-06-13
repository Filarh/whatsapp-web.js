'use strict';

const config = require('../config/ai');
const Logger = require('../utils/logger');
const llama = require('../utils/llama');
const embedding = require('../utils/embedding');

// Análisis de consultas
const QUERY_PATTERNS = {
  precio: /precio|cuánto|vale|costo|cobran|barato|caro/i,
  ubicacion: /dónde|dirección|ubicación|sucursal|local/i,
  horario: /horario|abren|cierran|hora|cuando/i,
  servicio: /hacen|pueden|servicio|reparan|arreglan/i,
  producto: /llave|cerradura|candado|chapa|copia/i,
  urgente: /urgente|rápido|ya|ahora|emergency/i
};

function analyzeQuery(text) {
  const analysis = {};
  for (const [key, pattern] of Object.entries(QUERY_PATTERNS)) {
    analysis[key] = pattern.test(text);
  }
  return analysis;
}

function buildIntelligentContext(matches = []) {
  if (!matches.length) {
    return {
      context: 'No se encontraron datos específicos en la base de conocimiento.',
      stats: { total: 0, highQuality: 0, avgSimilarity: 0 }
    };
  }

  const highQuality = matches.filter(m => m.similarity >= config.rag.contextBoostThreshold);
  const avgSimilarity = matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length;

  let contextParts = [];
  
  if (highQuality.length > 0) {
    contextParts.push('Información más relevante:');
    highQuality.forEach((m, i) => {
      contextParts.push(`${i + 1}. ${m.output.trim()}`);
    });
  } else {
    contextParts.push('Información adicional:');
    matches.slice(0, 3).forEach(m => {
      contextParts.push(`- ${m.output.trim()}`);
    });
  }

  const finalContext = contextParts.join('\n').substring(0, config.rag.maxContextLength);
  
  return {
    context: `Contexto relevante (usa como base, no cites literalmente):\n${finalContext}`,
    stats: {
      total: matches.length,
      highQuality: highQuality.length,
      avgSimilarity: Math.round(avgSimilarity * 100) / 100
    }
  };
}

function generateSmartFallback(query, analysis) {
  if (analysis.precio) {
    return 'Los precios varían según el producto específico. ¿Qué tipo de llave o servicio necesitas?';
  }
  if (analysis.ubicacion) {
    return 'Tenemos varias sucursales. ¿En qué zona te encuentras? Te indico la más cercana.';
  }
  if (analysis.horario) {
    return 'Los horarios pueden variar por sucursal. ¿Te interesa alguna ubicación en particular?';
  }
  if (analysis.producto && analysis.urgente) {
    return 'Para servicios urgentes, te recomiendo contactarnos directamente. ¿Qué tipo de emergencia tienes?';
  }
  return 'Estoy aquí para ayudarte con temas de cerrajería. ¿Podrías darme más detalles?';
}

function validateResponse(response, query) {
  if (!response || typeof response !== 'string') return false;
  
  const clean = response.trim().toLowerCase();
  const invalidPatterns = [
    /^(no tengo|lo siento|como ia|no puedo)/,
    /contexto relevante/i
  ];

  return !invalidPatterns.some(pattern => pattern.test(clean)) &&
         clean.length >= 10 &&
         response.length <= 500;
}

module.exports = async function (client, pluginConfig) {
  if (!pluginConfig.plugins.ia) return;

  Logger.info('Plugin IA', 'Inicializando RAG mejorado...');

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
    const NUMERO_AUTORIZADO = '593964001175@c.us';
    if (!msg.body || msg.fromMe || msg.from !== NUMERO_AUTORIZADO) return;

    const query = msg.body.trim();
    if (!query || query.length < 3) return;

    const startTime = Date.now();
    
    try {
      console.log('[DEBUG IA] Entró al handler IA');

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
          response = generateSmartFallback(query, queryAnalysis);
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

      Logger.info('Plugin IA', `⚡ Procesado en ${processingTime}ms`);
      
      await msg.reply(response);

    } catch (err) {
      Logger.ragDebug('error', { error: err });
      await msg.reply('Disculpa, hubo un problema técnico. ¿Podrías intentar de nuevo?');
    }
  });

  return {
    nombre: 'MyKey RAG Pro',
    descripcion: 'Sistema RAG avanzado con configuración externa',
    version: '8.0.0',
    comandos: ['ia']
  };
};