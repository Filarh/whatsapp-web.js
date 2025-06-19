'use strict';

const config = require('../config/ai');

class Logger {
  static log(level, module, message, data = null) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${module}] ${timestamp}`;
    
    console.log(`${prefix} ${level}: ${message}`);
    if (data && config.rag.debugMode) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  static ragDebug(step, data) {
    
    if (!config.rag.debugMode) return;
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n[RAG Debug ${timestamp}] === ${step.toUpperCase()} ===`);
    
    switch (step) {
      case 'consulta':
        console.log(`📝 Usuario: "${data.consulta}"`);
        console.log(`🔍 Análisis:`, data.analisis);
        break;
        
      case 'busqueda': {
        const matches = Array.isArray(data.matches)
          ? data.matches
          : (data.searchResults && Array.isArray(data.searchResults.matches)
              ? data.searchResults.matches
              : []);
        console.log(`🎯 Coincidencias: ${matches.length}`);
        matches.forEach((m, i) => {
          console.log(`  ${i + 1}. [${m.similarity?.toFixed(3) ?? '---'}] ${m.output?.substring(0, 80) ?? ''}...`);
        });
        break;
      }
      
      case 'contexto':
        console.log(`📊 Stats: ${data.stats.total} total, ${data.stats.highQuality} alta calidad`);
        break;
        
      case 'respuesta':
        console.log(`✅ Respuesta (${data.respuesta.length} chars): "${data.respuesta}"`);
        if (data.fallback) console.log(`🔄 Fallback: ${data.tipoFallback}`);
        break;
        
      case 'error':
        if (typeof data.error === 'string') {
          console.log(`❌ Error: ${data.error}`);
        } else {
          console.log(`❌ Error: ${data.error?.message}`);
        }
        break;
    }
  }

  static info(module, message, data) { this.log('INFO', module, message, data); }
  static error(module, message, data) { this.log('ERROR', module, message, data); }
  static warn(module, message, data) { this.log('WARN', module, message, data); }
}

module.exports = Logger;