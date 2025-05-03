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
    contextoPermanente: [],
    contextoTemporal: [],
    conversacionActual: [],
    contextosInvalidos: new Set() // Trackea contextos rechazados/inválidos
  };

  // Genera contexto enriquecido a partir de coincidencias
  function construirContexto(coincidencias) {
    // Filtra contextos previamente marcados como inválidos
    const coincidenciasFiltradas = coincidencias.filter(match => 
      !estadoConversacion.contextosInvalidos.has(match.id || match.text)
    );
    
    if (!coincidenciasFiltradas.length) {
      return 'CONOCIMIENTO RELEVANTE:\n(No se encontraron datos específicos. Utiliza tu conocimiento general para responder.)';
    }

    // Extrae puntos clave sin duplicados
    const ideasUnicas = new Set();
    const ideas = coincidenciasFiltradas
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

  // Extrae palabras clave y entidades del contexto y la consulta actual
  async function extraerElementosClaveContextual(consulta) {
    // Si es una consulta corta/simple, extraemos directamente sin análisis complejo
    if (consulta.split(/\s+/).length <= 3 && !estadoConversacion.conversacionActual.length) {
      return extraerPalabrasClave(consulta);
    }
    
    // Para consultas más complejas o con contexto, usamos análisis avanzado
    const conversacionReciente = estadoConversacion.conversacionActual
      .slice(-4)
      .join('\n');
    
    const promptAnalisis = `
      Analiza esta conversación y extrae 3-5 palabras clave para búsqueda:
      
      ${conversacionReciente}
      Usuario: ${consulta}
      
      Palabras clave:`;
    
    const analisis = await llama.generateResponse(promptAnalisis, {
      maxTokens: 30,
      temperature: 0.2,
      stop: ['\n', 'Usuario:', 'Asistente:']
    });
    
    console.log(`[Plugin IA] Análisis contextual: "${analisis.trim()}"`);
    
    // Limpiamos y filtramos
    return analisis
      .toLowerCase()
      .replace(/palabras clave:?/i, '')
      .split(/[,\s]+/)
      .map(palabra => palabra.trim())
      .filter(palabra => palabra.length > 2);
  }

  // Detecta si el texto contiene patrones de respuestas censurables o incompletas
  function esContenidoInvalido(texto) {
    const patronesInvalidos = [
      /^No tenemos atención/i,
      /^Cada vez que te sientes/i,
      /^Lo siento, no puedo/i,
      /^No puedo proporcionar/i,
      /^No estoy autorizado/i,
      /^Como modelo de IA/i
    ];
    
    return patronesInvalidos.some(patron => patron.test(texto));
  }

  // Verifica si una coincidencia debe ser descartada por ser irrelevante o inconsistente
  function coincidenciaInvalida(coincidencia, consulta) {
    // Si el contenido de la respuesta contiene patrones de censura
    if (esContenidoInvalido(coincidencia.output)) {
      return true;
    }
    
    // Si contiene información de contacto pero la consulta es sobre personal
    if (/teléfono|email|whatsapp|sucursal/i.test(coincidencia.output) && 
        /quien|quién|trabaja|personal/i.test(consulta)) {
      return true;
    }
    
    return false;
  }

  // Evalúa si la respuesta es relevante y apropiada para la consulta
  async function evaluarRespuesta(consulta, respuesta, contextosUsados) {
    // Detecta si la respuesta contiene patrones de censura o mensajes genéricos
    if (esContenidoInvalido(respuesta)) {
      console.log('[Plugin IA] Detectada respuesta inválida o censurada');
      return false;
    }
    
    // Si la respuesta es demasiado similar a la consulta (repetición)
    const consultaLimpia = consulta.toLowerCase().replace(/[¿?.,!¡]/g, '').trim();
    const respuestaLimpia = respuesta.toLowerCase().replace(/^(hola|buenas),?\s*/i, '').trim();
    if (respuestaLimpia.includes(consultaLimpia) && consultaLimpia.length > 10) {
      console.log('[Plugin IA] Detectada respuesta que repite la consulta');
      return false;
    }
    
    // Verifica relevancia semántica
    const similaridadDirecta = await embedding.cosineEmbeddingSimilarity(consulta, respuesta);
    console.log(`[Plugin IA] Similitud consulta/respuesta: ${similaridadDirecta.toFixed(4)}`);
    
    // Verifica que la respuesta contiene información sustancial
    const tieneInfoConcreta = 
      (/\d+|\$|precio|valor|[a-z]+ (es|son|está|trabaja)/i.test(respuesta)) ||
      (similaridadDirecta >= 0.45);
    
    return tieneInfoConcreta;
  }

  // Obtiene coincidencias relevantes para la consulta
  async function obtenerCoincidencias(consulta, palabrasClave = [], umbral = 0.42, limite = 4) {
    // Expandimos palabras clave para consultas específicas
    let clavesProcesadas = [...palabrasClave];
    
    // Para consultas sobre precios
    if (/cuanto|cuánto|valor|precio|costo|valen|cobran/i.test(consulta)) {
      clavesProcesadas.push('precio', 'valor', 'costo');
    }
    
    // Para consultas sobre personal
    if (/quien|quién|trabaja|personal/i.test(consulta)) {
      clavesProcesadas.push('personal', 'trabaja', 'atención');
      
      // Si menciona ubicación específica, la agregamos
      const ubicaciones = consulta.match(/alcedo|piedrahita|ximena|centro|matriz|rumichaca/gi) || [];
      clavesProcesadas = [...clavesProcesadas, ...ubicaciones];
    }
    
    // Obtenemos coincidencias por diferentes métodos
    const coincidenciasInput = await embedding.findMultipleMatches(consulta, umbral, limite);
    const coincidenciasOutput = await embedding.findReverseMatches(consulta, umbral, limite);
    const coincidenciasKeyword = clavesProcesadas.length > 0 
      ? await embedding.findByKeywords(clavesProcesadas, limite) 
      : [];
    
    // Filtramos contextoPermanente para eliminar contextos invalidados
    const contextoPermanenteFiltrado = estadoConversacion.contextoPermanente.filter(ctx => 
      !estadoConversacion.contextosInvalidos.has(ctx.id || ctx.text)
    );
    
    // Combinamos todas las coincidencias
    const todasCoincidencias = [
      ...coincidenciasInput, 
      ...coincidenciasOutput, 
      ...coincidenciasKeyword,
      ...contextoPermanenteFiltrado
    ];
    
    // Eliminamos duplicados y ordenamos por relevancia
    const coincidenciasUnicas = Array.from(
      new Map(todasCoincidencias.map(item => [item.id || item.text, item])).values()
    );
    
    // Filtramos coincidencias inválidas
    const coincidenciasFiltradas = coincidenciasUnicas
      .filter(coincidencia => !coincidenciaInvalida(coincidencia, consulta))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limite);
    
    return coincidenciasFiltradas;
  }

  // Extrae palabras clave significativas de la consulta
  function extraerPalabrasClave(texto) {
    const stopwords = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'a', 'de', 'en', 'por', 'con', 'para', 'buenas', 'hola', 'saludos'];
    
    return texto
      .toLowerCase()
      .replace(/[^\w\sáéíóúüñ]/g, '')
      .split(/\s+/)
      .filter(palabra => 
        palabra.length > 3 && !stopwords.includes(palabra)
      );
  }

  // Determina si debemos preservar el contexto para consultas futuras
  function debePreservarContexto(consulta, respuesta) {
    // No preservamos contexto si la respuesta es inválida
    if (esContenidoInvalido(respuesta)) return false;
    
    // Detecta si hay entidades específicas que debemos recordar
    const patronesPreservar = [
      /llave|cerradura|modelo|marca|tipo/i,
      /alcedo|piedrahita|ximena|matriz|centro/i,
      /g[eé]nesis|personal|trabaja/i,
      /precio|valor|costo/i
    ];
    
    return patronesPreservar.some(patron => 
      patron.test(consulta) || patron.test(respuesta)
    );
  }

  // Genera una respuesta de respaldo cuando no hay coincidencias
  async function generarRespuestaRespaldo(consulta) {
    // Para consultas sobre personal
    if (/quien|quién|trabaja|personal/i.test(consulta)) {
      // Si menciona Alcedo específicamente
      if (/alcedo/i.test(consulta)) {
        return 'En nuestra sucursal de Alcedo contamos con personal especializado en cerrajería. Para cualquier consulta específica sobre nuestro equipo, puedes contactarnos directamente a la tienda.';
      }
      
      return 'Contamos con personal especializado en cada una de nuestras sucursales. ¿Necesitas información sobre alguna ubicación específica?';
    }
    
    // Para consultas sobre precios
    if (/cuanto|cuánto|valor|precio|costo|valen|cobran/i.test(consulta)) {
      if (/llave|copia|duplicado/i.test(consulta)) {
        return 'Los precios de llaves varían según el tipo. Las básicas están entre $3-8, las de seguridad desde $10-25, y las electrónicas desde $30. ¿Necesitas información sobre algún modelo específico?';
      }
      
      return 'Los precios varían según el producto específico. ¿Me podrías indicar qué producto te interesa para brindarte información más precisa?';
    }
    
    // Respuesta genérica
    return 'Entiendo tu consulta. Para brindarte información más precisa, ¿podrías darme más detalles sobre lo que necesitas?';
  }

  // Procesa el mensaje y genera respuesta
  async function procesarMensaje(msg) {
    const texto = msg.body.trim();
    
    try {
      // Actualiza el historial de conversación
      estadoConversacion.conversacionActual.push(`Usuario: ${texto}`);
      
      // Evalúa si es un cambio de tema
      const hayCambioDeIntencion = estadoConversacion.ultimaConsulta && 
        await embedding.hasIntentChanged(estadoConversacion.ultimaConsulta, texto);
      
      if (hayCambioDeIntencion) {
        console.log('[Plugin IA] Cambio de intención detectado — actualizando contexto');
        await llama.resetConversation();
        estadoConversacion.contextoPermanente = [];
        estadoConversacion.contextoTemporal = [];
      }
      
      console.log(`[Plugin IA] Procesando: "${texto}"`);
      
      // Extrae elementos clave considerando contexto
      const elementosClave = await extraerElementosClaveContextual(texto);
      console.log(`[Plugin IA] Elementos clave: ${elementosClave.join(', ')}`);
      
      // Obtiene coincidencias relevantes
      const coincidencias = await obtenerCoincidencias(texto, elementosClave);
      
      coincidencias.forEach((m, i) => {
        const textoCorto = m.text.length > 35 ? `${m.text.substring(0, 32)}...` : m.text;
        console.log(`[Plugin IA] Coincidencia ${i + 1}: "${textoCorto}" (${m.similarity.toFixed(4)})`);
      });
      
      // Si no hay coincidencias válidas después del filtrado, generamos respuesta de respaldo
      if (coincidencias.length === 0) {
        const respuestaRespaldo = await generarRespuestaRespaldo(texto);
        estadoConversacion.conversacionActual.push(`Asistente: ${respuestaRespaldo}`);
        estadoConversacion.ultimaConsulta = texto;
        
        await msg.reply(respuestaRespaldo);
        return;
      }
      
      // Construye contexto para el LLM
      const contextoConsulta = construirContexto(coincidencias);
      
      // Instrucciones adicionales para evitar censura y respuestas inválidas
      const instruccionesAdicionales = `
        IMPORTANTE PARA TU RESPUESTA: 
        - Responde de forma directa y concisa (máximo 2-3 frases)
        - Incluye información específica y relevante
        - No menciones que eres una IA ni pidas disculpas por limitaciones
        - Si se pregunta sobre personal, incluye nombres específicos si los conoces
        - Evita respuestas vagas o genéricas
        
        ${contextoConsulta}`;
      
      // Genera respuesta
      const respuesta = await llama.generateResponse(texto, {
        maxTokens: 150,
        temperature: 0.7,
        stop: ['\n\n', 'Usuario:', 'Asistente:']
      }, instruccionesAdicionales);
      
      // Evalúa la calidad de la respuesta
      const respuestaValida = await evaluarRespuesta(texto, respuesta, coincidencias);
      
      // Actualiza estado
      estadoConversacion.ultimaConsulta = texto;
      estadoConversacion.contextoTemporal = coincidencias.slice(0, 2);
      
      let respuestaFinal;
      
      if (respuestaValida) {
        respuestaFinal = respuesta;
        
        // Determina si preservamos contexto
        if (debePreservarContexto(texto, respuesta)) {
          estadoConversacion.contextoPermanente = coincidencias
            .filter(c => !estadoConversacion.contextosInvalidos.has(c.id || c.text))
            .slice(0, 2);
        }
      } else {
        // Si la respuesta generada no es válida, usamos la mejor coincidencia directamente
        console.log('[Plugin IA] Respuesta generada inválida, usando mejor coincidencia');
        
        if (coincidencias.length > 0 && !esContenidoInvalido(coincidencias[0].output)) {
          respuestaFinal = coincidencias[0].output;
        } else {
          // Si también la coincidencia es problemática, usamos respuesta de respaldo
          respuestaFinal = await generarRespuestaRespaldo(texto);
          
          // Marcamos las coincidencias como inválidas para futuras consultas
          coincidencias.forEach(c => {
            if (esContenidoInvalido(c.output)) {
              estadoConversacion.contextosInvalidos.add(c.id || c.text);
              console.log(`[Plugin IA] Marcando coincidencia como inválida: ${c.id || c.text.substring(0, 30)}...`);
            }
          });
        }
      }
      
      // Si detectamos que la respuesta final es inválida, generamos respaldo
      if (esContenidoInvalido(respuestaFinal)) {
        respuestaFinal = await generarRespuestaRespaldo(texto);
      }
      
      // Actualizamos conversación
      estadoConversacion.conversacionActual.push(`Asistente: ${respuestaFinal}`);
      
      // Mantenemos conversación en tamaño razonable
      if (estadoConversacion.conversacionActual.length > 6) {
        estadoConversacion.conversacionActual = estadoConversacion.conversacionActual.slice(-4);
      }
      
      await msg.reply(respuestaFinal);
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
    const patronConsulta = /\?|^(donde|cómo|cuál|qué|quien|cuando|cuanto|cuánto|tienen|venden|hay|hacen|y|entonces)/i;
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