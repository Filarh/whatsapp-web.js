/**
 * WhatsApp Bot - Archivo principal
 * Este archivo carga todos los plugins y configura el cliente de WhatsApp
 */

const { Client, RemoteAuth } = require('whatsapp-web.js');
const remoteStore = require('./utils/remoteStoreSupabase');

const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Importar configuración y utilidades
const config = require('./config');
const { log, crearDirectorio, cargarArchivos } = require('./utils/helper');

// Importar WebUI para Render.com compatibilidad
const webui = require('./services/webui');

// Crear directorios necesarios
Object.values(config.directorios).forEach(crearDirectorio);

const clientOptions = {
    authStrategy: new RemoteAuth({
      clientId: 'mksbot01',
      store: remoteStore,
      dataPath: '/tmp', // en Render es ideal usar esto
      backupSyncIntervalMs: 60000 // guarda cada minuto
    }),
    puppeteer: {
      headless: config.cliente.opciones.headless,
      args: ['--no-sandbox']
    }
  };
  
// Crear cliente
const client = new Client(clientOptions);

// Array para almacenar plugins cargados
let pluginsCargados = [];

// Estado global del bot para la WebUI
global.botStatus = {
    isReady: false,
    isAuthenticated: false,
    startTime: new Date(),
    pluginsLoaded: 0,
    messagesProcessed: 0,
    lastActivity: null,
    qrCode: null,
    clientInfo: null
};

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
    
    // Actualizar estado global
    global.botStatus.pluginsLoaded = pluginsCargados.length;
    global.botStatus.plugins = pluginsCargados;
    
    log('INFO', `Total de ${pluginsCargados.length} plugins cargados correctamente`);
};

// INICIALIZAR WEBUI PRIMERO (SIN BLOQUEAR)
log('INFO', 'Iniciando WebUI...');
// Iniciar WebUI de forma asíncrona sin bloquear
webui.iniciar(client, config).catch(err => {
    log('ERROR', `Error al iniciar WebUI: ${err.message}`);
});

// Evento cuando se recibe un código QR
client.on('qr', (qr) => {
    log('INFO', 'Código QR recibido, escanea con tu teléfono');
    qrcode.generate(qr, { small: true });
    
    // Actualizar estado global para WebUI
    global.botStatus.qrCode = qr;
    global.botStatus.lastActivity = new Date();
});

// Evento cuando el cliente está autenticado
client.on('authenticated', () => {
    log('INFO', 'Autenticación exitosa');
    global.botStatus.isAuthenticated = true;
    global.botStatus.qrCode = null;
    global.botStatus.lastActivity = new Date();
});

// Evento cuando hay un fallo de autenticación
client.on('auth_failure', (msg) => {
    log('ERROR', `Fallo de autenticación: ${msg}`);
    global.botStatus.isAuthenticated = false;
    global.botStatus.lastActivity = new Date();
});

// Evento cuando el cliente está listo
client.once('ready', async () => {
    log('INFO', 'Cliente listo');
    log('INFO', `Bot ${config.bot.name} v${config.bot.version} iniciado correctamente`);
    
    // Actualizar estado global
    global.botStatus.isReady = true;
    global.botStatus.lastActivity = new Date();
    
    // Obtener información del cliente
    try {
        const info = client.info;
        global.botStatus.clientInfo = {
            pushname: info.pushname,
            me: info.me,
            platform: info.platform
        };
    } catch (error) {
        log('WARN', 'No se pudo obtener información del cliente');
    }
    
    // Cargar plugins cuando el cliente esté listo
    await cargarPlugins();
});

// Escuchar mensajes para estadísticas
client.on('message', () => {
    global.botStatus.messagesProcessed++;
    global.botStatus.lastActivity = new Date();
});

// INICIALIZAR CLIENTE DESPUÉS DE CONFIGURAR WEBUI
log('INFO', 'Iniciando cliente WhatsApp...');
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

// Exponer cliente y plugins para la WebUI
global.whatsappClient = client;
global.loadedPlugins = pluginsCargados;