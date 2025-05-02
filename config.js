module.exports = {
    // Configuración general del bot
    bot: {
        name: 'WhatsApp Bot',
        version: '1.0.0',
        prefijo: '!',  // Prefijo para los comandos
    },
    
    // Configuración de cliente WhatsApp
    cliente: {
        // Opciones para el cliente de WhatsApp Web
        opciones: {
            authStrategy: 'local',  // 'local' para almacenar sesión en disco
            headless: true,         // Ejecutar navegador en modo headless
            qrMaxRetries: 3,        // Número máximo de intentos de QR
        },
        
        // Mensajes y respuestas automáticas
        respuestas: {
            bienvenida: '¡Hola! Soy un bot de WhatsApp. Usa !ayuda para ver los comandos disponibles.',
            despedida: '¡Hasta pronto!',
            error: 'Lo siento, ha ocurrido un error. Inténtalo de nuevo más tarde.',
            noComando: 'Comando no reconocido. Usa !ayuda para ver la lista de comandos.',
        }
    },
    
    // Rutas y directorios
    directorios: {
        plugins: './plugins',      // Directorio de plugins
        comandos: './comandos',    // Directorio de comandos
        multimedia: './archivos',  // Directorio para archivos multimedia
        modelos: './models',       // Directorio para modelos de IA
    },
    
    // Plugins activos (true = activado, false = desactivado)
    plugins: {
        basicos: true,         // Comandos básicos (ping, hora, etc)
        multimedia: true,      // Comandos de multimedia (stickers, imágenes)
        grupos: true,          // Comandos para grupos
        utilidades: true,      // Utilidades adicionales
        respuestasAuto: true,  // Respuestas automáticas a palabras clave
        ia: true,              // Agregar explícitamente el plugin de IA
        vision: true,          // Comandos de visión por computadora
    }
};