/**
 * WebUI Service - Interfaz web para el bot de WhatsApp
 * Solución optimizada para Render.com
 */

const express = require('express');
const path = require('path');
const { log } = require('../utils/helper');

class WebUIService {
    constructor() {
        this.app = express();
        this.server = null;
        this.port = process.env.PORT || 3000;
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Middleware básico
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../public')));
        
        // CORS para desarrollo
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });

        // Logging middleware simplificado para no saturar
        this.app.use((req, res, next) => {
            // Solo loggear peticiones importantes o errores
            if (req.method === 'POST' || req.path.includes('/api/')) {
                log('INFO', `WebUI: ${req.method} ${req.path}`);
            }
            next();
        });
    }

    setupRoutes() {
        // Ruta principal - Dashboard
        this.app.get('/', (req, res) => {
            res.redirect('/dashboard');
        });

        // Health check para Render.com - MUY IMPORTANTE
        this.app.get('/health', (req, res) => {
            res.status(200).json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                bot: {
                    ready: global.botStatus?.isReady || false,
                    authenticated: global.botStatus?.isAuthenticated || false
                }
            });
        });

        // Estado del bot
        this.app.get('/api/status', (req, res) => {
            try {
                res.json({
                    status: 'success',
                    data: this.getBotStatus()
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        });

        // Estadísticas del bot
        this.app.get('/api/stats', (req, res) => {
            try {
                const uptime = Date.now() - (global.botStatus?.startTime?.getTime() || Date.now());
                const stats = {
                    uptime: {
                        milliseconds: uptime,
                        seconds: Math.floor(uptime / 1000),
                        minutes: Math.floor(uptime / (1000 * 60)),
                        hours: Math.floor(uptime / (1000 * 60 * 60)),
                        days: Math.floor(uptime / (1000 * 60 * 60 * 24))
                    },
                    messages: {
                        processed: global.botStatus?.messagesProcessed || 0,
                        perMinute: this.calculateMessagesPerMinute()
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

                res.json({
                    status: 'success',
                    data: stats
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        });

        // Lista de plugins cargados
        this.app.get('/api/plugins', (req, res) => {
            try {
                res.json({
                    status: 'success',
                    data: {
                        count: global.botStatus?.pluginsLoaded || 0,
                        plugins: global.botStatus?.plugins || []
                    }
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        });

        // Información del cliente WhatsApp
        this.app.get('/api/client', (req, res) => {
            try {
                res.json({
                    status: 'success',
                    data: {
                        info: global.botStatus?.clientInfo || null,
                        ready: global.botStatus?.isReady || false,
                        authenticated: global.botStatus?.isAuthenticated || false,
                        lastActivity: global.botStatus?.lastActivity || null
                    }
                });
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        });

        // QR Code para autenticación
        this.app.get('/api/qr', (req, res) => {
            try {
                if (global.botStatus?.qrCode) {
                    res.json({
                        status: 'success',
                        data: {
                            qr: global.botStatus.qrCode,
                            message: 'Escanea este código QR con WhatsApp'
                        }
                    });
                } else {
                    res.json({
                        status: 'success',
                        data: null,
                        message: global.botStatus?.isAuthenticated ? 'Bot ya autenticado' : 'QR no disponible'
                    });
                }
            } catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: error.message
                });
            }
        });

        // Dashboard HTML básico
        this.app.get('/dashboard', (req, res) => {
            res.send(this.getDashboardHTML());
        });

        // Endpoint para reiniciar bot (solo en desarrollo)
        this.app.post('/api/restart', (req, res) => {
            if (process.env.NODE_ENV === 'production') {
                return res.status(403).json({
                    status: 'error',
                    message: 'Restart not allowed in production'
                });
            }

            res.json({
                status: 'success',
                message: 'Reiniciando bot...'
            });

            // Reiniciar en 2 segundos
            setTimeout(() => {
                process.exit(0);
            }, 2000);
        });

        // Manejar rutas no encontradas
        this.app.all('*', (req, res) => {
            res.status(404).json({
                status: 'error',
                message: 'Endpoint not found',
                path: req.originalUrl
            });
        });

        // Manejo de errores global
        this.app.use((err, req, res, next) => {
            log('ERROR', `WebUI Error: ${err.message}`);
            res.status(500).json({
                status: 'error',
                message: 'Internal server error'
            });
        });
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

    calculateMessagesPerMinute() {
        if (!global.botStatus?.startTime || !global.botStatus?.messagesProcessed) {
            return 0;
        }

        const uptimeMinutes = (Date.now() - global.botStatus.startTime.getTime()) / (1000 * 60);
        return uptimeMinutes > 0 ? (global.botStatus.messagesProcessed / uptimeMinutes).toFixed(2) : 0;
    }

    getDashboardHTML() {
        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            margin-bottom: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 25px;
        }
        
        .card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 25px;
            border-radius: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            transition: transform 0.2s ease;
        }
        
        .card:hover {
            transform: translateY(-5px);
        }
        
        .card h3 {
            font-size: 1.3rem;
            margin-bottom: 20px;
            color: #333;
        }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 10px;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .status-online { background-color: #4CAF50; }
        .status-offline { background-color: #f44336; }
        .status-pending { background-color: #ff9800; }
        
        .refresh-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            margin-top: 20px;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        
        .refresh-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .stat-item {
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #f8f9fa, #e9ecef);
            border-radius: 12px;
            transition: transform 0.2s ease;
        }
        
        .stat-item:hover {
            transform: scale(1.05);
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 0.8rem;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .plugin-list {
            max-height: 300px;
            overflow-y: auto;
        }
        
        .plugin-list ul {
            list-style: none;
            padding: 0;
        }
        
        .plugin-list li {
            padding: 10px;
            margin: 5px 0;
            background: #f8f9fa;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        
        .loading {
            text-align: center;
            color: #666;
            font-style: italic;
        }
        
        @media (max-width: 768px) {
            .cards {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 WhatsApp Bot Dashboard</h1>
            <p>Monitoreo y estadísticas en tiempo real</p>
        </div>
        
        <div class="cards">
            <div class="card">
                <h3>📊 Estado del Bot</h3>
                <div id="bot-status" class="loading">Cargando estado...</div>
                <button class="refresh-btn" onclick="refreshData()">🔄 Actualizar</button>
            </div>
            
            <div class="card">
                <h3>📈 Estadísticas</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value" id="messages-count">-</div>
                        <div class="stat-label">Mensajes</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="plugins-count">-</div>
                        <div class="stat-label">Plugins</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="uptime-hours">-</div>
                        <div class="stat-label">Horas Activo</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="memory-usage">-</div>
                        <div class="stat-label">Memoria MB</div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <h3>🔌 Plugins Cargados</h3>
                <div id="plugins-list" class="plugin-list loading">Cargando plugins...</div>
            </div>
        </div>
    </div>

    <script>
        let updateInterval;
        
        async function fetchData(endpoint) {
            try {
                const response = await fetch('/api/' + endpoint);
                const data = await response.json();
                return data;
            } catch (error) {
                console.error('Error fetching ' + endpoint + ':', error);
                return null;
            }
        }

        async function updateStatus() {
            try {
                const status = await fetchData('status');
                if (status?.data) {
                    const data = status.data;
                    let statusHTML = '';
                    
                    if (data.ready) {
                        statusHTML += '<div style="margin-bottom: 15px;"><span class="status-indicator status-online"></span><strong>Bot Listo y Funcionando</strong></div>';
                    } else if (data.authenticated) {
                        statusHTML += '<div style="margin-bottom: 15px;"><span class="status-indicator status-pending"></span><strong>Autenticado, Iniciando...</strong></div>';
                    } else if (data.hasQR) {
                        statusHTML += '<div style="margin-bottom: 15px;"><span class="status-indicator status-pending"></span><strong>Esperando escaneo QR</strong></div>';
                    } else {
                        statusHTML += '<div style="margin-bottom: 15px;"><span class="status-indicator status-offline"></span><strong>Iniciando...</strong></div>';
                    }
                    
                    statusHTML += '<div style="font-size: 0.9rem; color: #666; line-height: 1.6;">';
                    statusHTML += '• Plugins cargados: <strong>' + (data.pluginsLoaded || 0) + '</strong><br>';
                    statusHTML += '• Mensajes procesados: <strong>' + (data.messagesProcessed || 0) + '</strong><br>';
                    if (data.lastActivity) {
                        statusHTML += '• Última actividad: <strong>' + new Date(data.lastActivity).toLocaleString() + '</strong>';
                    }
                    statusHTML += '</div>';
                    
                    document.getElementById('bot-status').innerHTML = statusHTML;
                }
            } catch (error) {
                document.getElementById('bot-status').innerHTML = '<div style="color: #f44336;">Error al cargar estado</div>';
            }
        }

        async function updateStats() {
            try {
                const stats = await fetchData('stats');
                if (stats?.data) {
                    const data = stats.data;
                    document.getElementById('messages-count').textContent = data.messages?.processed || 0;
                    document.getElementById('plugins-count').textContent = data.plugins?.loaded || 0;
                    document.getElementById('uptime-hours').textContent = data.uptime?.hours || 0;
                    document.getElementById('memory-usage').textContent = 
                        Math.round((data.memory?.heapUsed || 0) / 1024 / 1024);
                }
            } catch (error) {
                console.error('Error updating stats:', error);
            }
        }

        async function updatePlugins() {
            try {
                const plugins = await fetchData('plugins');
                if (plugins?.data) {
                    const pluginsList = plugins.data.plugins || [];
                    let html = '';
                    
                    if (pluginsList.length === 0) {
                        html = '<div class="loading">No hay plugins cargados</div>';
                    } else {
                        html = '<ul>';
                        pluginsList.forEach(plugin => {
                            html += '<li><strong>' + plugin.nombre + '</strong> <span style="color: #666;">v' + plugin.version + '</span></li>';
                        });
                        html += '</ul>';
                    }
                    
                    document.getElementById('plugins-list').innerHTML = html;
                }
            } catch (error) {
                document.getElementById('plugins-list').innerHTML = '<div style="color: #f44336;">Error al cargar plugins</div>';
            }
        }

        async function refreshData() {
            try {
                await Promise.all([
                    updateStatus(),
                    updateStats(),
                    updatePlugins()
                ]);
            } catch (error) {
                console.error('Error refreshing data:', error);
            }
        }

        // Inicializar
        document.addEventListener('DOMContentLoaded', function() {
            refreshData();
            
            // Actualizar cada 10 segundos (reducido para mejor performance)
            updateInterval = setInterval(refreshData, 10000);
        });
        
        // Limpiar interval al cerrar
        window.addEventListener('beforeunload', function() {
            if (updateInterval) {
                clearInterval(updateInterval);
            }
        });
    </script>
</body>
</html>`;
    }

    // MÉTODO MODIFICADO: No bloquea el hilo principal
    async iniciar() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, '0.0.0.0', () => {
                    log('INFO', `WebUI iniciado en puerto ${this.port}`);
                    log('INFO', `Dashboard disponible en: http://localhost:${this.port}/dashboard`);
                    resolve(this.server);
                });
                
                this.server.on('error', (err) => {
                    log('ERROR', `Error al iniciar WebUI: ${err.message}`);
                    reject(err);
                });
                
            } catch (error) {
                log('ERROR', `Error al configurar WebUI: ${error.message}`);
                reject(error);
            }
        });
    }

    cerrar() {
        if (this.server) {
            this.server.close(() => {
                log('INFO', 'WebUI cerrado correctamente');
            });
            this.server = null;
        }
    }
}

// FUNCIÓN DE INICIO MODIFICADA - NO BLOQUEA
async function iniciar(client, config) {
    const webui = new WebUIService();
    
    // Iniciar de forma asíncrona sin esperar (no bloquea)
    webui.iniciar().then(() => {
        log('INFO', 'WebUI iniciado correctamente');
    }).catch(err => {
        log('ERROR', `Failed to start WebUI: ${err.message}`);
    });
    
    return {
        close: () => webui.cerrar(),
        app: webui.app,
        server: webui.server,
        instance: webui
    };
}

module.exports = {
    iniciar,
    WebUIService
};0.