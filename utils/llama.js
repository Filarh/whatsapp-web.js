'use strict';

const config = require('../config/ai');
const Logger = require('./logger');
const TemplateManager = require('./template');

const userHistories = new Map();
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

  const companyInfo = TemplateManager.getCompanyInfo();
  Logger.info('Llama', `Modelo cargado para ${companyInfo.company.name}`);
}

async function generateResponse(userPrompt, contexto = '', userId = 'global') {
  if (!chatSession) throw new Error('Modelo no inicializado');

  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }

  const history = userHistories.get(userId);
  history.push({ role: 'user', content: userPrompt.trim() });

  const conversationConfig = TemplateManager.promptData.conversation;
  if (history.length > conversationConfig.max_history) {
    history.splice(0, history.length - conversationConfig.max_history);
  }

  // Formatear historial usando el template
  const historyText = history.map(entry => 
    TemplateManager.replaceVars(conversationConfig.history_format, {
      role: entry.role === 'user' ? conversationConfig.roles.user : conversationConfig.roles.assistant,
      content: entry.content
    })
  ).join('\n');

  // Obtener instrucciones del sistema desde el template
  const instructions = TemplateManager.getSystemPrompt();

  const fullPrompt = [
    instructions,
    contexto,
    historyText,
    `${conversationConfig.roles.assistant}:`
  ].filter(Boolean).join('\n\n');

  Logger.info('Llama', `Prompt generado (${fullPrompt.length} chars)`);

  const response = await chatSession.prompt(fullPrompt, {
    maxTokens: config.model.maxTokens,
    temperature: config.model.temperature,
    topP: 0.95,
    stop: ['\n\n', `${conversationConfig.roles.user}:`, `${conversationConfig.roles.assistant}:`]
  });

  const cleanResponse = response.trim().replace(
    new RegExp(`^${conversationConfig.roles.assistant}:\\s*`, 'i'), 
    ''
  );
  
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