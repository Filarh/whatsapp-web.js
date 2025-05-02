/**
 * Plugin de comandos multimedia
 */

const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const { crearDirectorio } = require('../utils/helper');

module.exports = (client, config) => {
    const prefijo = config.bot.prefijo;
    const multimediaDir = config.directorios.multimedia;
    
    // Asegurarse que existe el directorio multimedia
    crearDirectorio(multimediaDir);
    
    // Lista de comandos multimedia
    const comandos = {
        // Comando para enviar imagen aleatoria
        'imagen': async (message) => {
            try {
                // Obtener una imagen aleatoria
                const media = await MessageMedia.fromUrl('https://picsum.photos/500/500');
                message.reply(media, null, { caption: 'Aquí tienes una imagen aleatoria' });
            } catch (error) {
                console.error('Error al obtener imagen:', error);
                message.reply('No pude obtener la imagen. Intenta más tarde.');
            }
        },
        
        // Comando para convertir a sticker
        'sticker': async (message) => {
            if (message.hasMedia) {
                try {
                    const media = await message.downloadMedia();
                    message.reply(media, null, { sendMediaAsSticker: true });
                } catch (error) {
                    console.error('Error al crear sticker:', error);
                    message.reply('No pude crear el sticker. Intenta con otra imagen.');
                }
            } else if (message.hasQuotedMsg) {
                const quotedMsg = await message.getQuotedMessage();
                if (quotedMsg.hasMedia) {
                    try {
                        const media = await quotedMsg.downloadMedia();
                        message.reply(media, null, { sendMediaAsSticker: true });
                    } catch (error) {
                        console.error('Error al crear sticker:', error);
                        message.reply('No pude crear el sticker. Intenta con otra imagen.');
                    }
                } else {
                    message.reply('El mensaje citado no contiene una imagen');
                }
            } else {
                message.reply('Para crear un sticker, envía una imagen con el comando o responde a una imagen con el comando');
            }
        },
        
        // Comando para enviar ubicación
        'ubicacion': (message) => {
            message.reply({
                location: { 
                    latitude: 40.416775, 
                    longitude: -3.703790,
                    name: "Madrid, España"
                }
            });
        },
        
        // Comando para guardar imagen recibida
        'guardar': async (message, args) => {
            if (!message.hasMedia) {
                if (message.hasQuotedMsg) {
                    const quotedMsg = await message.getQuotedMessage();
                    if (quotedMsg.hasMedia) {
                        guardarMedia(quotedMsg, message, args[0] || 'imagen');
                    } else {
                        message.reply('El mensaje citado no contiene una imagen o archivo');
                    }
                } else {
                    message.reply('Para guardar un archivo, envía una imagen o archivo con el comando o responde a uno con el comando');
                }
            } else {
                guardarMedia(message, message, args[0] || 'imagen');
            }
        }
    };
    
    // Función auxiliar para guardar archivos multimedia
    async function guardarMedia(mediaMsg, replyMsg, nombreArchivo) {
        try {
            const media = await mediaMsg.downloadMedia();
            if (!media) {
                replyMsg.reply('No pude descargar el archivo');
                return;
            }
            
            // Determinar la extensión según el tipo MIME
            let extension = 'txt';
            
            if (media.mimetype.startsWith('image/')) {
                extension = media.mimetype.split('/')[1];
            } else if (media.mimetype.startsWith('video/')) {
                extension = media.mimetype.split('/')[1];
            } else if (media.mimetype.startsWith('audio/')) {
                extension = media.mimetype.split('/')[1];
            } else if (media.mimetype === 'application/pdf') {
                extension = 'pdf';
            }
            
            // Nombre de archivo seguro (eliminar caracteres no permitidos)
            const nombreSeguro = nombreArchivo.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const rutaArchivo = path.join(multimediaDir, `${nombreSeguro}.${extension}`);
            
            // Guardar el archivo
            fs.writeFileSync(
                rutaArchivo,
                Buffer.from(media.data, 'base64')
            );
            
            replyMsg.reply(`Archivo guardado como: ${nombreSeguro}.${extension}`);
        } catch (error) {
            console.error('Error al guardar archivo:', error);
            replyMsg.reply('No pude guardar el archivo');
        }
    }
    
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
        nombre: 'Comandos Multimedia',
        descripcion: 'Proporciona comandos multimedia: imagen, sticker, ubicacion, guardar',
        version: '1.0.0',
        comandos: Object.keys(comandos).map(cmd => `${prefijo}${cmd}`)
    };
}; 