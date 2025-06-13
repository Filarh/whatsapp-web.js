/**
 * WhatsApp Bot - Archivo principal
 * Este archivo carga todos los plugins y configura el cliente de WhatsApp
 */

// Importar dependencias
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // 👈 esto es imprescindible para que config/ia.js funcione

// Importar configuración y utilidades
const config = require('./config');
const { log, crearDirectorio, cargarArchivos } = require('./utils/helper');

// Crear directorios necesarios
Object.values(config.directorios).forEach(crearDirectorio);

// Configurar cliente de WhatsApp
const clientOptions = {
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: config.cliente.opciones.headless,
    }
};

// Crear cliente
const client = new Client(clientOptions);

// Array para almacenar plugins cargados
let pluginsCargados = [];

// Función para cargar plugins
const cargarPlugins = async () => {
    // Buscar archivos de plugin en el directorio
    const rutaPlugins = path.resolve(config.directorios.plugins);
    
    // Verificar si el directorio existe
    if (!fs.existsSync(rutaPlugins)) {
        log('ERROR', `El directorio de plugins no existe: ${rutaPlugins}`);
        return;
    }
    
    // Obtener lista de archivos
    let archivosPlugin;
    try {
        archivosPlugin = fs.readdirSync(rutaPlugins)
            .filter(file => file.endsWith('.js'))
            .map(file => path.join(rutaPlugins, file));
    } catch (error) {
        log('ERROR', `Error al leer directorio de plugins: ${error.message}`);
        return;
    }
    
    log('INFO', `Encontrados ${archivosPlugin.length} archivos de plugin`);
    
    // Cargar cada plugin excepto el de ayuda
    let pluginAyuda = null;
    
    for (const archivoPlugin of archivosPlugin) {
        try {
            const nombrePlugin = path.basename(archivoPlugin, '.js');
            
            // Si es el plugin de ayuda, guardarlo para después
            if (nombrePlugin === 'comandos-ayuda') {
                pluginAyuda = archivoPlugin;
                continue;
            }
            
            // Verificar si el plugin está activado en la configuración
            if (nombrePlugin.startsWith('comandos-') && 
                config.plugins[nombrePlugin.replace('comandos-', '')] === false) {
                log('INFO', `Plugin ${nombrePlugin} desactivado en configuración`);
                continue;
            }
            
            // Importar y cargar el plugin
            log('INFO', `Cargando plugin: ${archivoPlugin}`);
            const plugin = require(archivoPlugin);
            
            // Inicializar plugin (ahora con soporte para async)
            let metadatos;
            if (plugin.constructor.name === 'AsyncFunction') {
                // Es una función async, esperamos la promesa
                metadatos = await plugin(client, config);
            } else {
                // Es una función normal
                metadatos = plugin(client, config);
            }
            
            // Registrar metadatos
            if (metadatos) {
                log('INFO', `Plugin cargado: ${metadatos.nombre} v${metadatos.version}`);
                pluginsCargados.push(metadatos);
            } else {
                log('WARN', `Plugin ${nombrePlugin} no retornó metadatos`);
            }
        } catch (error) {
            log('ERROR', `Error al cargar plugin ${archivoPlugin}: ${error.message}`);
            console.error(error);
        }
    }
    
    // Cargar plugin de ayuda al final para que tenga acceso a todos los demás plugins
    if (pluginAyuda) {
        try {
            log('INFO', `Cargando plugin de ayuda: ${pluginAyuda}`);
            const pluginAyudaModule = require(pluginAyuda);
            // El plugin de ayuda también podría ser async
            let metadatos;
            if (pluginAyudaModule.constructor.name === 'AsyncFunction') {
                metadatos = await pluginAyudaModule(client, config, pluginsCargados);
            } else {
                metadatos = pluginAyudaModule(client, config, pluginsCargados);
            }
            
            if (metadatos) {
                log('INFO', `Plugin cargado: ${metadatos.nombre} v${metadatos.version}`);
                pluginsCargados.push(metadatos);
            }
        } catch (error) {
            log('ERROR', `Error al cargar plugin de ayuda: ${error.message}`);
            console.error(error);
        }
    } else {
        log('WARN', 'No se encontró el plugin de ayuda (comandos-ayuda.js)');
    }
    
    log('INFO', `Total de ${pluginsCargados.length} plugins cargados correctamente`);
};

// Evento cuando se recibe un código QR
client.on('qr', (qr) => {
    log('INFO', 'Código QR recibido, escanea con tu teléfono');
    qrcode.generate(qr, { small: true });
});

// Evento cuando el cliente está autenticado
client.on('authenticated', () => {
    log('INFO', 'Autenticación exitosa');
});

// Evento cuando hay un fallo de autenticación
client.on('auth_failure', (msg) => {
    log('ERROR', `Fallo de autenticación: ${msg}`);
});

// Evento cuando el cliente está listo
client.once('ready', async () => {
    log('INFO', 'Cliente listo');
    log('INFO', `Bot ${config.bot.name} v${config.bot.version} iniciado correctamente`);
    
    // Cargar plugins cuando el cliente esté listo
    await cargarPlugins();
});

// Inicializar cliente
log('INFO', 'Iniciando cliente...');
client.initialize().catch(err => {
    log('ERROR', `Error al inicializar cliente: ${err.message}`);
    console.error(err);
});

// Manejar señales para cerrar el bot correctamente
process.on('SIGINT', async () => {
    log('INFO', 'Cerrando el bot...');
    await client.destroy();
    process.exit(0);
});

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
    log('ERROR', `Error no capturado: ${err.message}`);
    console.error(err);
});