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
    console.log('[Plugin IA] Modelos cargados correctamente');
  } catch (err) {
    console.error('[Plugin IA] Error inicializando:', err);
    return;
  }

  const estadoConversacion = {
    ultimaConsulta: null,
    contextoActual: []
  };

  // Genera contexto enriquecido a partir de coincidencias
  function construirContexto(coincidencias) {
    if (!coincidencias.length) {
      return 'CONOCIMIENTO RELEVANTE:\n(No se encontraron datos específicos. Utiliza tu conocimiento general para responder.)';
    }

    // Extrae puntos clave sin duplicados
    const ideasUnicas = new Set();
    const ideas = coincidencias
      .map(match => match.output.replace(/\s+/g, ' ').trim())
      .filter(idea => {
        // Elimina ideas duplicadas o muy similares
        const esNueva = !Array.from(ideasUnicas).some(existente => 
          embedding.textSimilarity(idea, existente) > 0.85
        );
        if (esNueva) ideasUnicas.add(idea);
        return esNueva;
      })
      .map(idea => `- ${idea}`);

    return `CONOCIMIENTO RELEVANTE (incorpora estas ideas de forma natural sin citarlas directamente):\n${ideas.join('\n')}`;
  }

  // Evalúa si la respuesta es relevante para la consulta
  async function evaluarRelevancia(consulta, respuesta, contextosUsados) {
    const similaridadDirecta = await embedding.cosineEmbeddingSimilarity(consulta, respuesta);
    console.log(`[Plugin IA] Similitud consulta/respuesta: ${similaridadDirecta.toFixed(4)}`);

    // También verificamos similitud con el contexto usado
    for (const contexto of contextosUsados) {
      const simCtx = await embedding.cosineEmbeddingSimilarity(respuesta, contexto.output);
      console.log(`[Plugin IA] Similitud con contexto "${contexto.text.substring(0, 30)}...": ${simCtx.toFixed(4)}`);
      if (simCtx >= 0.48) return true;
    }

    // Si hay alta similitud con la consulta, se considera relevante
    return similaridadDirecta >= 0.42;
  }

  // Obtiene coincidencias semánticas y léxicas combinadas
  async function obtenerCoincidencias(consulta, umbral = 0.42, limite = 4) {
    // Busca coincidencias por input (pregunta similar)
    const coincidenciasInput = await embedding.findMultipleMatches(consulta, umbral, limite);
    
    // Busca coincidencias por output (respuesta similar)
    const coincidenciasOutput = await embedding.findReverseMatches(consulta, umbral, limite);
    
    // Busca coincidencias por palabras clave
    const palabrasClave = extraerPalabrasClave(consulta);
    const coincidenciasKeyword = palabrasClave.length > 0 
      ? await embedding.findByKeywords(palabrasClave, limite) 
      : [];

    // Combina, elimina duplicados y ordena por relevancia
    const todasCoincidencias = [...coincidenciasInput, ...coincidenciasOutput, ...coincidenciasKeyword];
    const combinadasUnicas = Array.from(
      new Map(todasCoincidencias.map(item => [item.id || item.text, item])).values()
    ).sort((a, b) => b.similarity - a.similarity);

    // Mantén el contexto de conversación
    if (estadoConversacion.contextoActual.length > 0) {
      // Añade contexto previo con menor peso
      return [
        ...combinadasUnicas.slice(0, limite - 1),
        ...estadoConversacion.contextoActual.slice(0, 1)
      ].slice(0, limite);
    }

    return combinadasUnicas.slice(0, limite);
  }

  // Extrae palabras clave significativas de la consulta
  function extraerPalabrasClave(texto) {
    // Elimina palabras comunes y conserva sustantivos/verbos importantes
    const stopwords = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'a', 'ante', 'bajo', 'con', 'de', 'desde', 'en', 'entre', 'hacia', 'hasta', 'para', 'por', 'según', 'sin', 'sobre', 'tras'];
    
    return texto
      .toLowerCase()
      .replace(/[^\w\sáéíóúüñ]/g, '')
      .split(/\s+/)
      .filter(palabra => 
        palabra.length > 3 && !stopwords.includes(palabra)
      );
  }

  // Procesa el mensaje y genera respuesta
  async function procesarMensaje(msg) {
  const texto = msg.body.trim();

  try {
    const textoActual = texto;

    // Detecta cambio de intención para resetear contexto si es necesario
    const hayCambioDeIntencion = await embedding.hasIntentChanged(
      estadoConversacion.ultimaConsulta,
      textoActual
    );

    if (hayCambioDeIntencion) {
      console.log('[Plugin IA] Cambio de intención detectado — actualizando contexto');
      await llama.resetConversation();
      estadoConversacion.contextoActual = [];
    }

    console.log(`[Plugin IA] Procesando: "${textoActual}"`);
    let coincidencias = await obtenerCoincidencias(textoActual);

    // Razonamiento intermedio si hay contexto anterior y pregunta implícita
    if (
      textoActual.length < 30 &&
      estadoConversacion.ultimaConsulta &&
      estadoConversacion.ultimaConsulta !== textoActual
    ) {
      const resumenPrompt = `
Extrae los conceptos clave o intenciones implícitas que relacionan estas dos frases.
Devuelve solo palabras clave útiles para buscar una respuesta:

1. "${estadoConversacion.ultimaConsulta}"
2. "${textoActual}"
`.trim();

      const conceptosClave = await llama.generateResponse(resumenPrompt, {
        maxTokens: 30,
        temperature: 0.2,
        stop: ['\n']
      });

      const claves = conceptosClave
        .toLowerCase()
        .replace(/[^\w\sáéíóúüñ]/g, '')
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 2);

      console.log('[Plugin IA] Palabras clave inferidas para búsqueda:', claves);

      // Buscar respuestas directas en el dataset
      if (claves.length > 0) {
        const coincidenciasInferidas = await embedding.findByKeywords(claves, 3);

        for (const match of coincidenciasInferidas) {
          const relevancia = await embedding.cosineEmbeddingSimilarity(textoActual, match.output);
          console.log(`[Plugin IA] Relevancia de respuesta directa "${match.output.substring(0, 40)}..." = ${relevancia.toFixed(4)}`);

          if (relevancia > 0.65) {
            console.log('[Plugin IA] Respuesta encontrada por razonamiento implícito — eliminando contexto previo');
            estadoConversacion.contextoActual = [];
            estadoConversacion.ultimaConsulta = textoActual;
            await llama.resetConversation(); // Limpia sesión anterior
            await msg.reply(match.output);
            return;
          }
        }

        // Si no se encuentra una respuesta sólida, añadimos igual al conjunto de coincidencias
        coincidencias.push(...coincidenciasInferidas.filter(
          c => !coincidencias.some(x => x.id === c.id)
        ));
      }
    }

    // Actualiza el último texto una vez que el paso intermedio ha sido evaluado
    estadoConversacion.ultimaConsulta = textoActual;

    coincidencias.forEach((m, i) => {
      const origen = m.origin || 'input';
      const textoCorto = m.text.length > 35 ? `${m.text.substring(0, 32)}...` : m.text;
      console.log(`[Plugin IA] Coincidencia ${i + 1} [${origen}]: "${textoCorto}" (${m.similarity.toFixed(4)})`);
    });

    const contextoTemporal = construirContexto(coincidencias);

    const respuesta = await llama.generateResponse(textoActual, {
      maxTokens: 180,
      temperature: 0.7,
      stop: ['\n\n', 'Usuario:', 'Asistente:']
    }, contextoTemporal);

    const esRelevante = await evaluarRelevancia(textoActual, respuesta, coincidencias);

    if (esRelevante) {
      estadoConversacion.contextoActual = coincidencias.slice(0, 2);
      await msg.reply(respuesta);
    } else if (coincidencias.length > 0) {
      estadoConversacion.contextoActual = [coincidencias[0]];
      await msg.reply(coincidencias[0].output);
    } else {
      await msg.reply('Lo siento, no tengo información específica sobre eso. ¿Puedes preguntar de otra manera o consultar por alguno de nuestros productos y servicios?');
    }

  } catch (err) {
    console.error('[Plugin IA] Error procesando mensaje:', err);
    await msg.reply('Disculpa, hubo un problema al procesar tu consulta.');
  }
}


  // Escucha mensajes entrantes
  client.on('message_create', async msg => {
    if (!msg.body || msg.fromMe) return;
    const texto = msg.body.trim();
    if (texto.length < 4) return;

    // Detecta si es una consulta para procesar
    const patronConsulta = /\?|^(donde|cómo|cuál|qué|quien|cuando|cuanto|tienen|venden|hay|hacen|y|entonces)/i;
    if (patronConsulta.test(texto)) {
      await procesarMensaje(msg);
    }
  });

  return {
    nombre: 'MyKey IA',
    descripcion: 'Asistente IA con razonamiento contextual mejorado',
    version: '5.0.0',
    comandos: ['ia']
  };
};