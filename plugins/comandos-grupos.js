/**
 * Plugin de comandos para grupos
 */

module.exports = (client, config) => {
    const prefijo = config.bot.prefijo;
    
    // Lista de comandos para grupos
    const comandos = {
        // Comando para mencionar a todos en un grupo
        'todos': async (message) => {
            const chat = await message.getChat();
            
            if (!chat.isGroup) {
                message.reply('Este comando solo funciona en grupos');
                return;
            }
            
            let text = "¡Atención a todos! 👋\n";
            let mentions = [];
            
            for (let participant of chat.participants) {
                const contact = await client.getContactById(participant.id._serialized);
                mentions.push(contact);
                text += `@${participant.id.user} `;
            }
            
            await chat.sendMessage(text, { mentions });
        },
        
        // Comando para mostrar información del grupo
        'grupo': async (message) => {
            const chat = await message.getChat();
            
            if (!chat.isGroup) {
                message.reply('Este comando solo funciona en grupos');
                return;
            }
            
            const infoGrupo = `*Información detallada del grupo*
📝 Nombre: ${chat.name}
👥 Participantes: ${chat.participants.length}
👤 Creado por: ${chat.owner ? chat.owner.user : 'Desconocido'}
📅 Creado el: ${chat.createdAt ? chat.createdAt.toLocaleString() : 'Desconocido'}
🔒 Protegido: ${chat.isReadOnly ? 'Sí' : 'No'}`;
            
            message.reply(infoGrupo);
        },
        
        // Comando para listar participantes del grupo
        'miembros': async (message) => {
            const chat = await message.getChat();
            
            if (!chat.isGroup) {
                message.reply('Este comando solo funciona en grupos');
                return;
            }
            
            let participantList = '*Participantes del grupo:*\n';
            let count = 1;
            
            for (let participant of chat.participants) {
                const contact = await client.getContactById(participant.id._serialized);
                const nombre = contact.pushname || contact.number || 'Desconocido';
                const esAdmin = participant.isAdmin || participant.isSuperAdmin;
                
                participantList += `${count}. ${nombre} ${esAdmin ? '👑' : ''}\n`;
                count++;
            }
            
            message.reply(participantList);
        },
        
        // Comando para mostrar el enlace de invitación del grupo (si está habilitado)
        'link': async (message) => {
            const chat = await message.getChat();
            
            if (!chat.isGroup) {
                message.reply('Este comando solo funciona en grupos');
                return;
            }
            
            try {
                const inviteCode = await chat.getInviteCode();
                message.reply(`Enlace de invitación al grupo: https://chat.whatsapp.com/${inviteCode}`);
            } catch (error) {
                console.error('Error al obtener enlace de invitación:', error);
                message.reply('No pude obtener el enlace de invitación. Es posible que no tenga permisos para hacerlo.');
            }
        }
    };
    
    // Evento para cuando un miembro se une al grupo
    client.on('group_join', async (notification) => {
        const chat = await notification.getChat();
        const contact = await notification.getContact();
        
        chat.sendMessage(`¡Bienvenido/a @${contact.id.user}! 👋`, {
            mentions: [contact]
        });
    });
    
    // Evento para cuando un miembro sale del grupo
    client.on('group_leave', async (notification) => {
        const chat = await notification.getChat();
        const contact = await notification.getContact();
        
        chat.sendMessage(`@${contact.id.user} ha salido del grupo 👋`, {
            mentions: [contact]
        });
    });
    
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
        nombre: 'Comandos para Grupos',
        descripcion: 'Proporciona comandos para gestionar grupos: todos, grupo, miembros, link',
        version: '1.0.0',
        comandos: Object.keys(comandos).map(cmd => `${prefijo}${cmd}`)
    };
}; 