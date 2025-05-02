'use strict';

let chatSession = null;
let sessionHistory = [];

const BASE_INSTRUCTIONS = `
Eres MyKey, el asistente IA oficial de Marce's Key Shop, una tienda especializada en llaves, cerraduras y servicios relacionados.

INSTRUCCIONES:
- Responde de forma útil, directa y breve (máximo 3 frases).
- Puedes usar el conocimiento proporcionado, pero no lo repitas literalmente.
- Usa tu razonamiento para responder aunque los datos no sean exactos.
- Si la consulta no está relacionada con productos o servicios, responde cortésmente que solo puedes ayudar con temas de Marce's Key Shop.
- Mantén un tono amable y profesional.
`.trim();

const MAX_HISTORY_TURNS = 10;

async function initModel(modelPath) {
  console.log('[Llama] Inicializando modelo en', modelPath);

  const llamaModule = await import('node-llama-cpp');
  const { getLlama, LlamaChatSession } = llamaModule;

  const llama = await getLlama();
  const model = await llama.loadModel({
    modelPath,
    nCtx: 512,
    seed: 42,
    nGpuLayers: 0,
    gpuOffload: false,
    useMlock: false,
    backend: 'cpu'
  });

  const context = await model.createContext();
  chatSession = new LlamaChatSession({ contextSequence: context.getSequence() });

  sessionHistory = [];
  console.log('[Llama] Modelo cargado y listo');
}

async function generateResponse(userPrompt, opts = {}, contextoTemporal = '') {
  if (!chatSession) throw new Error('El modelo no está inicializado');

  sessionHistory.push({ role: 'user', content: userPrompt.trim() });

  if (sessionHistory.length > MAX_HISTORY_TURNS * 2) {
    sessionHistory = sessionHistory.slice(-MAX_HISTORY_TURNS * 2);
  }

  const historyText = sessionHistory.map(entry => {
    const prefix = entry.role === 'user' ? 'Usuario:' : 'Asistente:';
    const content = entry.content.replace(/^Usuario:|^Asistente:/i, '').trim();
    return `${prefix} ${content}`;
  }).filter(Boolean).join('\n');

  const fullPrompt = [
    BASE_INSTRUCTIONS,
    contextoTemporal.trim(),
    historyText,
    'Asistente:'
  ].filter(Boolean).join('\n\n');

  console.log('[Llama] Prompt final generado:\n', fullPrompt);

  const response = await chatSession.prompt(fullPrompt, opts);
  sessionHistory.push({ role: 'assistant', content: response.trim() });

  return response.trim();
}

async function resetConversation() {
  sessionHistory = [];
  console.log('[Llama] Conversación reiniciada');
}

module.exports = {
  initModel,
  generateResponse,
  resetConversation
};
