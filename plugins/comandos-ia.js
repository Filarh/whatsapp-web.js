'use strict';

const path = require('path');
const llama = require('../utils/llama');
const embedding = require('../utils/embedding');

module.exports = async function (client, config) {
  if (!config.plugins.ia) return;

  try {
    const modeloPath = path.join(__dirname, '../models/qwq-0.5b-distilled_and_uncensored.gguf');
    await llama.initModel(modeloPath);
    await embedding.ensureModelLoaded();
    await embedding.findClosestMatch('test');
    console.log('[Plugin IA] Modelos cargados correctamente');
  } catch (err) {
    console.error('[Plugin IA] Error inicializando:', err);
    return;
  }

  const estadoConversacion = {
    ultimaConsulta: null
  };

  // Genera ideas clave a partir de coincidencias (input y output)
  function construirContextoTemporal(coincidencias) {
    if (coincidencias.length === 0) {
      return `CONOCIMIENTO RELEVANTE:\n(No se encontraron datos útiles. Usa tu criterio para responder.)`;
    }

    const ideas = coincidencias.map(match => {
      const idea = match.output
        .replace(/\s+/g, ' ')
        .trim();

      return `- ${idea}`;
    });

    return `CONOCIMIENTO RELEVANTE (usa estas ideas como base, pero no repitas literal):\n${ideas.join('\n')}`;
  }

  async function verificarRelevancia(consulta, respuesta, contextosUsados) {
    const embConsulta = await embedding.generateEmbedding(consulta);
    const embRespuesta = await embedding.generateEmbedding(respuesta);
    const sim = embedding.cosineSimilarity(embConsulta, embRespuesta);
    console.log(`[Plugin IA] Similitud consulta/respuesta: ${sim.toFixed(4)}`);

    for (const contexto of contextosUsados) {
      const simCtx = await embedding.cosineEmbeddingSimilarity(respuesta, contexto.output);
      console.log(`[Plugin IA] Similitud con contexto "${contexto.text}": ${simCtx.toFixed(4)}`);
      if (simCtx >= 0.50) return true;
    }

    return sim >= 0.45;
  }

  async function encontrarCoincidenciasCombinadas(consulta, umbral = 0.45, limite = 3) {
    const coincidenciasInput = await embedding.findMultipleMatches(consulta, umbral, limite);
    const coincidenciasOutput = await embedding.findReverseMatches(consulta, umbral, limite);

    const combinadas = [...coincidenciasInput, ...coincidenciasOutput]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limite);

    return combinadas;
  }

  client.on('message_create', async msg => {
    if (!msg.body || msg.fromMe) return;
    const texto = msg.body.trim();
    if (texto.length < 4) return;

    const esConsulta = texto.includes('?') || /^(donde|cómo|cuál|qué|quien|cuando|cuanto|tienen|venden|hay|hacen|y|entonces)/i.test(texto);
    if (!esConsulta) return;

    try {
      const cambio = await embedding.hasIntentChanged(estadoConversacion.ultimaConsulta, texto);
      if (cambio) {
        console.log('[Plugin IA] Cambio de intención detectado — reiniciando contexto...');
        await llama.resetConversation();
      }
      estadoConversacion.ultimaConsulta = texto;

      console.log(`[Plugin IA] Procesando: "${texto}"`);
      const coincidencias = await encontrarCoincidenciasCombinadas(texto);

      coincidencias.forEach((m, i) =>
        console.log(`[Plugin IA] Coincidencia ${i + 1} [${m.origin || 'input'}]: "${m.text}" (${m.similarity.toFixed(4)})`)
      );

      const contextoTemporal = construirContextoTemporal(coincidencias);

      const respuesta = await llama.generateResponse(texto, {
        maxTokens: 150,
        temperature: 0.7,
        stop: ['\n\n']
      }, contextoTemporal);

      const esRelevante = await verificarRelevancia(texto, respuesta, coincidencias);

      if (esRelevante) {
        await msg.reply(respuesta);
      } else if (coincidencias.length > 0) {
        await msg.reply(coincidencias[0].output);
      } else {
        await msg.reply('Lo siento, no tengo información suficiente sobre eso. ¿Puedes ser más específico o preguntar sobre nuestros productos y servicios?');
      }

    } catch (err) {
      console.error('[Plugin IA] Error procesando mensaje:', err);
      await msg.reply('Hubo un error al procesar tu mensaje.');
    }
  });

  return {
    nombre: 'MyKey IA',
    descripcion: 'Asistente IA con razonamiento contextual por coincidencia directa e inversa',
    version: '4.3.1',
    comandos: ['ia']
  };
};
