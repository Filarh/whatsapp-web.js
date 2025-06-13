'use strict';

const fs = require('fs');
const path = require('path');

class TemplateManager {
  constructor() {
    this.dataPath = path.resolve('./data');
    this.cache = new Map();
    this.loadAllData();
  }

  loadAllData() {
    try {
      // Cargar datos de la empresa
      this.companyData = this.loadJSON('company.json');
      
      // Cargar fallbacks
      this.fallbackData = this.loadJSON('fallbacks.json');
      
      // Cargar prompts
      this.promptData = this.loadJSON('prompts.json');
      
      // Crear variables de plantilla
      this.setupTemplateVars();
      
    } catch (error) {
      console.error('Error cargando datos de plantilla:', error);
      throw error;
    }
  }

  loadJSON(filename) {
    const filePath = path.join(this.dataPath, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Archivo de datos no encontrado: ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  setupTemplateVars() {
    const company = this.companyData.company;
    const services = this.companyData.services;
    const products = this.companyData.products;

    this.templateVars = {
      // Información básica de la empresa
      company_name: company.name,
      bot_name: company.displayName,
      industry: company.industry,
      
      // Servicios y productos
      services_list: services.join(', '),
      main_product: this.extractMainProduct(products),
      product_keywords: this.generateProductKeywords(products),
      
      // Contacto
      phone: this.companyData.contact.phone,
      whatsapp: this.companyData.contact.whatsapp,
      
      // Ubicación
      city: this.companyData.location.city,
      country: this.companyData.location.country
    };
  }

  extractMainProduct(products) {
    // Extrae el producto principal (el primero de la lista)
    return products[0]?.toLowerCase() || 'producto';
  }

  generateProductKeywords(products) {
    // Genera palabras clave para detección de productos
    const keywords = products.map(p => 
      p.toLowerCase().split(' ').filter(word => word.length > 2)
    ).flat();
    
    return [...new Set(keywords)].join('|');
  }

  // Reemplaza variables en un texto
  replaceVars(text, additionalVars = {}) {
    if (typeof text !== 'string') return text;
    
    const allVars = { ...this.templateVars, ...additionalVars };
    
    return text.replace(/\{([^}]+)\}/g, (match, key) => {
      return allVars[key] || match;
    });
  }

  // Obtiene un prompt del sistema
  getSystemPrompt(promptKey = 'main_instruction') {
    const prompt = this.promptData.system_prompts[promptKey];
    return this.replaceVars(prompt);
  }

  // Obtiene un fallback
  getFallback(type = 'default', additionalVars = {}) {
    const fallback = this.fallbackData.fallbacks[type] || 
                    this.fallbackData.fallbacks.default;
    return this.replaceVars(fallback, additionalVars);
  }

  // Obtiene un saludo
  getGreeting(type = 'welcome') {
    const greeting = this.fallbackData.greetings[type];
    return this.replaceVars(greeting);
  }

  // Obtiene los patrones de consulta
  getQueryPatterns() {
    const patterns = this.promptData.system_prompts.query_analysis.patterns;
    const processedPatterns = {};
    
    for (const [key, pattern] of Object.entries(patterns)) {
      processedPatterns[key] = new RegExp(this.replaceVars(pattern), 'i');
    }
    
    return processedPatterns;
  }

  // Obtiene la configuración de validación
  getValidationConfig() {
    return this.fallbackData.validation;
  }

  // Obtiene información de la empresa
  getCompanyInfo() {
    return this.companyData;
  }

  // Obtiene fallbacks por patrón de consulta
  getQueryFallback(queryAnalysis) {
    const patterns = this.fallbackData.fallbacks.query_patterns;
    
    if (queryAnalysis.precio) return this.replaceVars(patterns.precio);
    if (queryAnalysis.ubicacion) return this.replaceVars(patterns.ubicacion);
    if (queryAnalysis.horario) return this.replaceVars(patterns.horario);
    if (queryAnalysis.producto && queryAnalysis.urgente) {
      return this.replaceVars(patterns.combo_producto_urgente);
    }
    if (queryAnalysis.servicio) return this.replaceVars(patterns.servicio);
    if (queryAnalysis.producto) return this.replaceVars(patterns.producto);
    if (queryAnalysis.urgente) return this.replaceVars(patterns.urgente);
    
    return this.getFallback('default');
  }

  // Recargar datos (útil para actualizaciones en caliente)
  reload() {
    this.cache.clear();
    this.loadAllData();
  }
}

// Singleton para uso global
const templateManager = new TemplateManager();

module.exports = templateManager;