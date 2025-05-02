/**
 * Plugin de comando de ayuda
 * Este plugin muestra información sobre todos los comandos disponibles
 */

module.exports = (client, config, plugins) => {
    const prefijo = config.bot.prefijo;
    
    // Comando de ayuda para mostrar todos los comandos disponibles
    const comandoAyuda = async (message, args) => {
        // Si se especifica un plugin concreto, mostrar solo comandos de ese plugin
        if (args.length > 0) {
            const pluginNombre = args[0].toLowerCase();
            
            // Buscar el plugin por nombre
            const plugin = plugins.find(p => 
                p.nombre.toLowerCase().includes(pluginNombre) || 
                p.descripcion.toLowerCase().includes(pluginNombre)
            );
            
            if (plugin) {
                // Mostrar ayuda específica para ese plugin
                const ayudaPlugin = `*${plugin.nombre} v${plugin.version}*
${plugin.descripcion}

*Comandos disponibles:*
${plugin.comandos ? plugin.comandos.map(cmd => `- ${cmd}`).join('\n') : 'No hay comandos disponibles'}`;
                
                message.reply(ayudaPlugin);
                return;
            } else {
                message.reply(`No se encontró ningún plugin con el nombre "${args[0]}"`);
                return;
            }
        }
        
        // Crear mensaje de ayuda general
        let mensajeAyuda = `🤖 *${config.bot.name} v${config.bot.version}*\n\n`;
        
        // Categorizar comandos por plugin
        for (const plugin of plugins) {
            if (plugin.comandos && plugin.comandos.length > 0) {
                mensajeAyuda += `*${plugin.nombre}*\n`;
                mensajeAyuda += plugin.comandos.map(cmd => `- ${cmd}`).join('\n');
                mensajeAyuda += '\n\n';
            }
        }
        
        // Instrucciones adicionales
        mensajeAyuda += `Para obtener más información sobre un plugin específico, escribe ${prefijo}ayuda [nombre del plugin]`;
        
        // Enviar mensaje de ayuda
        message.reply(mensajeAyuda);
    };
    
    // Registrar handler para el comando de ayuda
    client.on('message', async (message) => {
        // Ignorar mensajes propios
        if (message.fromMe) return;
        
        // Comprobar si es el comando de ayuda
        if (message.body === `${prefijo}ayuda` || message.body === `${prefijo}help` || message.body.startsWith(`${prefijo}ayuda `)) {
            try {
                // Extraer argumentos
                const args = message.body.slice(prefijo.length).trim().split(/ +/);
                args.shift(); // Quitar el comando
                
                // Ejecutar comando de ayuda
                await comandoAyuda(message, args);
            } catch (error) {
                console.error('Error en comando de ayuda:', error);
                message.reply(config.cliente.respuestas.error);
            }
        }
    });
    
    // Retornar metadatos del plugin
    return {
        nombre: 'Comando de Ayuda',
        descripcion: 'Proporciona información sobre los comandos disponibles',
        version: '1.0.0',
        comandos: [`${prefijo}ayuda`, `${prefijo}help`, `${prefijo}ayuda [plugin]`]
    };
}; 