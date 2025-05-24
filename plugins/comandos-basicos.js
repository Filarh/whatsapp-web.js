/**
 * Plugin de comandos básicos
 */

const { formatearHora, formatearFecha } = require('../utils/helper');

module.exports = (client, config) => {
    const prefijo = config.bot.prefijo;
    
    // Lista de comandos básicos
    const comandos = {
        // Comando ping
        'ping': (message) => {
            message.reply('pong');
        },
        
        // Comando de saludo
        'hola': async (message) => {
            const contact = await message.getContact();
            message.reply(`¡Hola ${contact.pushname || 'amigo/a'}! ¿Cómo estás? 👋`);
        },
        
        // Comando para mostrar la hora actual
        'hora': (message) => {
            const hora = formatearHora();
            message.reply(`La hora actual es: ${hora}`);
        },
        
        // Comando para mostrar la fecha actual
        'fecha': (message) => {
            const fecha = formatearFecha();
            message.reply(`Hoy es ${fecha}`);
        },
        
        // Comando de eco que repite el mensaje
        'eco': (message, args) => {
            const texto = args.join(' ');
            if (texto) {
                message.reply(texto);
            } else {
                message.reply('¡Eco! Debes escribir algo después del comando. Ejemplo: !eco hola');
            }
        },
        
        // Comando info para mostrar información
        'info': async (message) => {
            const chat = await message.getChat();
            const contact = await message.getContact();
            
            let infoMsg = '';
            
            if (chat.isGroup) {
                infoMsg = `*Información del grupo*
📝 Nombre: ${chat.name}
👥 Participantes: ${chat.participants.length}
📅 Creado: ${chat.createdAt ? chat.createdAt.toLocaleString() : 'Desconocido'}`;
            } else {
                infoMsg = `*Información del chat*
👤 Nombre: ${contact.pushname || 'Desconocido'}
📱 Número: ${contact.number}`;
            }
            
            message.reply(infoMsg);
        },

        // Comando ayuda para mostrar los comandos disponibles
        'ayuda': async (message) => {
            const contact = await message.getContact();
            console.log(`Solicitud de ayuda de: ${contact.number}`);
            const listaComandos = Object.keys(comandos).map(cmd => `• ${prefijo}${cmd}`).join('\n');
            message.reply(`📌 *Comandos disponibles:*\n${listaComandos}`);
        }
    };
    
    // Registrar handler para escuchar mensajes
    client.on('message', async (message) => {
        // Ignorar mensajes propios
        if (message.fromMe) return;
        
        // Solo procesar comandos que empiecen con el prefijo
        if (!message.body.startsWith(prefijo)) return;
        
        // Extraer el comando y los argumentos
        const args = message.body.slice(prefijo.length).trim().split(/ +/);
        const comando = args.shift().toLowerCase();
        
        // Verificar si existe el comando en nuestra lista
        if (comandos[comando]) {
            try {
                // Ejecutar el comando
                await comandos[comando](message, args);
            } catch (error) {
                console.error(`Error en comando ${comando}:`, error);
                message.reply(config.cliente.respuestas.error);
            }
        }
    });
    
    // Retornar metadatos del plugin
    return {
        nombre: 'Comandos Básicos',
        descripcion: 'Proporciona comandos básicos: ping, hola, hora, fecha, eco, info, ayuda',
        version: '1.0.0',
        comandos: Object.keys(comandos).map(cmd => `${prefijo}${cmd}`)
    };
};
