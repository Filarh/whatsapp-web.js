
const express = require('express');
const path = require('path');
const { log } = require('../utils/helper');

class WebUIService {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = process.env.PORT || 3000;
    this.publicDir = path.join(process.cwd(), 'public');

    this.setupApp();
  }

  setupApp() {
    // Middleware básico
    this.app.use(express.json());
    this.app.use(express.static(this.publicDir));
    
    // CORS simple
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });

    // Log solo APIs importantes
    this.app.use((req, res, next) => {
      if (req.method === 'POST' || req.path.includes('/api/')) {
        log('INFO', `WebUI: ${req.method} ${req.path}`);
      }
      next();
    });

    // Rutas principales
    this.app.get('/', (req, res) => res.redirect('/dashboard'));
    this.app.get('/health', (req, res) => res.json(this.getHealthStatus()));
    this.app.get('/dashboard', (req, res) => res.sendFile('index.html', { root: this.publicDir }));

    // API consolidada
    this.app.get('/api/:endpoint', (req, res) => this.handleAPI(req, res));
    
    // Restart solo en desarrollo
    this.app.post('/api/restart', (req, res) => {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ status: 'error', message: 'Restart not allowed in production' });
      }
      res.json({ status: 'success', message: 'Reiniciando bot...' });
      setTimeout(() => process.exit(0), 2000);
    });

    // Handlers de error
    this.app.all('*', (req, res) => {
      res.status(404).json({ status: 'error', message: 'Endpoint not found', path: req.originalUrl });
    });

    this.app.use((err, req, res, next) => {
      log('ERROR', `WebUI Error: ${err.message}`);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    });
  }

  // Manejo consolidado de todas las APIs
  handleAPI(req, res) {
    const { endpoint } = req.params;
    
    try {
      let data;
      
      switch (endpoint) {
        case 'status':
          data = this.getBotStatus();
          break;
          
        case 'stats':
          data = this.getStats();
          break;
          
        case 'plugins':
          data = {
            count: global.botStatus?.pluginsLoaded || 0,
            plugins: global.botStatus?.plugins || []
          };
          break;
          
        case 'client':
          data = {
            info: global.botStatus?.clientInfo || null,
            ready: global.botStatus?.isReady || false,
            authenticated: global.botStatus?.isAuthenticated || false,
            lastActivity: global.botStatus?.lastActivity || null
          };
          break;
          
        case 'qr':
          data = global.botStatus?.qrCode 
            ? { qr: global.botStatus.qrCode, message: 'Escanea este código QR con WhatsApp' }
            : { message: global.botStatus?.isAuthenticated ? 'Bot ya autenticado' : 'QR no disponible' };
          break;
          
        default:
          return res.status(404).json({ status: 'error', message: 'API endpoint not found' });
      }
      
      res.json({ status: 'success', data });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  }

  getHealthStatus() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      bot: {
        ready: global.botStatus?.isReady || false,
        authenticated: global.botStatus?.isAuthenticated || false
      }
    };
  }

  getBotStatus() {
    return {
      ready: global.botStatus?.isReady || false,
      authenticated: global.botStatus?.isAuthenticated || false,
      startTime: global.botStatus?.startTime || null,
      pluginsLoaded: global.botStatus?.pluginsLoaded || 0,
      messagesProcessed: global.botStatus?.messagesProcessed || 0,
      lastActivity: global.botStatus?.lastActivity || null,
      hasQR: !!global.botStatus?.qrCode,
      clientInfo: global.botStatus?.clientInfo || null
    };
  }

  getStats() {
    const startTime = global.botStatus?.startTime?.getTime() || Date.now();
    const uptimeMs = Date.now() - startTime;
    const minutesUp = uptimeMs / 60000;
    
    return {
      uptime: {
        milliseconds: uptimeMs,
        seconds: Math.floor(uptimeMs / 1000),
        minutes: Math.floor(uptimeMs / 60000),
        hours: Math.floor(uptimeMs / 3600000),
        days: Math.floor(uptimeMs / 86400000),
      },
      messages: {
        processed: global.botStatus?.messagesProcessed || 0,
        perMinute: minutesUp > 0 ? (global.botStatus?.messagesProcessed / minutesUp).toFixed(2) : 0
      },
      plugins: {
        loaded: global.botStatus?.pluginsLoaded || 0,
        list: global.botStatus?.plugins || []
      },
      memory: process.memoryUsage(),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid
      }
    };
  }

  async iniciar() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, '0.0.0.0', () => {
        log('INFO', `WebUI iniciado en puerto ${this.port}`);
        log('INFO', `Dashboard disponible en: http://localhost:${this.port}/dashboard`);
        resolve(this.server);
      });
      this.server.on('error', reject);
    });
  }

  cerrar() {
    if (this.server) {
      this.server.close(() => log('INFO', 'WebUI cerrado correctamente'));
      this.server = null;
    }
  }
}

// Función de inicialización simplificada
async function iniciar(client, config) {
  const webui = new WebUIService();
  await webui.iniciar().catch(err => log('ERROR', `Failed to start WebUI: ${err.message}`));
  return { close: () => webui.cerrar(), instance: webui };
}

module.exports = { iniciar, WebUIService };