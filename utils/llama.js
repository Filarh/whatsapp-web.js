'use strict';

let chatSession = null;
let sessionHistory = [];

const BASE_INSTRUCTIONS = `
Eres MyKey, el asistente IA oficial de Marce's Key Shop, una tienda especializada en llaves, cerraduras y servicios relacionados.

INSTRUCCIONES:
- Responde de forma concisa, útil y conversacional (máximo 3 frases).
- Utiliza el conocimiento proporcionado como base, pero no lo repitas literalmente.
- Parafrasea y contextualiza la información para que sea natural.
- Si no tienes información suficiente, responde con lo que sabes sin inventar datos específicos.
- Si la consulta no está relacionada con productos o servicios de cerrajería, responde amablemente que solo puedes ayudar con temas de Marce's Key Shop.
- Mantén un tono amable y profesional.
`.trim();

const MAX_HISTORY_TURNS = 5;
const MAX_CONTEXT_LENGTH = 512;

/**
 * Inicializa el modelo LLM para chat
 * @param {string} modelPath - Ruta al archivo del modelo
 */
async function initModel(modelPath) {
  console.log('[Llama] Inicializando modelo en', modelPath);

  try {
    const llamaModule = await import('node-llama-cpp');
    const { getLlama, LlamaChatSession } = llamaModule;

    const llama = await getLlama();
    const model = await llama.loadModel({
      modelPath,
      nCtx: MAX_CONTEXT_LENGTH,
      seed: 42,
      nGpuLayers: 0,
      gpuOffload: false,
      useMlock: false,
      backend: 'cpu'
    });

    const context = await model.createContext();
    chatSession = new LlamaChatSession({ 
      contextSequence: context.getSequence(),
      contextSize: MAX_CONTEXT_LENGTH
    });

    sessionHistory = [];
    console.log('[Llama] Modelo cargado y listo');
  } catch (error) {
    console.error('[Llama] Error al inicializar el modelo:', error);
    throw error;
  }
}

/**
 * Genera una respuesta basada en el prompt del usuario y contexto
 * @param {string} userPrompt - Prompt del usuario
 * @param {Object} opts - Opciones de generación
 * @param {string} contextoTemporal - Contexto adicional para la consulta
 * @returns {string} - Respuesta generada
 */
async function generateResponse(userPrompt, opts = {}, contextoTemporal = '') {
  if (!chatSession) throw new Error('El modelo no está inicializado');

  // Añade la consulta actual al historial
  sessionHistory.push({ role: 'user', content: userPrompt.trim() });

  // Limita el historial para evitar superar el contexto
  if (sessionHistory.length > MAX_HISTORY_TURNS * 2) {
    sessionHistory = sessionHistory.slice(-MAX_HISTORY_TURNS * 2);
  }

  // Construye el historial de conversación optimizado
  const historyText = sessionHistory
    .map((entry, index) => {
      // Evita repetir prefijos si ya están en el contenido
      const content = entry.content
        .replace(/^Usuario:|^Asistente:/i, '')
        .trim();
      
      // Solo agrega prefijos si no es el último mensaje (que será el prompt)
      const isLastUserMessage = entry.role === 'user' && 
                               index === sessionHistory.length - 1;
      
      if (isLastUserMessage) {
        return `Usuario: ${content}`;
      } else if (entry.role === 'user') {
        return `Usuario: ${content}`;
      } else {
        return `Asistente: ${content}`;
      }
    })
    .join('\n');

  // Componentes del prompt final
  const components = [
    BASE_INSTRUCTIONS,
    contextoTemporal.trim(),
    historyText,
    'Asistente:'
  ].filter(Boolean); // Elimina componentes vacíos
  
  // Construye el prompt final
  const fullPrompt = components.join('\n\n');
  
  // Versión simplificada del log para evitar salida excesiva en consola
  const promptPreview = fullPrompt.length > 200 
    ? fullPrompt.substring(0, 197) + '...' 
    : fullPrompt;
  console.log(`[Llama] Prompt generado (${fullPrompt.length} caracteres):\n`, promptPreview);

  // Opciones predeterminadas
  const defaultOpts = {
    maxTokens: 150,
    temperature: 0.7,
    topP: 0.95,
    stop: ['\n\n', 'Usuario:', 'INSTRUCCIONES:']
  };

  // Combina opciones predeterminadas con las proporcionadas
  const mergedOpts = { ...defaultOpts, ...opts };

  // Genera respuesta
  const response = await chatSession.prompt(fullPrompt, mergedOpts);
  
  // Limpia la respuesta
  const cleanResponse = response
    .trim()
    .replace(/^Asistente:\s*/i, ''); // Elimina prefijo si existe
  
  // Añade la respuesta al historial
  sessionHistory.push({ role: 'assistant', content: cleanResponse });

  return cleanResponse;
}

/**
 * Reinicia la conversación actual
 */
async function resetConversation() {
  sessionHistory = [];
  console.log('[Llama] Conversación reiniciada');
}

module.exports = {
  initModel,
  generateResponse,
  resetConversation
};