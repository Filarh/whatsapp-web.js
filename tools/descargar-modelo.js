/**
 * Script para descargar el modelo ONNX de MobileVIT v2_025
 * Uso: node tools/descargar-modelo.js <URL_DEL_MODELO>
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Función para crear directorios recursivamente
function crearDirectorio(ruta) {
    if (!fs.existsSync(ruta)) {
        fs.mkdirSync(ruta, { recursive: true });
        console.log(`Directorio creado: ${ruta}`);
    }
}

// Ruta donde se guardará el modelo
const modelDir = path.join(__dirname, '../models');
const modelPath = path.join(modelDir, 'mobilevit_v2_025.onnx');

// Asegurarse que existe el directorio
crearDirectorio(modelDir);

// URL del modelo proporcionada como argumento
const modelUrl = process.argv[2];

if (!modelUrl) {
    console.error('Por favor, proporciona la URL del modelo como argumento:');
    console.error('  node tools/descargar-modelo.js <URL_DEL_MODELO>');
    process.exit(1);
}

console.log(`Descargando modelo desde: ${modelUrl}`);
console.log(`Se guardará en: ${modelPath}`);

// Determinar si usar http o https según la URL
const clientModule = modelUrl.startsWith('https') ? https : http;

// Descargar el archivo
const fileStream = fs.createWriteStream(modelPath);
const request = clientModule.get(modelUrl, (response) => {
    if (response.statusCode !== 200) {
        console.error(`Error al descargar: ${response.statusCode} - ${response.statusMessage}`);
        fs.unlinkSync(modelPath); // Eliminar archivo parcial
        process.exit(1);
    }
    
    // Obtener tamaño total para mostrar progreso
    const totalSize = parseInt(response.headers['content-length'] || '0', 10);
    let downloadedSize = 0;
    
    // Actualizar progreso de descarga
    response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
            const percent = Math.round((downloadedSize / totalSize) * 100);
            process.stdout.write(`Progreso: ${percent}% (${downloadedSize} / ${totalSize} bytes)\r`);
        } else {
            process.stdout.write(`Descargados: ${downloadedSize} bytes\r`);
        }
    });
    
    // Redirigir la respuesta al archivo
    response.pipe(fileStream);
});

// Manejar errores
request.on('error', (err) => {
    console.error(`Error en la descarga: ${err.message}`);
    // Eliminar archivo parcial
    if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
    }
    process.exit(1);
});

// Cerrar el archivo y mostrar mensaje de éxito cuando termine
fileStream.on('finish', () => {
    fileStream.close();
    console.log('\nDescarga completada.');
    console.log(`Modelo guardado en: ${modelPath}`);
    console.log('Puedes usar el comando !analizarllave con una imagen para hacer inferencias.');
});

// Manejar error de escritura
fileStream.on('error', (err) => {
    console.error(`Error al escribir archivo: ${err.message}`);
    // Eliminar archivo parcial
    if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
    }
    process.exit(1);
}); 