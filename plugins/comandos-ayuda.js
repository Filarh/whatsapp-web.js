module.exports = (client, config, plugins) => {
    const prefijo = config.bot.prefijo;

    const comandoAyuda = async (message, args) => {
        if (args.length > 0) {
            const pluginNombre = args[0].toLowerCase();
            const plugin = plugins.find(p =>
                p.nombre.toLowerCase().includes(pluginNombre) ||
                p.descripcion.toLowerCase().includes(pluginNombre)
            );

            if (plugin) {
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

        let mensajeAyuda = `🤖 *${config.bot.name} v${config.bot.version}*\n\n`;
        for (const plugin of plugins) {
            if (plugin.comandos && plugin.comandos.length > 0) {
                mensajeAyuda += `*${plugin.nombre}*\n`;
                mensajeAyuda += plugin.comandos.map(cmd => `- ${cmd}`).join('\n');
                mensajeAyuda += '\n\n';
            }
        }

        mensajeAyuda += `Para obtener más información sobre un plugin específico, escribe ${prefijo}ayuda [nombre del plugin]`;
        message.reply(mensajeAyuda);
    };

    client.on('message', async (message) => {
        const isHelpCommand =
            message.body === `${prefijo}ayuda` ||
            message.body === `${prefijo}help` ||
            message.body.startsWith(`${prefijo}ayuda `);

        // Solo ignorar mensajes propios si NO es comando de ayuda
        if (message.fromMe && !isHelpCommand) return;

        if (isHelpCommand) {
            try {
                const args = message.body.slice(prefijo.length).trim().split(/ +/);
                args.shift();
                await comandoAyuda(message, args);
            } catch (error) {
                console.error('Error en comando de ayuda:', error);
                message.reply(config.cliente.respuestas.error);
            }
        }
    });

    return {
        nombre: 'Comando de Ayuda',
        descripcion: 'Proporciona información sobre los comandos disponibles',
        version: '1.0.0',
        comandos: [`${prefijo}ayuda`, `${prefijo}help`, `${prefijo}ayuda [plugin]`]
    };
};
