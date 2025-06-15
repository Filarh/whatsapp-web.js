let updateInterval;

async function fetchData(endpoint) {
    try {
        const response = await fetch('/api/' + endpoint);
        return await response.json();
    } catch (error) {
        console.error('Error fetching ' + endpoint + ':', error);
        return null;
    }
}

async function updateStatus() {
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
    } else {
        document.getElementById('bot-status').innerHTML = '<div style="color: #f44336;">Error al cargar estado</div>';
    }
}

async function updateStats() {
    const stats = await fetchData('stats');
    if (stats?.data) {
        const data = stats.data;
        document.getElementById('messages-count').textContent = data.messages?.processed || 0;
        document.getElementById('plugins-count').textContent = data.plugins?.loaded || 0;
        document.getElementById('uptime-hours').textContent = data.uptime?.hours || 0;
        document.getElementById('memory-usage').textContent = Math.round((data.memory?.heapUsed || 0) / 1024 / 1024);
    }
}

async function updatePlugins() {
    const plugins = await fetchData('plugins');
    if (plugins?.data) {
        const list = plugins.data.plugins || [];
        let html = '';
        
        if (list.length === 0) {
            html = '<div class="loading">No hay plugins cargados</div>';
        } else {
            html = '<ul>' + list.map(p => `<li><strong>${p.nombre}</strong> <span style="color: #666;">v${p.version}</span></li>`).join('') + '</ul>';
        }
        
        document.getElementById('plugins-list').innerHTML = html;
    }
}

async function refreshData() {
    await Promise.all([updateStatus(), updateStats(), updatePlugins()]);
}

document.addEventListener('DOMContentLoaded', () => {
    refreshData();
    updateInterval = setInterval(refreshData, 10000);
});

window.addEventListener('beforeunload', () => {
    clearInterval(updateInterval);
});