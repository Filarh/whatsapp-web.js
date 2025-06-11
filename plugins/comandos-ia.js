'use strict';

const path = require('path');
const llama = require('../utils/llama');
const embedding = require('../utils/embedding');

// SOLO permitir este número durante pruebas
const NUMERO_AUTORIZADO = '593964001175@c.us';

// Configuración del RAG
const RAG_CONFIG = {
  maxMatches: 5,
  minSimilarity: 0.3,
  contextBoostThreshold: 0.7, // Para dar más peso a coincidencias muy buenas
  maxContextLength: 800,
  debugMode: true // Cambiar a false en producción
};

// Instrucciones mejoradas con más contexto específico
const INSTRUCCIONES_BASE = `
Eres MyKey, asistente especializado de Marce's Key Shop. Ayudas con:
- Información sobre llaves, cerraduras, copias y servicios
- Precios y disponibilidad de productos
- Ubicaciones y horarios de sucursales
- Recomendaciones técnicas de cerrajería

ESTILO DE RESPUESTA:
- Máximo 2-3 oraciones claras y directas
- Usa un lenguaje simple y accesible
- No menciones que eres IA ni cites el contexto literalmente
- Si no tienes información específica, ofrece ayuda general relacionada
- Mantén tono amigable pero profesional
`.trim();

/**
 * Construye contexto inteligente priorizando las mejores coincidencias
 */
function construirContextoInteligente(matches = [], query = '') {
  if (!matches.length) {
    return {
      contexto: 'No se encontraron datos específicos en la base de conocimiento.',
      stats: { total: 0, highQuality: 0, avgSimilarity: 0 }
    };
  }

  // Separar coincidencias por calidad
  const highQuality = matches.filter(m => m.similarity >= RAG_CONFIG.contextBoostThreshold);
  const regularQuality = matches.filter(m => m.similarity < RAG_CONFIG.contextBoostThreshold);
  
  const avgSimilarity = matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length;

  // Construir contexto priorizando calidad
  let contextoParts = [];
  
  if (highQuality.length > 0) {
    contextoParts.push('Información más relevante:');
    highQuality.forEach((m, i) => {
      contextoParts.push(`${i + 1}. ${m.output.trim()}`);
    });
  }
  
  if (regularQuality.length > 0 && contextoParts.length < 3) {
    if (contextoParts.length > 0) contextoParts.push('\nInformación adicional:');
    regularQuality.slice(0, 3 - contextoParts.length + 1).forEach((m, i) => {
      contextoParts.push(`- ${m.output.trim()}`);
    });
  }

  const contextoFinal = contextoParts.join('\n').substring(0, RAG_CONFIG.maxContextLength);
  
  return {
    contexto: `Contexto relevante (usa como base, no cites literalmente):\n${contextoFinal}`,
    stats: {
      total: matches.length,
      highQuality: highQuality.length,
      avgSimilarity: Math.round(avgSimilarity * 100) / 100
    }
  };
}

/**
 * Detecta patrones en la consulta para personalizar la búsqueda
 */
function analizarConsulta(texto) {
  const patterns = {
    precio: /precio|cuánto|vale|costo|cobran|barato|caro/i,
    ubicacion: /dónde|dirección|ubicación|sucursal|local/i,
    horario: /horario|abren|cierran|hora|cuando/i,
    servicio: /hacen|pueden|servicio|reparan|arreglan/i,
    producto: /llave|cerradura|candado|chapa|copia/i,
    urgente: /urgente|rápido|ya|ahora|emergency/i
  };

  const detected = {};
  for (const [key, pattern] of Object.entries(patterns)) {
    detected[key] = pattern.test(texto);
  }

  return detected;
}

/**
 * Genera respuesta de fallback inteligente basada en el análisis de la consulta
 */
function generarFallbackInteligente(consulta, analisis) {
  if (analisis.precio) {
    return 'Los precios varían según el producto específico. ¿Qué tipo de llave o servicio necesitas? Así te doy información más precisa.';
  }
  
  if (analisis.ubicacion) {
    return 'Tenemos varias sucursales. ¿En qué zona te encuentras? Te indico la más cercana.';
  }
  
  if (analisis.horario) {
    return 'Los horarios pueden variar por sucursal. ¿Te interesa alguna ubicación en particular?';
  }
  
  if (analisis.producto && analisis.urgente) {
    return 'Para servicios urgentes, te recomiendo contactarnos directamente. ¿Qué tipo de emergencia de cerrajería tienes?';
  }
  
  if (analisis.servicio) {
    return 'Ofrecemos diversos servicios de cerrajería. ¿Podrías ser más específico sobre lo que necesitas?';
  }

  return 'Estoy aquí para ayudarte con temas de cerrajería. ¿Podrías darme más detalles sobre lo que buscas?';
}

/**
 * Valida que una respuesta sea útil y coherente
 */
function validarRespuesta(respuesta, consulta) {
  if (!respuesta || typeof respuesta !== 'string') return false;
  
  const textoLimpio = respuesta.trim().toLowerCase();
  
  // Patrones de respuestas inválidas
  const patronesInvalidos = [
    /^(no tengo|lo siento|como ia|no puedo|no estoy)/,
    /^(sorry|i don't|i can't)/,
    /^(disculpa|perdón).*no/,
    /contexto relevante/i, // Si se filtró mal el contexto
  ];

  const esInvalida = patronesInvalidos.some(patron => patron.test(textoLimpio));
  const esMuyCorta = textoLimpio.length < 10;
  const esMuyLarga = respuesta.length > 500;

  return !esInvalida && !esMuyCorta && !esMuyLarga;
}

/**
 * Logger para debugging del RAG
 */
function logRAGProcess(paso, datos) {
  if (!RAG_CONFIG.debugMode) return;
  
  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n[RAG Debug ${timestamp}] === ${paso.toUpperCase()} ===`);
  
  switch (paso) {
    case 'consulta':
      console.log(`📝 Usuario: "${datos.consulta}"`);
      console.log(`🔍 Análisis:`, datos.analisis);
      break;
      
    case 'busqueda':
      console.log(`🎯 Coincidencias encontradas: ${datos.matches.length}`);
      datos.matches.forEach((m, i) => {
        console.log(`  ${i + 1}. [${m.similarity.toFixed(3)}] ID: ${m.id}`);
        console.log(`     Output: "${m.output.substring(0, 80)}${m.output.length > 80 ? '...' : ''}"`);
      });
      break;
      
    case 'contexto':
      console.log(`📊 Stats: ${datos.stats.total} total, ${datos.stats.highQuality} alta calidad, avg: ${datos.stats.avgSimilarity}`);
      console.log(`📋 Contexto (${datos.contexto.length} chars):`);
      console.log(datos.contexto.substring(0, 200) + (datos.contexto.length > 200 ? '...' : ''));
      break;
      
    case 'respuesta':
      console.log(`✅ Respuesta generada (${datos.respuesta.length} chars): "${datos.respuesta}"`);
      console.log(`✔️ Válida: ${datos.esValida}`);
      if (datos.fallback) console.log(`🔄 Usó fallback: ${datos.tipoFallback}`);
      break;
      
    case 'error':
      console.log(`❌ Error: ${datos.error.message}`);
      if (datos.error.stack) console.log(`📍 Stack: ${datos.error.stack.split('\n')[1]}`);
      break;
  }
}

module.exports = async function (client, config) {
  if (!config.plugins.ia) return;

  console.log('[Plugin IA] Inicializando RAG mejorado...');

  try {
    const modeloPath = path.join(__dirname, '../models/Phi-3-mini-4k-instruct-q4.gguf');
    await llama.initModel(modeloPath);
    await embedding.ensureModelLoaded();
    console.log('[Plugin IA] ✅ Modelos cargados correctamente');
  } catch (err) {
    console.error('[Plugin IA] ❌ Error inicializando:', err);
    return;
  }

  client.on('message_create', async msg => {
    if (!msg.body || msg.fromMe) return;
    if (msg.from !== NUMERO_AUTORIZADO) return;

    const consulta = msg.body.trim();
    if (!consulta || consulta.length < 3) return;

    const startTime = Date.now();
    
    try {
      // 1. Analizar consulta
      const analisisConsulta = analizarConsulta(consulta);
      logRAGProcess('consulta', { consulta, analisis: analisisConsulta });

      // 2. Búsqueda RAG
      const matches = await embedding.findMultipleMatches(
        consulta, 
        RAG_CONFIG.maxMatches, 
        RAG_CONFIG.minSimilarity
      );
      logRAGProcess('busqueda', { matches });

      // 3. Construir contexto inteligente
      const { contexto, stats } = construirContextoInteligente(matches, consulta);
      logRAGProcess('contexto', { contexto, stats });

      // 4. Generar respuesta
      const instruccionesFinal = `${INSTRUCCIONES_BASE}\n\n${contexto}`;
      let respuesta = await llama.generateResponse(
        consulta,
        { maxTokens: 120, temperature: 0.6 }, // Más conservador para respuestas consistentes
        instruccionesFinal,
        msg.from
      );

      // 5. Validar y usar fallback si es necesario
      const esValida = validarRespuesta(respuesta, consulta);
      let tipoFallback = null;

      if (!esValida) {
        // Intentar con la mejor coincidencia directa
        if (matches.length > 0 && matches[0].similarity > 0.6) {
          respuesta = matches[0].output.trim();
          tipoFallback = 'mejor_coincidencia';
        } else {
          // Fallback inteligente
          respuesta = generarFallbackInteligente(consulta, analisisConsulta);
          tipoFallback = 'fallback_inteligente';
        }
      }

      const processingTime = Date.now() - startTime;
      logRAGProcess('respuesta', { 
        respuesta, 
        esValida: esValida && !tipoFallback, 
        fallback: !!tipoFallback,
        tipoFallback 
      });

      console.log(`[Plugin IA] ⚡ Procesado en ${processingTime}ms\n`);
      
      await msg.reply(respuesta);

    } catch (err) {
      logRAGProcess('error', { error: err });
      await msg.reply('Disculpa, hubo un problema técnico. ¿Podrías intentar de nuevo?');
    }
  });

  return {
    nombre: 'MyKey RAG Pro',
    descripcion: 'Sistema RAG avanzado con debugging y contexto inteligente',
    version: '7.0.0',
    comandos: ['ia'],
    config: RAG_CONFIG
  };
};