// debug-ia.js
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Script de diagnóstico para el plugin comandos-ia
 * Coloca este archivo en la carpeta raíz del proyecto y ejecútalo con:
 *   node plugins/debug-ia.js
 */

// Configuración similar a la que usarías en tu bot
typeof config !== 'undefined' || (global.config = {});
const config = {
  directorios: {
    // Ruta absoluta al directorio de modelos (ajusta si tu carpeta de modelos está en otro lugar)
    modelos: path.resolve(__dirname, '../models')
  },
  plugins: {
    ia: true
  }
};

/**
 * Verifica la existencia y tamaño de archivos en el directorio de modelos
 * @param {string} modelosDir
 * @returns {boolean}
 */
function verificarArchivos(modelosDir) {
  console.log('\n📁 VERIFICANDO ARCHIVOS EN:', modelosDir);

  if (!fs.existsSync(modelosDir)) {
    console.log('❌ ERROR: El directorio de modelos no existe');
    console.log('   💡 SOLUCIÓN: Crea el directorio:', modelosDir);
    return false;
  }

  console.log('\n📋 Archivos encontrados:');
  const archivos = fs.readdirSync(modelosDir);
  archivos.forEach(file => {
    const filePath = path.join(modelosDir, file);
    const stats = fs.statSync(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`   - ${file} (${sizeMB} MB)`);
  });

  // Archivos esperados por el plugin IA
  const archivosEsperados = [
    { nombre: 'modelo-llama.gguf', alternativas: ['Llama-3.2-3B.Q4_0.gguf'] },
    { nombre: 'ses_st_dataset.csv', alternativas: [] }
  ];

  console.log('\n🔍 Verificando archivos necesarios:');
  archivosEsperados.forEach(archivo => {
    const rutaPrincipal = path.join(modelosDir, archivo.nombre);

    if (fs.existsSync(rutaPrincipal)) {
      console.log(`✅ ${archivo.nombre}: Encontrado`);
    } else {
      let encontradoAlternativa = false;
      for (const alt of archivo.alternativas) {
        const rutaAlt = path.join(modelosDir, alt);
        if (fs.existsSync(rutaAlt)) {
          console.log(`⚠️ ${archivo.nombre}: No encontrado, pero existe alternativa ${alt}`);
          console.log(`   💡 SOLUCIÓN: Renombra ${alt} a ${archivo.nombre}`);
          encontradoAlternativa = true;
          break;
        }
      }
      if (!encontradoAlternativa) {
        console.log(`❌ ${archivo.nombre}: No encontrado`);
        console.log(`   💡 SOLUCIÓN: Asegúrate de tener este archivo en ${modelosDir}`);
      }
    }
  });

  return true;
}

/**
 * Verifica que las dependencias principales estén instaladas
 */
function verificarDependencias() {
  console.log('\n📦 VERIFICANDO DEPENDENCIAS:');
  const dependencias = [
    '@xenova/transformers',
    'node-llama-cpp',
    'csv-parser'
  ];
  dependencias.forEach(dep => {
    try {
      require.resolve(dep);
      console.log(`✅ ${dep}: Instalado`);
    } catch (e) {
      console.log(`❌ ${dep}: No instalado`);
      console.log(`   💡 SOLUCIÓN: Ejecuta 'npm install ${dep}'`);
    }
  });
}

/**
 * Punto de entrada del diagnóstico
 */
async function diagnosticar() {
  console.log('🔧 HERRAMIENTA DE DIAGNÓSTICO PARA COMANDOS-IA');
  console.log('===============================================');

  // 1) Verificar archivos de modelo
  verificarArchivos(config.directorios.modelos);

  // 2) Verificar dependencias
  verificarDependencias();

  // 3) Sugerencias finales
  console.log('\n🔄 PRÓXIMOS PASOS:');
  console.log('1. Corrige los problemas identificados arriba');
  console.log('2. Asegúrate de que los nombres de los archivos coincidan con los esperados');
  console.log('3. Verifica que todas las dependencias estén instaladas');
  console.log('\nSi continúas teniendo problemas, revisa el código de comandos-ia.js en busca de errores');
}

diagnosticar()
  .then(() => console.log('\n✅ Diagnóstico completado'))
  .catch(e => console.error('❌ Error en diagnóstico:', e));
