'use strict';

const userHistories = new Map(); // Historial por usuario

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

let chatSession = null;

/**
 * Inicializa el modelo LLM para chat
 */
async function initModel(modelPath) {
  console.log('[Llama] Inicializando modelo en', modelPath);

  const { getLlama, LlamaChatSession } = await import('node-llama-cpp').then(m => m);
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

  console.log('[Llama] Modelo cargado y listo');
}

/**
 * Genera una respuesta basada en el historial del usuario y el contexto RAG.
 */
async function generateResponse(userPrompt, opts = {}, contextoTemporal = '', userId = 'global') {
  if (!chatSession) throw new Error('El modelo no está inicializado');

  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }

  const history = userHistories.get(userId);
  history.push({ role: 'user', content: userPrompt.trim() });

  // Limita el historial
  if (history.length > MAX_HISTORY_TURNS * 2) {
    history.splice(0, history.length - MAX_HISTORY_TURNS * 2);
  }

  // Construye el historial con formato limpio
  const historyText = history.map(entry => {
    const clean = entry.content.replace(/^Usuario:|^Asistente:/i, '').trim();
    return entry.role === 'user'
      ? `Usuario: ${clean}`
      : `Asistente: ${clean}`;
  }).join('\n');

  // Monta el prompt final
  const components = [
    BASE_INSTRUCTIONS,
    contextoTemporal.trim(),
    historyText,
    'Asistente:'
  ].filter(Boolean);
  const fullPrompt = components.join('\n\n');

  const preview = fullPrompt.length > 300
    ? fullPrompt.slice(0, 297) + '...'
    : fullPrompt;
  console.log(`[Llama] Prompt generado (${fullPrompt.length} chars):\n`, preview);

  const defaultOpts = {
    maxTokens: 150,
    temperature: 0.7,
    topP: 0.95,
    stop: ['\n\n', 'Usuario:', 'Asistente:']  // <--- importante
  };
  

  const merged = { ...defaultOpts, ...opts };

  const out = await chatSession.prompt(fullPrompt, merged);
  const clean = out.trim().replace(/^Asistente:\s*/i, '');

  history.push({ role: 'assistant', content: clean });

  return clean;
}

/**
 * Reinicia el historial de un usuario o todos.
 */
async function resetConversation(userId = null) {
  if (userId && userHistories.has(userId)) {
    userHistories.set(userId, []);
    console.log(`[Llama] Conversación reiniciada para ${userId}`);
  } else {
    userHistories.clear();
    console.log('[Llama] Todas las conversaciones reiniciadas');
  }
}

module.exports = { initModel, generateResponse, resetConversation };
