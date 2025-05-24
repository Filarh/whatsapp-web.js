const fs = require('fs');
const path = require('path');
const { translate } = require('@vitalets/google-translate-api');

const PLANTILLAS_PATH = path.join(__dirname, '../data/plantillas.json');
const PROMPTS_PATH = path.join(__dirname, '../data/prompts.json');
const MULETILLAS_PATH = path.join(__dirname, '../data/muletillas.json');

const mensajesRechazo = [
  "y tu quien eres? 🥴",
  "Mmm... no te conozco 🤔",
  "¿Perdón? ¿Tenemos confianza? 😅",
  "Creo que te equivocaste de número 🙃",
  "Solo trabajo con gente conocida 😎",
  "¿Te puedo ayudar en algo más? (Spoiler: No) 🤭"
];

function cargarJSON(ruta, defecto = {}) {
  try { 
    return JSON.parse(fs.readFileSync(ruta, 'utf-8')); 
  } catch { 
    return defecto; 
  }
}

function obtenerPlantillas() {
  return cargarJSON(PLANTILLAS_PATH, {});
}

function obtenerPrompts() {
  return cargarJSON(PROMPTS_PATH, []);
}

function obtenerMuletillas() {
  return cargarJSON(MULETILLAS_PATH, {
    solicitud: [
      "hazme", "genera", "crea", "quiero", "necesito", "puedes hacer",
      "me haces", "haz", "crear", "generar", "hacer", "dame", "hágame"
    ],
    imagen: [
      "imagen", "foto", "picture", "pic", "dibujo", "arte", "ilustracion",
      "ilustración", "pintura", "dibujo", "arte"
    ],
    conectores: [
      "una", "un", "de", "del", "la", "el", "con", "en", "tipo", "estilo", 
      "como", "para", "que", "me", "mi", "por", "favor", "porfavor", "mine"
    ],
    despedidas: [
      "gracias", "thank you", "thanks", "perfecto", "excelente", "genial"
    ],
    pronombres: [
      "yo", "mi", "me", "mio", "mía", "conmigo", "myself", "mine"
    ]
  });
}

function limpiarTextoParaPrompt(texto) {
  console.log('🧹 Limpiando texto original:', texto);
  
  const muletillas = obtenerMuletillas();
  let textoLimpio = texto.toLowerCase().trim();
  
  // Remover muletillas de solicitud (hazme, genera, etc.)
  muletillas.solicitud.forEach(m => {
    const regex = new RegExp(`\\b${m}\\b`, 'gi');
    textoLimpio = textoLimpio.replace(regex, '');
  });
  
  // Remover palabras de imagen (imagen, foto, etc.)
  muletillas.imagen.forEach(m => {
    const regex = new RegExp(`\\b${m}\\b`, 'gi');
    textoLimpio = textoLimpio.replace(regex, '');
  });
  
  // Remover conectores (una, un, de, etc.)
  muletillas.conectores.forEach(m => {
    const regex = new RegExp(`\\b${m}\\b`, 'gi');
    textoLimpio = textoLimpio.replace(regex, '');
  });
  
  // Remover pronombres personales
  muletillas.pronombres.forEach(m => {
    const regex = new RegExp(`\\b${m}\\b`, 'gi');
    textoLimpio = textoLimpio.replace(regex, '');
  });
  
  // Remover despedidas
  muletillas.despedidas.forEach(m => {
    const regex = new RegExp(`\\b${m}\\b`, 'gi');
    textoLimpio = textoLimpio.replace(regex, '');
  });

  // Limpiar espacios múltiples y caracteres especiales
  textoLimpio = textoLimpio
    .replace(/\s+/g, ' ')
    .replace(/[¿?¡!]/g, '')
    .trim();
  
  console.log('✨ Texto limpio:', textoLimpio);
  return textoLimpio;
}

function essolicitudImagen(texto) {
  const muletillas = obtenerMuletillas();
  const lower = texto.toLowerCase();

  const tieneSolicitud = muletillas.solicitud.some(m => 
    new RegExp(`\\b${m}\\b`, 'i').test(lower)
  );
  const tieneImagen = muletillas.imagen.some(m => 
    new RegExp(`\\b${m}\\b`, 'i').test(lower)
  );

  const esSolicitud = tieneSolicitud && tieneImagen;
  console.log('🔍 Analizando solicitud de imagen:', { texto, esSolicitud, tieneSolicitud, tieneImagen });
  
  return esSolicitud;
}

function procesarLenguajeNatural(texto) {
  console.log('🎯 Procesando lenguaje natural:', texto);
  
  const plantillas = obtenerPlantillas();
  const textoLimpio = limpiarTextoParaPrompt(texto);
  const lower = textoLimpio.toLowerCase();

  for (const [clave, cfg] of Object.entries(plantillas)) {
    const palabraCoincidente = (cfg.palabras_clave || []).find(w => lower.includes(w.toLowerCase()));
    if (palabraCoincidente) {
      console.log('🎨 Plantilla encontrada:', {
        plantilla: clave,
        palabraClave: palabraCoincidente,
        lora: cfg.lora || 'ninguno',
        activationToken: cfg.activation_token || 'ninguno'
      });
      
      // Remover la palabra clave del texto descriptivo
      const textoDescriptivo = textoLimpio
        .replace(new RegExp(palabraCoincidente, 'gi'), '')
        .replace(/\s+/g, ' ')
        .trim();
      
      return {
        prompt: cfg.prompt,
        lora: cfg.lora || null,
        activationToken: cfg.activation_token || '',
        textoDescriptivo: textoDescriptivo,
        plantillaUsada: clave
      };
    }
  }

  console.log('📝 Sin plantilla específica, usando texto descriptivo libre');
  return {
    prompt: null,
    lora: null,
    activationToken: '',
    textoDescriptivo: textoLimpio,
    plantillaUsada: null
  };
}

async function traducirTexto(texto) {
  if (!texto || texto.trim() === '') {
    console.log('⚠️ Texto vacío para traducir');
    return '';
  }

  console.log('🌐 Traduciendo texto:', texto);
  
  try {
    const res = await translate(texto, { to: 'en' });
    const traducido = res.text || texto;
    console.log('✅ Traducción exitosa:', traducido);
    return traducido;
  } catch (error) {
    console.warn('❌ Error traduciendo:', error.message);
    console.log('🔄 Usando texto original como fallback');
    return texto;
  }
}

function obtenerPromptAleatorio() {
  const prompts = obtenerPrompts();
  const promptAleatorio = prompts.length > 0 
    ? prompts[Math.floor(Math.random() * prompts.length)]
    : "a beautiful landscape, highly detailed, 8k";
  
  console.log('🎲 Prompt aleatorio seleccionado:', promptAleatorio);
  return promptAleatorio;
}

function obtenerMensajeRechazo() {
  return mensajesRechazo[Math.floor(Math.random() * mensajesRechazo.length)];
}

async function construirPromptFinal(texto, procesamiento, usuario) {
  console.log('🔧 Construyendo prompt final...');
  console.log('📋 Datos de procesamiento:', {
    plantillaUsada: procesamiento.plantillaUsada,
    tienePromptBase: !!procesamiento.prompt,
    textoDescriptivo: procesamiento.textoDescriptivo,
    lora: procesamiento.lora,
    activationToken: procesamiento.activationToken
  });
  
  let promptFinal;
  
  if (procesamiento.prompt) {
    // Usar plantilla con descripción adicional
    const descripcion = procesamiento.textoDescriptivo;
    if (descripcion && descripcion.trim() !== '') {
      const descripcionTraducida = await traducirTexto(descripcion);
      if (descripcionTraducida) {
        promptFinal = `${procesamiento.prompt}, ${descripcionTraducida}`;
      } else {
        promptFinal = procesamiento.prompt;
      }
    } else {
      promptFinal = procesamiento.prompt;
    }
  } else {
    // Sin plantilla, usar descripción libre o prompt aleatorio
    if (procesamiento.textoDescriptivo && procesamiento.textoDescriptivo.trim() !== '') {
      promptFinal = await traducirTexto(procesamiento.textoDescriptivo);
    } else {
      promptFinal = obtenerPromptAleatorio();
    }
  }

  // Construir activation token desde el LoRA
  const lora = procesamiento.lora || usuario.default_lora;
  let activationToken = '';
  
  if (lora) {
    // El activation token es el nombre del archivo sin la extensión
    activationToken = lora.replace('.safetensors', '').replace('.ckpt', '');
    console.log('🏷️ Activation token derivado del LoRA:', activationToken);
    
    // Agregar género del usuario
    const genero = usuario.gender || 'person';
    console.log('👤 Género del usuario:', genero);
    
    // Construir prompt con activation token y género
    promptFinal = `portrait of ${activationToken} ${genero}, ${promptFinal}`;
    console.log('🔗 Activation token y género agregados al prompt');
  }

  // Limpiar el prompt final de cualquier artefacto residual
  promptFinal = promptFinal
    .replace(/,\s*,/g, ',') // Remover comas dobles
    .replace(/,\s*$/, '') // Remover coma al final
    .replace(/^\s*,/, '') // Remover coma al inicio
    .replace(/\s+/g, ' ') // Normalizar espacios
    .trim();

  console.log('🎯 Prompt final construido:', promptFinal);
  return promptFinal;
}

module.exports = {
  obtenerPlantillas,
  obtenerPrompts,
  obtenerMuletillas,
  limpiarTextoParaPrompt,
  essolicitudImagen,
  procesarLenguajeNatural,
  traducirTexto,
  obtenerPromptAleatorio,
  obtenerMensajeRechazo,
  construirPromptFinal
};