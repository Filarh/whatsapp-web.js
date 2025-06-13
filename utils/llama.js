'use strict';

const config = require('../config/ai'); // 👈 aseguras que toma el correcto

const Logger = require('./logger');

const userHistories = new Map();
const INSTRUCTIONS = `
Eres MyKey, asistente especializado de Marce's Key Shop. Ayudas con:
- Información sobre llaves, cerraduras, copias y servicios
- Precios y disponibilidad de productos
- Ubicaciones y horarios de sucursales
- Recomendaciones técnicas de cerrajería

ESTILO: Máximo 2-3 oraciones claras y directas, lenguaje simple, tono amigable pero profesional.
`.trim();

let chatSession = null;

async function initModel() {
  Logger.info('Llama', `Inicializando modelo en ${config.model.path}`);

  const { getLlama, LlamaChatSession } = await import('node-llama-cpp');
  const llama = await getLlama();
  const model = await llama.loadModel({
    modelPath: config.model.path,
    nCtx: config.model.maxContext,
    seed: 42,
    nGpuLayers: 0,
    backend: 'cpu'
  });

  const context = await model.createContext();
  chatSession = new LlamaChatSession({
    contextSequence: context.getSequence(),
    contextSize: config.model.maxContext
  });

  Logger.info('Llama', 'Modelo cargado y listo');
}

async function generateResponse(userPrompt, contexto = '', userId = 'global') {
  if (!chatSession) throw new Error('Modelo no inicializado');

  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }

  const history = userHistories.get(userId);
  history.push({ role: 'user', content: userPrompt.trim() });

  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }

  const historyText = history.map(entry => 
    `${entry.role === 'user' ? 'Usuario' : 'Asistente'}: ${entry.content}`
  ).join('\n');

  const fullPrompt = [
    INSTRUCTIONS,
    contexto,
    historyText,
    'Asistente:'
  ].filter(Boolean).join('\n\n');

  Logger.info('Llama', `Prompt generado (${fullPrompt.length} chars)`);

  const response = await chatSession.prompt(fullPrompt, {
    maxTokens: config.model.maxTokens,
    temperature: config.model.temperature,
    topP: 0.95,
    stop: ['\n\n', 'Usuario:', 'Asistente:']
  });

  const cleanResponse = response.trim().replace(/^Asistente:\s*/i, '');
  history.push({ role: 'assistant', content: cleanResponse });

  return cleanResponse;
}

function resetConversation(userId = null) {
  if (userId) {
    userHistories.set(userId, []);
  } else {
    userHistories.clear();
  }
}

module.exports = { initModel, generateResponse, resetConversation };