'use strict';

const path = require('path');

let getLlama, LlamaChatSession;
(async () => {
  const llamaModule = await import('node-llama-cpp');
  getLlama = llamaModule.getLlama;
  LlamaChatSession = llamaModule.LlamaChatSession;
})();

const MAX_CONTEXT_MSGS = 5;
const MAX_CONTEXT_LENGTH = 512;
const MODEL_PATH = 'C:\\Users\\mcpal\\Desktop\\Emilio\\whatsapp-web.js\\models\\qwen2.5-mks.gguf';

let chatSession = null;
const userHistories = new Map();

// 👉 Cambia esto para permitir más números o desactivar el filtro
const ALLOWED_NUMBERS = new Set([
  '593964001175@c.us',
]);

function extractFocusKeywords(text) {
  const stopwords = ['que', 'cuánto', 'cuál', 'cómo', 'tienen', 'vale', 'hay', 'la', 'el', 'de', 'en', 'marca', 'color', 'precio'];
  return text
    .toLowerCase()
    .split(/[\s\?¿,\.]+/)
    .filter(w => w && !stopwords.includes(w));
}

function shouldSoftReset(currentText, recentMsgs = []) {
  const focusNow = extractFocusKeywords(currentText);
  const focusBefore = extractFocusKeywords(recentMsgs.join(' '));
  const overlap = focusNow.filter(k => focusBefore.includes(k));
  return overlap.length === 0 && recentMsgs.length >= 4;
}

async function waitForLlamaModule() {
  while (!getLlama || !LlamaChatSession) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function initModel() {
  await waitForLlamaModule();

  const llama = await getLlama();
  const model = await llama.loadModel({
    modelPath: MODEL_PATH,
    nCtx: MAX_CONTEXT_LENGTH,
    seed: 42,
    nGpuLayers: 0,
    gpuOffload: false,
    useMlock: false,
    backend: 'cpu',
  });

  const context = await model.createContext();
  chatSession = new LlamaChatSession({
    contextSequence: context.getSequence(),
    contextSize: MAX_CONTEXT_LENGTH,
  });

  console.log('[Plugin IA] Modelo GGUF cargado y listo');
}

async function generateResponse(texto, userId = 'global') {
  if (!chatSession) throw new Error('Modelo no inicializado');

  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }

  const history = userHistories.get(userId);
  history.push({ role: 'user', content: texto.trim() });

  if (history.length > MAX_CONTEXT_MSGS * 2) {
    history.splice(0, history.length - MAX_CONTEXT_MSGS * 2);
  }

  const prompt = history.map(entry =>
    (entry.role === 'user' ? `Usuario: ` : `Asistente: `) + entry.content.trim()
  ).join('\n') + '\nAsistente:';

  const respuesta = await chatSession.prompt(prompt, {
    maxTokens: 150,
    temperature: 0.7,
    topP: 0.95,
    stop: ['\n\n', 'Usuario:', 'Asistente:']
  });

  const clean = respuesta.trim().replace(/^Asistente:\s*/i, '');
  history.push({ role: 'assistant', content: clean });
  return clean;
}

module.exports = async function (client, config) {
  if (!config.plugins.ia) return;

  try {
    await initModel();
  } catch (err) {
    console.error('[Plugin IA] Error inicializando modelo:', err);
    return;
  }

  client.on('message_create', async msg => {
    if (!msg.body || msg.fromMe) return;

    // Solo permitir mensajes del número autorizado
    if (!ALLOWED_NUMBERS.has(msg.from)) {
      return; // Ignora el mensaje
    }

    const texto = msg.body.trim();
    if (!texto) return;

    const userId = msg.from;
    console.log(`[Plugin IA] Recibido de ${userId}: "${texto}"`);

    try {
      if (!Array.isArray(userHistories.get(userId))) {
        userHistories.set(userId, []);
      }

      const history = userHistories.get(userId);
      const debeReiniciar = shouldSoftReset(texto, history.map(e => e.content));
      if (debeReiniciar) {
        console.log(`[Plugin IA] Reseteo suave para ${userId}`);
        userHistories.set(userId, []);
      }

      const respuesta = await generateResponse(texto, userId);
      await msg.reply(respuesta || 'No tengo una respuesta clara.');
    } catch (err) {
      console.error('[Plugin IA] Error procesando mensaje:', err);
      await msg.reply('Ocurrió un error al procesar tu mensaje.');
    }
  });

  return {
    nombre: 'MyKey IA (fluido)',
    descripcion: 'Asistente IA sin restricciones de formato, contexto adaptativo',
    version: '6.1.3',
    comandos: ['ia']
  };
};
