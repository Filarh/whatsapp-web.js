'use strict';

const Logger = require('./logger');
const TemplateManager = require('./template');

let engine = null;
let modelReady = false;

// Configurar WebLLM para Node.js en modo CommonJS
const loadWebLLM = async () => {
    try {
        const webllm = await import('@mlc-ai/web-llm');
        return webllm;
    } catch (error) {
        Logger.error('MiniCPM', '❌ Error importando @mlc-ai/web-llm:', error.message);
        throw error;
    }
};

async function initModel() {
    Logger.info('MiniCPM', 'Inicializando modelo usando WebLLM...');
    
    try {
        const webllm = await loadWebLLM();
        
        // En la nueva API, se usa CreateMLCEngine directamente
        engine = await webllm.CreateMLCEngine('MiniCPM-0.5B-q4f16_1', {
            initProgressCallback: (progress) => {
                const progressText = progress.text || `${(progress.progress * 100).toFixed(1)}%`;
                Logger.info('MiniCPM', `Descarga/Inicialización: ${progressText}`);
            }
        });

        modelReady = true;
        Logger.info('MiniCPM', '✅ Modelo MiniCPM cargado y listo');
        
    } catch (err) {
        Logger.error('MiniCPM', '❌ Error cargando modelo MiniCPM');
        Logger.error('MiniCPM', err.message);
        throw err;
    }
}

async function generateResponse(userPrompt, contexto = '', userId = 'global') {
    if (!modelReady || !engine) {
        throw new Error('Modelo MiniCPM no inicializado');
    }

    const instructions = TemplateManager.getSystemPrompt();
    const messages = [
        { role: 'system', content: instructions },
        ...(contexto ? [{ role: 'system', content: contexto }] : []),
        { role: 'user', content: userPrompt.trim() }
    ];

    Logger.info('MiniCPM', `📨 Enviando mensajes (${messages.map(m => m.role).join(', ')})`);

    try {
        // Usar la nueva API compatible con OpenAI
        const response = await engine.chat.completions.create({
            messages: messages,
            max_tokens: 128,
            temperature: 0.7,
            top_p: 0.95,
            stream: false
        });

        const content = response.choices?.[0]?.message?.content?.trim() || '';
        Logger.info('MiniCPM', `📤 Respuesta recibida (${content.length} caracteres)`);
        
        return content;
        
    } catch (err) {
        Logger.error('MiniCPM', '❌ Error generando respuesta:', err.message);
        return 'Lo siento, hubo un error generando la respuesta.';
    }
}

function resetConversation() {
    Logger.info('MiniCPM', '🔁 Reinicio de contexto (stateless)');
    // WebLLM es stateless por defecto, no necesita reset
}

// Función para limpiar recursos (opcional)
async function cleanup() {
    if (engine) {
        try {
            // Si el engine tiene método cleanup/dispose
            if (typeof engine.dispose === 'function') {
                await engine.dispose();
            }
            engine = null;
            modelReady = false;
            Logger.info('MiniCPM', '🧹 Recursos liberados');
        } catch (err) {
            Logger.error('MiniCPM', '❌ Error limpiando recursos:', err.message);
        }
    }
}

module.exports = {
    initModel,
    generateResponse,
    resetConversation,
    cleanup
};