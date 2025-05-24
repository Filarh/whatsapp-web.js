/**
 * WebUI Service - Interfaz web para el bot de WhatsApp
 * Solución workaround para Render.com que requiere puertos expuestos
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

        // Logging middleware
        this.app.use((req, res, next) => {
            const important = ['POST', 'PUT', 'DELETE'];
            if (important.includes(req.method)) {
            log('INFO', `WebUI: ${req.method} ${req.path} - ${req.ip}`);
            }
            next();
        });
          
    }

    setupRoutes() {
        // Ruta principal - Dashboard
        this.app.get('/', (req, res) => {
            res.json({
                status: 'success',
                message: 'WhatsApp Bot WebUI - Dashboard',
                timestamp: new Date().toISOString(),
                bot: this.getBotStatus()
            });
        });

        // Health check para Render.com
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
            res.json({
                status: 'success',
                data: this.getBotStatus()
            });
        });

        // Estadísticas del bot
        this.app.get('/api/stats', (req, res) => {
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
        });

        // Lista de plugins cargados
        this.app.get('/api/plugins', (req, res) => {
            res.json({
                status: 'success',
                data: {
                    count: global.botStatus?.pluginsLoaded || 0,
                    plugins: global.botStatus?.plugins || []
                }
            });
        });

        // Información del cliente WhatsApp
        this.app.get('/api/client', (req, res) => {
            res.json({
                status: 'success',
                data: {
                    info: global.botStatus?.clientInfo || null,
                    ready: global.botStatus?.isReady || false,
                    authenticated: global.botStatus?.isAuthenticated || false,
                    lastActivity: global.botStatus?.lastActivity || null
                }
            });
        });

        // QR Code para autenticación (solo devuelve si existe)
        this.app.get('/api/qr', (req, res) => {
            if (global.botStatus?.qrCode) {
                res.json({
                    status: 'success',
                    data: {
                        qr: global.botStatus.qrCode,
                        message: 'Escanea este código QR with WhatsApp'
                    }
                });
            } else {
                res.json({
                    status: 'success',
                    data: null,
                    message: global.botStatus?.isAuthenticated ? 'Bot ya autenticado' : 'QR no disponible'
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

        // Manejo de errores
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
        return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Bot Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            text-align: center;
        }
        .cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        }
        .card {
            background: white;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-online { background-color: #4CAF50; }
        .status-offline { background-color: #f44336; }
        .status-pending { background-color: #ff9800; }
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 20px;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .stat-item {
            text-align: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .stat-value {
            font-size: 24px;
            font-weight: bold;
            color: #667eea;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
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
                <h3>Estado del Bot</h3>
                <div id="bot-status">Cargando...</div>
                <button class="refresh-btn" onclick="refreshData()">Actualizar</button>
            </div>
            
            <div class="card">
                <h3>Estadísticas</h3>
                <div id="stats-content">
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
            </div>
            
            <div class="card">
                <h3>Plugins Cargados</h3>
                <div id="plugins-list">Cargando...</div>
            </div>
        </div>
    </div>

    <script>
        async function fetchData(endpoint) {
            try {
                const response = await fetch('/api/' + endpoint);
                return await response.json();
            } catch (error) {
                console.error('Error fetching data:', error);
                return null;
            }
        }

        async function updateStatus() {
            const status = await fetchData('status');
            if (status?.data) {
                const data = status.data;
                let statusHTML = '';
                
                if (data.ready) {
                    statusHTML += '<div><span class="status-indicator status-online"></span>Bot Listo y Funcionando</div>';
                } else if (data.authenticated) {
                    statusHTML += '<div><span class="status-indicator status-pending"></span>Autenticado, Iniciando...</div>';
                } else if (data.hasQR) {
                    statusHTML += '<div><span class="status-indicator status-pending"></span>Esperando escaneo QR</div>';
                } else {
                    statusHTML += '<div><span class="status-indicator status-offline"></span>Iniciando...</div>';
                }
                
                statusHTML += '<div style="margin-top: 10px; font-size: 14px; color: #666;">';
                statusHTML += 'Plugins cargados: ' + (data.pluginsLoaded || 0) + '<br>';
                statusHTML += 'Mensajes procesados: ' + (data.messagesProcessed || 0) + '<br>';
                if (data.lastActivity) {
                    statusHTML += 'Última actividad: ' + new Date(data.lastActivity).toLocaleString();
                }
                statusHTML += '</div>';
                
                document.getElementById('bot-status').innerHTML = statusHTML;
            }
        }

        async function updateStats() {
            const stats = await fetchData('stats');
            if (stats?.data) {
                const data = stats.data;
                document.getElementById('messages-count').textContent = data.messages.processed || 0;
                document.getElementById('plugins-count').textContent = data.plugins.loaded || 0;
                document.getElementById('uptime-hours').textContent = data.uptime.hours || 0;
                document.getElementById('memory-usage').textContent = 
                    Math.round((data.memory.heapUsed || 0) / 1024 / 1024);
            }
        }

        async function updatePlugins() {
            const plugins = await fetchData('plugins');
            if (plugins?.data) {
                const pluginsList = plugins.data.plugins || [];
                let html = '';
                
                if (pluginsList.length === 0) {
                    html = '<p>No hay plugins cargados</p>';
                } else {
                    html = '<ul style="margin: 0; padding-left: 20px;">';
                    pluginsList.forEach(plugin => {
                        html += '<li>' + plugin.nombre + ' v' + plugin.version + '</li>';
                    });
                    html += '</ul>';
                }
                
                document.getElementById('plugins-list').innerHTML = html;
            }
        }

        async function refreshData() {
            await Promise.all([
                updateStatus(),
                updateStats(),
                updatePlugins()
            ]);
        }

        // Actualizar cada 5 segundos
        setInterval(refreshData, 5000);
        
        // Cargar datos iniciales
        refreshData();
    </script>
</body>
</html>`;
    }

    iniciar() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, '0.0.0.0', () => {
                    log('INFO', `WebUI iniciado en puerto ${this.port}`);
                    log('INFO', `Dashboard disponible en: http://localhost:${this.port}/dashboard`);
                    resolve(this.server);
                }).on('error', (err) => {
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
        }
    }
}

// Función de inicio para compatibilidad
function iniciar(client, config) {
    const webui = new WebUIService();
    webui.iniciar().catch(err => {
        log('ERROR', `Failed to start WebUI: ${err.message}`);
    });
    
    return {
        close: () => webui.cerrar(),
        app: webui.app,
        server: webui.server
    };
}

module.exports = {
    iniciar,
    WebUIService
};