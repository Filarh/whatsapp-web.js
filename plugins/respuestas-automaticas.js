/**
 * Plugin de respuestas automáticas
 */

const { contienePalabraClave } = require('../utils/helper');

module.exports = (client, config) => {
    // Definir patrones de respuestas automáticas
    const respuestas = [
        {
            palabrasClave: ['buenos días', 'buen día', 'buen dia'],
            respuesta: '¡Buenos días! ¿En qué puedo ayudarte hoy?'
        },
        {
            palabrasClave: ['buenas tardes'],
            respuesta: '¡Buenas tardes! ¿Cómo va tu día?'
        },
        {
            palabrasClave: ['buenas noches'],
            respuesta: '¡Buenas noches! Que descanses.'
        },
        {
            palabrasClave: ['gracias', 'te lo agradezco', 'muchas gracias'],
            respuesta: '¡De nada! Estoy aquí para ayudar. 😊'
        },
        {
            palabrasClave: ['cómo estás', 'como estas', 'cómo te encuentras'],
            respuesta: 'Estoy funcionando correctamente, gracias por preguntar. ¿En qué puedo ayudarte?'
        },
        {
            palabrasClave: ['ayuda', 'necesito ayuda', 'puedes ayudarme'],
            respuesta: `Claro, estoy aquí para ayudarte. Puedes usar el comando ${config.bot.prefijo}ayuda para ver la lista de comandos disponibles.`
        }
    ];
    
    // Registrar handler para escuchar mensajes
    client.on('message', async (message) => {
        // Ignorar mensajes propios
        if (message.fromMe) return;
        
        // Ignorar comandos (mensajes que empiezan con el prefijo)
        if (message.body.startsWith(config.bot.prefijo)) return;
        
        // Obtener el texto del mensaje
        const texto = message.body;
        
        // Revisar cada patrón de respuesta
        for (const patron of respuestas) {
            if (contienePalabraClave(texto, patron.palabrasClave)) {
                // Obtener chat para verificar si está en silencio
                const chat = await message.getChat();
                
                // Marcar como visto
                await chat.sendSeen();
                
                // Esperar un momento para que parezca natural
                setTimeout(() => {
                    message.reply(patron.respuesta);
                }, 1000 + Math.random() * 2000); // Entre 1 y 3 segundos
                
                // Romper el bucle tras la primera coincidencia
                break;
            }
        }
    });
    
    // Retornar metadatos del plugin
    return {
        nombre: 'Respuestas Automáticas',
        descripcion: 'Responde automáticamente a ciertos patrones de mensaje',
        version: '1.0.0',
        patrones: respuestas.map(r => r.palabrasClave.join(', '))
    };
}; 