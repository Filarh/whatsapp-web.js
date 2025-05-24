const axios = require('axios');
const fs = require('fs');
const path = require('path');
const procesadorLenguaje = require('./procesador-lenguaje');
require('dotenv').config();
const API_KEY = process.env.RUNPOD_API_KEY;
const ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID;

const RUNPOD_URL = `https://api.runpod.ai/v2/${ENDPOINT_ID}/runsync`;

const TEMP_DIR = './temp';
const WORKFLOW_PATH = path.join(__dirname, '../models/workflow_flux1_dev_wk.json');

function cargarWorkflow() {
  try {
    return JSON.parse(fs.readFileSync(WORKFLOW_PATH, 'utf-8'));
  } catch (error) {
    throw new Error('Error al leer el flujo de trabajo: ' + error.message);
  }
}

function configurarWorkflow(workflow, prompt, lora = null) {
  console.log('⚙️ Configurando workflow...');
  console.log('📝 Prompt para workflow:', prompt);
  console.log('🎭 LoRA para workflow:', lora || 'ninguno');
  
  // Configurar prompt en el nodo CLIPTextEncode
  const nodePrompt = Object.values(workflow.input.workflow)
    .find(n => n.class_type === 'CLIPTextEncode');
  
  if (nodePrompt) {
    nodePrompt.inputs.text = prompt;
    console.log('✅ Prompt configurado en workflow');
  } else {
    console.warn('⚠️ No se encontró nodo CLIPTextEncode en workflow');
  }
  
  // Configurar LoRA si está especificado
  if (lora) {
    const nodeLora = Object.values(workflow.input.workflow)
      .find(n => n.class_type === 'LoraLoader');
    
    if (nodeLora) {
      nodeLora.inputs.lora_name = lora;
      console.log('✅ LoRA configurado en workflow:', lora);
    } else {
      console.warn('⚠️ No se encontró nodo LoraLoader en workflow');
    }
  }
  
  return workflow;
}

async function llamarAPI(workflow) {
  console.log('🚀 Enviando solicitud a RunPod API...');
  
  try {
    const response = await axios.post(RUNPOD_URL, workflow, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 120000 // 2 minutos
    });
    
    console.log('✅ Respuesta recibida de RunPod API');
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('❌ Error de API:', error.response.status, error.response.data);
      throw new Error(`Error API: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.code === 'ECONNABORTED') {
      console.error('⏰ Timeout en API');
      throw new Error('Timeout: La generación tomó demasiado tiempo');
    } else {
      console.error('❌ Error de conexión:', error.message);
      throw new Error(`Error de conexión: ${error.message}`);
    }
  }
}

function guardarImagen(imagenBase64) {
  if (!imagenBase64) {
    throw new Error('No se recibió datos de imagen');
  }
  
  const fileName = path.join(TEMP_DIR, `img_${Date.now()}.png`);
  
  try {
    fs.writeFileSync(fileName, Buffer.from(imagenBase64, 'base64'));
    console.log('💾 Imagen guardada en:', fileName);
    return fileName;
  } catch (error) {
    throw new Error(`Error guardando imagen: ${error.message}`);
  }
}

async function generar(texto, usuario) {
  console.log('\n🎨 === INICIANDO GENERACIÓN DE IMAGEN ===');
  console.log('👤 Usuario:', usuario.nombre);
  console.log('📝 Prompt original del usuario:', `"${texto}"`);
  console.log('🚻 Género del usuario:', usuario.gender || 'no especificado');
  
  try {
    // 1. Procesar lenguaje natural
    console.log('\n🔍 PASO 1: Procesando lenguaje natural');
    const procesamiento = procesadorLenguaje.procesarLenguajeNatural(texto || '');
    
    // 2. Determinar LoRA (prioridad: plantilla > usuario default)
    console.log('\n🎭 PASO 2: Determinando LoRA');
    const lora = procesamiento.lora || usuario.default_lora;
    console.log('🎯 LoRA seleccionado:', lora || 'ninguno');
    console.log('📊 Origen LoRA:', procesamiento.lora ? 'plantilla' : 'usuario default');
    
    // 3. Construir prompt final
    console.log('\n🔧 PASO 3: Construyendo prompt final');
    const promptFinal = await procesadorLenguaje.construirPromptFinal(texto, procesamiento, usuario);
    
    // 4. Cargar y configurar workflow
    console.log('\n⚙️ PASO 4: Configurando workflow');
    const workflow = cargarWorkflow();
    const workflowConfigurado = configurarWorkflow(workflow, promptFinal, lora);
    
    // 5. Llamar a la API
    console.log('\n🚀 PASO 5: Llamando a RunPod API');
    const resultado = await llamarAPI(workflowConfigurado);
    
    // 6. Extraer y guardar imagen
    console.log('\n💾 PASO 6: Guardando imagen');
    const imagenBase64 = resultado?.output?.images?.[0]?.data;
    const rutaImagen = guardarImagen(imagenBase64);
    
    console.log('\n✅ === GENERACIÓN COMPLETADA EXITOSAMENTE ===');
    console.log('📁 Ruta imagen:', rutaImagen);
    console.log('🎯 Prompt final usado:', promptFinal);
    console.log('🎭 LoRA usado:', lora || 'ninguno');
    console.log('🏷️ Plantilla usada:', procesamiento.plantillaUsada || 'ninguna');
    
    return {
      success: true,
      imagePath: rutaImagen,
      prompt: promptFinal,
      lora: lora,
      plantillaUsada: procesamiento.plantillaUsada
    };
    
  } catch (error) {
    console.error('\n❌ === ERROR EN GENERACIÓN ===');
    console.error('Error generando imagen:', error.message);
    console.error('Usuario afectado:', usuario.nombre);
    console.error('Texto original:', texto);
    
    return {
      success: false,
      error: `Error generando imagen: ${error.message}`
    };
  }
}

module.exports = {
  generar,
  cargarWorkflow,
  configurarWorkflow,
  llamarAPI,
  guardarImagen
};