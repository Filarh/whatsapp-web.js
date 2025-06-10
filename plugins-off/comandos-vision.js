/**
 * Plugin de comandos de visión por computadora
 * Integra un modelo MobileVIT v2_025 ONNX para análisis de llaves
 */

const { MessageMedia } = require('whatsapp-web.js');
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { crearDirectorio } = require('../utils/helper');

// Variable para almacenar las etiquetas
let etiquetas = {};

// Función para cargar etiquetas desde el archivo JSON
function cargarEtiquetas(rutaJson) {
    try {
        if (fs.existsSync(rutaJson)) {
            const contenido = fs.readFileSync(rutaJson, 'utf8');
            etiquetas = JSON.parse(contenido);
            console.log('Etiquetas cargadas correctamente desde:', rutaJson);
            return true;
        } else {
            console.error('Archivo de etiquetas no encontrado:', rutaJson);
            // Cargar etiquetas por defecto
            etiquetas = {
                'brand': ['marca1', 'marca2', 'marca3'],
                'subbrand': ['submarca1', 'submarca2', 'submarca3'],
                'side': ['lado1', 'lado2'],
                'pins': ['2 pines', '3 pines', '4 pines', '5 pines'],
                'model': ['modelo1', 'modelo2', 'modelo3'],
                'material': ['metal', 'plástico', 'mixto']
            };
            console.log('Usando etiquetas por defecto');
            return false;
        }
    } catch (error) {
        console.error('Error al cargar etiquetas:', error);
        // Cargar etiquetas por defecto
        etiquetas = {
            'brand': ['marca1', 'marca2', 'marca3'],
            'subbrand': ['submarca1', 'submarca2', 'submarca3'],
            'side': ['lado1', 'lado2'],
            'pins': ['2 pines', '3 pines', '4 pines', '5 pines'],
            'model': ['modelo1', 'modelo2', 'modelo3'],
            'material': ['metal', 'plástico', 'mixto']
        };
        console.log('Usando etiquetas por defecto debido a un error');
        return false;
    }
}

// Función para decodificar índices a etiquetas
function decodificarEtiqueta(campo, indice) {
    if (etiquetas[campo] && etiquetas[campo][indice] !== undefined) {
        return etiquetas[campo][indice];
    }
    return `desconocido-${indice}`;
}

module.exports = (client, config) => {
    const prefijo = config.bot.prefijo;
    const modelosDir = path.join(__dirname, '../models');
    const rutaModelo = path.join(modelosDir, 'mobilevit_v2_025.onnx');
    const rutaEtiquetas = path.join(modelosDir, 'etiquetas_modelo.json');
    
    // Asegurarse que existe el directorio de modelos
    crearDirectorio(modelosDir);
    
    // Cargar etiquetas desde el archivo JSON
    cargarEtiquetas(rutaEtiquetas);
    
    // Variable para almacenar la sesión del modelo
    let session = null;
    
    // Función para cargar el modelo
    async function cargarModelo() {
        try {
            if (!fs.existsSync(rutaModelo)) {
                console.error(`Modelo no encontrado en: ${rutaModelo}`);
                return false;
            }
            
            // Cargar el modelo ONNX
            session = await ort.InferenceSession.create(rutaModelo);
            console.log('Modelo ONNX cargado correctamente');
            return true;
        } catch (error) {
            console.error('Error al cargar el modelo ONNX:', error);
            return false;
        }
    }
    
    // Función para preprocesar la imagen
    async function preprocesarImagen(buffer) {
        try {
            // Redimensionar a 224x224 y normalizar
            const imagenProcesada = await sharp(buffer)
                .resize(224, 224)
                .raw()
                .toBuffer();
            
            // Convertir a tensor formato [1, 3, 224, 224]
            const imagenArray = new Float32Array(1 * 3 * 224 * 224);
            const pixelCount = 224 * 224;
            
            // Normalizar y reordenar canales (RGB -> formato esperado por el modelo)
            for (let i = 0; i < pixelCount; i++) {
                // BGR en lugar de RGB si es necesario según tu modelo
                imagenArray[i] = imagenProcesada[i * 3] / 255.0;                         // R
                imagenArray[i + pixelCount] = imagenProcesada[i * 3 + 1] / 255.0;        // G
                imagenArray[i + pixelCount * 2] = imagenProcesada[i * 3 + 2] / 255.0;    // B
            }
            
            return imagenArray;
        } catch (error) {
            console.error('Error al preprocesar imagen:', error);
            throw error;
        }
    }
    
    // Función para realizar inferencia
    async function inferencia(imagenBuffer) {
        try {
            if (!session) {
                const modeloCargado = await cargarModelo();
                if (!modeloCargado) {
                    throw new Error('No se pudo cargar el modelo');
                }
            }
            
            // Preprocesar imagen
            const imagenProcesada = await preprocesarImagen(imagenBuffer);
            
            // Crear tensor de entrada
            const tensor = new ort.Tensor('float32', imagenProcesada, [1, 3, 224, 224]);
            
            // Ejecutar inferencia
            const feeds = { input: tensor };
            const resultados = await session.run(feeds);
            
            // Procesar resultados - ajustar según las salidas específicas de tu modelo
            const campos = ['brand', 'subbrand', 'side', 'pins', 'model', 'material'];
            const predicciones = {};
            
            // Extraer resultado para cada campo
            // Nota: Este procesamiento debe ajustarse según la estructura de salida real de tu modelo
            for (let i = 0; i < campos.length; i++) {
                const campo = campos[i];
                const outputTensor = resultados[`output_${i}`]; // Ajustar nombre según tu modelo
                if (outputTensor) {
                    // Aplicar softmax para obtener probabilidades
                    const softmax = aplicarSoftmax(Array.from(outputTensor.data));
                    const indiceMax = softmax.indexOf(Math.max(...softmax));
                    const confianza = softmax[indiceMax];
                    
                    predicciones[campo] = {
                        valor: decodificarEtiqueta(campo, indiceMax),
                        confianza: Math.round(confianza * 100)
                    };
                }
            }
            
            return predicciones;
        } catch (error) {
            console.error('Error en inferencia:', error);
            throw error;
        }
    }
    
    // Función auxiliar para aplicar softmax
    function aplicarSoftmax(arr) {
        const max = Math.max(...arr);
        const exp = arr.map(x => Math.exp(x - max));
        const sum = exp.reduce((acc, val) => acc + val, 0);
        return exp.map(x => x / sum);
    }
    
    // Lista de comandos de visión
    const comandos = {
        'analizarllave': async (message) => {
            if (!message.hasMedia) {
                if (message.hasQuotedMsg) {
                    const quotedMsg = await message.getQuotedMessage();
                    if (quotedMsg.hasMedia) {
                        analizarImagen(quotedMsg, message);
                    } else {
                        message.reply('El mensaje citado no contiene una imagen');
                    }
                } else {
                    message.reply('Para analizar una llave, envía una imagen con el comando o responde a una imagen con el comando');
                }
            } else {
                analizarImagen(message, message);
            }
        }
    };
    
    // Función auxiliar para analizar imágenes
    async function analizarImagen(mediaMsg, replyMsg) {
        try {
            replyMsg.reply('Analizando imagen, por favor espera un momento...');
            
            // Descargar la imagen
            const media = await mediaMsg.downloadMedia();
            if (!media || !media.data) {
                replyMsg.reply('No pude descargar la imagen');
                return;
            }
            
            // Convertir base64 a buffer
            const buffer = Buffer.from(media.data, 'base64');
            
            // Realizar inferencia
            const predicciones = await inferencia(buffer);
            
            // Generar texto de resultados técnicos para la consola
            const textoTecnico = Object.entries(predicciones)
                .map(([campo, { valor, confianza }]) => `🔑 ${campo.charAt(0).toUpperCase() + campo.slice(1)}: ${valor} (${confianza}%)`)
                .join('\n');
            
            // Calcular confianza promedio para la consola
            const confianzaPromedio = Math.round(
                Object.values(predicciones).reduce((sum, { confianza }) => sum + confianza, 0) / 
                Object.values(predicciones).length
            );
            
            // Generar texto amigable para la consola
            const textoAmigable = 
                `👋 ¡Hola! Detecté que esta llave parece ser una **${predicciones.brand.valor}** ` +
                `submodelo **${predicciones.subbrand.valor}**, ` +
                `de tipo **${predicciones.material.valor}**.\n\n` +
                `🔹 Lado: **${predicciones.side.valor}**\n` +
                `🔹 Pines: **${predicciones.pins.valor}**\n` +
                `🔹 Modelo: **${predicciones.model.valor}**\n\n` +
                `📈 Estoy aproximadamente **${confianzaPromedio}% seguro**. 🔥`;
            
            // Imprimir todo el detalle en la consola
            console.log('\n===== ANÁLISIS DE LLAVE =====');
            console.log(textoTecnico);
            console.log('\n' + textoAmigable);
            console.log('=============================\n');
            
            // Enviar solo un mensaje simple al chat
            replyMsg.reply(`🤔 Esa es una *${predicciones.brand.valor} ${predicciones.model.valor}*`);
        } catch (error) {
            console.error('Error al analizar imagen:', error);
            replyMsg.reply('No pude analizar la imagen. Asegúrate de que sea una foto clara de una llave.');
        }
    }
    
    // Intentar cargar el modelo al iniciar el plugin
    cargarModelo();
    
    // Registrar handler para escuchar mensajes
    client.on('message', async (message) => {
        // Ignorar mensajes propios
        if (message.fromMe) return;
        
        // Solo procesar comandos que empiecen con el prefijo
        if (!message.body.startsWith(prefijo)) return;
        
        // Extraer el comando y los argumentos
        const args = message.body.slice(prefijo.length).trim().split(/ +/);
        const comando = args.shift().toLowerCase();
        
        // Verificar si existe el comando en nuestra lista
        if (comandos[comando]) {
            try {
                // Ejecutar el comando
                await comandos[comando](message, args);
            } catch (error) {
                console.error(`Error en comando ${comando}:`, error);
                message.reply('Ocurrió un error al procesar el comando. Inténtalo de nuevo más tarde.');
            }
        }
    });
    
    // Retornar metadatos del plugin
    return {
        nombre: 'Comandos de Visión',
        descripcion: 'Proporciona comandos para análisis de imágenes usando un modelo MobileVIT',
        version: '1.0.0',
        comandos: Object.keys(comandos).map(cmd => `${prefijo}${cmd}`)
    };
}; 