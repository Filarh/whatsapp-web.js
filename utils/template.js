'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config/ai');

class TemplateManager {
  constructor() {
    this.promptData = null;
    this.companyInfo = null;
    this.loadTemplates();
  }

  loadTemplates() {
    try {
      const promptsPath = path.join(__dirname, '../data/prompts.jsonl');
      if (fs.existsSync(promptsPath)) {
        const promptsContent = fs.readFileSync(promptsPath, 'utf8');
        this.promptData = JSON.parse(promptsContent);
      } else {
        this.promptData = this.getDefaultPrompts();
      }

      this.companyInfo = this.promptData.company_info || this.getDefaultCompanyInfo();
    } catch (err) {
      console.error('Error cargando templates:', err);
      this.promptData = this.getDefaultPrompts();
      this.companyInfo = this.getDefaultCompanyInfo();
    }
  }

  getDefaultPrompts() {
    return {
      "system_prompts": {
        "main_instruction": "Eres {bot_name}, asistente especializado de {company_name}",
        "context_prefix": "Información relevante:",
        "query_analysis": {
          "patterns": {
            "precio": "precio|cuánto|vale|costo|cobran|barato|caro",
            "ubicacion": "dónde|dirección|ubicación|sucursal|local",
            "horario": "horario|abren|cierran|hora|cuando",
            "servicio": "hacen|pueden|servicio|reparan|arreglan",
            "producto": "modelos|tipos|opciones|productos|variedades|catálogo|regata|bajaj|pulsar|honda|yamaha",
            "urgente": "urgente|rápido|ya|ahora|emergency",
            "general": "qué|cuáles|cómo|dónde|todos|todas"
          }
        }
      },
      "response_templates": {
        "high_quality_context": "Información de alta relevancia:",
        "additional_context": "Información adicional:",
        "product_list_intro": "Estos son los modelos disponibles:",
        "no_products_found": "No encontré productos específicos con esa descripción.",
        "general_product_help": "Te puedo ayudar con información sobre nuestros productos. ¿Hay algo específico que te interese?"
      },
      "query_synonyms": {
        "modelos": ["tipos", "opciones", "variedades"],
        "regata": ["regatas"],
        "moto": ["motocicleta", "motos"],
        "carro": ["auto", "automóvil", "vehículo"],
        "precio": ["costo", "valor", "cuánto cuesta"]
      },
      "fallback_responses": {
        "no_data": "No tengo información específica sobre esa consulta en este momento.",
        "error": "Disculpa, ocurrió un error procesando tu consulta. ¿Podrías intentar de nuevo?",
        "ambiguous_product": "Tenemos varios productos. ¿Podrías ser más específico sobre qué tipo de producto te interesa?"
      }
    };
  }

  getDefaultCompanyInfo() {
    return {
      company: {
        name: "Sistema RAG",
        displayName: "Asistente RAG"
      },
      contact: {
        whatsapp: "1234567890@c.us"
      }
    };
  }

  // Análisis de consultas mejorado
  analyzeQuery(text) {
    const patterns = this.promptData.system_prompts.query_analysis.patterns;
    const analysis = {};
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const regex = new RegExp(pattern, 'i');
      analysis[key] = regex.test(text);
    }
    
    // Análisis adicional para detectar intenciones específicas
    analysis.isGeneral = this.detectGeneralIntent(text);
    analysis.isProductList = this.detectProductListIntent(text);
    analysis.confidence = this.calculateConfidence(analysis);
    
    return analysis;
  }

  detectGeneralIntent(text) {
    const generalPatterns = [
      /qué.*modelos/i,
      /cuáles.*opciones/i,
      /todos.*los/i,
      /lista.*de/i,
      /catálogo/i,
      /variedades/i
    ];
    
    return generalPatterns.some(pattern => pattern.test(text));
  }

  detectProductListIntent(text) {
    const listPatterns = [
      /modelos.*regata/i,
      /tipos.*de.*regata/i,
      /opciones.*regata/i,
      /regatas.*disponibles/i
    ];
    
    return listPatterns.some(pattern => pattern.test(text));
  }

  calculateConfidence(analysis) {
    const trueCount = Object.values(analysis).filter(Boolean).length;
    const totalAnalysis = Object.keys(analysis).length;
    return trueCount / totalAnalysis;
  }

  // Obtener sinónimos para expansión de consultas
  getQuerySynonyms() {
    return this.promptData.query_synonyms || {};
  }

  // Respuestas inteligentes basadas en análisis
  getQueryFallback(analysis) {
    const fallbacks = this.promptData.fallback_responses;
    
    if (analysis.producto && analysis.general) {
      return fallbacks.ambiguous_product;
    }
    
    if (analysis.producto) {
      return fallbacks.no_products_found;
    }
    
    return fallbacks.no_data;
  }

  // Formatear respuesta de productos
  formatProductResponse(formattedResults, query) {
    if (formattedResults.type === 'product_list') {
      return this.formatProductList(formattedResults, query);
    } else {
      return this.formatSpecificResponse(formattedResults, query);
    }
  }

  formatProductList(results, query) {
    const intro = this.promptData.response_templates.product_list_intro;
    let response = `${intro}\n\n`;
    
    for (const [category, products] of Object.entries(results.categories)) {
      response += `**${category}:**\n`;
      
      products.forEach((product, index) => {
        if (product.nombre) {
          response += `${index + 1}. ${product.nombre}`;
          if (product.codigo) response += ` (${product.codigo})`;
          if (product.marca) response += ` - ${product.marca}`;
          if (product.precio) response += ` - $${product.precio}`;
          response += '\n';
        } else if (product.contenido) {
          response += `${index + 1}. ${product.contenido}\n`;
        }
      });
      response += '\n';
    }
    
    if (results.totalProducts > 10) {
      response += `\n📋 Mostrando ${Math.min(10, results.totalProducts)} de ${results.totalProducts} productos encontrados.`;
    }
    
    return response.trim();
  }

  formatSpecificResponse(results, query) {
    if (results.matches.length === 0) {
      return this.getQueryFallback({ producto: true, general: false });
    }
    
    return results.matches[0].output;
  }

  // Métodos de compatibilidad
  getQueryPatterns() {
    return this.promptData.system_prompts.query_analysis.patterns;
  }

  getFallback(type) {
    return this.promptData.fallback_responses[type] || 'No hay información disponible.';
  }

  getCompanyInfo() {
    return this.companyInfo;
  }

  getValidationConfig() {
    return {
      invalid_patterns: [
        'no puedo|no sé|no tengo información|disculpa',
        'error|problema|fallo',
        '^\\s*$'
      ],
      min_length: 10,
      max_length: 2000
    };
  }
}

module.exports = new TemplateManager();