'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config/ai');
const Logger = require('./logger');
const TemplateManager = require('./template');

const userHistories = new Map();
let chatSession = null;

// Función para escribir el último prompt al archivo de log
function logLastPrompt(prompt, userId) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `
=== PROMPT LOG - ${timestamp} ===
Usuario: ${userId}
Longitud: ${prompt.length} caracteres
Contenido:
${prompt}
${'='.repeat(80)}

`;
    
    const logPath = path.join(process.cwd(), 'last_prompt.txt');
    fs.appendFileSync(logPath, logEntry, 'utf8');
  } catch (error) {
    Logger.warn('Llama', `No se pudo escribir al log de prompts: ${error.message}`);
  }
}

// Función para formatear el contexto RAG de manera más eficiente
function formatRAGContext(contexto) {
  if (!contexto || typeof contexto !== 'string') return '';
  
  // Extraer solo la parte del contexto que contiene la información relevante
  const contextMatch = contexto.match(/(?:context|contexto):\s*(.+)/is);
  if (contextMatch) {
    return contextMatch[1].trim();
  }
  
  return contexto.trim();
}

// Función para formatear el historial de manera más compacta
function formatConversationHistory(history, maxEntries = 3) {
  if (!history || history.length === 0) return '';
  
  // Tomar solo las últimas entradas para mantener el contexto relevante
  const recentHistory = history.slice(-maxEntries);
  
  return recentHistory.map(entry => {
    const role = entry.role === 'user' ? 'usuario' : 'asistente';
    const content = entry.content.trim();
    return `${role}: ${content}`;
  }).join(' ');
}

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

  // Gestionar historial de usuario
  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }

  const history = userHistories.get(userId);
  const cleanUserPrompt = userPrompt.trim();
  
  // Agregar la consulta actual al historial
  history.push({ role: 'user', content: cleanUserPrompt });

  // Mantener solo las últimas 4 interacciones para eficiencia
  const maxHistoryLength = 8; // 4 pares user/assistant
  if (history.length > maxHistoryLength) {
    history.splice(0, history.length - maxHistoryLength);
  }

  // Formatear contexto RAG
  const formattedContext = formatRAGContext(contexto);
  
  // Formatear historial de conversación
  const conversationHistory = formatConversationHistory(history.slice(0, -1), 2); // Excluir la consulta actual

  // Construir prompt optimizado
  let promptParts = [];
  
  // Agregar contexto si existe
  if (formattedContext) {
    promptParts.push(`contexto: ${formattedContext}`);
  }
  
  // Agregar historial de conversación si existe
  if (conversationHistory) {
    promptParts.push(`conversación previa: ${conversationHistory}`);
  }
  
  // Agregar la consulta actual
  promptParts.push(`usuario: ${cleanUserPrompt}`);
  
  // Indicador para la respuesta
  promptParts.push('asistente:');

  const finalPrompt = promptParts.join(' ');

  // Log del prompt generado
  logLastPrompt(finalPrompt, userId);
  Logger.info('Llama', `Prompt optimizado generado (${finalPrompt.length} chars)`);

  // Generar respuesta
  const response = await chatSession.prompt(finalPrompt, {
    maxTokens: config.model.maxTokens,
    temperature: config.model.temperature,
    topP: 0.95,
    stop: ['\n\n', 'usuario:', 'asistente:']
  });

  // Limpiar respuesta
  const cleanResponse = response.trim().replace(/^asistente:\s*/i, '');
  
  // Agregar respuesta al historial
  history.push({ role: 'assistant', content: cleanResponse });

  return cleanResponse;
}

function resetConversation(userId = null) {
  if (userId) {
    userHistories.set(userId, []);
    Logger.info('Llama', `Historial reseteado para usuario: ${userId}`);
  } else {
    userHistories.clear();
    Logger.info('Llama', 'Todos los historiales reseteados');
  }
}

// Función para obtener estadísticas del historial
function getHistoryStats() {
  const stats = {
    totalUsers: userHistories.size,
    totalMessages: 0,
    avgMessagesPerUser: 0
  };

  for (const [userId, history] of userHistories) {
    stats.totalMessages += history.length;
  }

  if (stats.totalUsers > 0) {
    stats.avgMessagesPerUser = Math.round(stats.totalMessages / stats.totalUsers);
  }

  return stats;
}

module.exports = { 
  initModel, 
  generateResponse, 
  resetConversation, 
  getHistoryStats 
};