// plugins/generarimg.js
const { MessageMedia } = require('whatsapp-web.js');
const { crearDirectorio } = require('../utils/helper');
const procesadorImagen  = require('../utils/procesador-imagen');
const gestorUsuarios = require('../utils/gestor-usuarios');
const procesadorLenguaje = require('../utils/procesador-lenguaje');


const TEMP_DIR = './temp';

module.exports = (client, config) => {
  const prefijo = config.bot.prefijo;
  crearDirectorio(TEMP_DIR);

  const comandos = {
    'generarimg': async (message, args) => {
    const rawNum = message.from.replace('@c.us','');
    const numero = gestorUsuarios.limpiarNumero(rawNum);
    const usuario = await gestorUsuarios.obtener(rawNum);

    if (!usuario) {
        message.reply(procesadorLenguaje.obtenerMensajeRechazo());
        return;
    }

    await gestorUsuarios.asegurarFirestore(numero, usuario);

    const texto = args.join(' ');

    try {
        const resultado = await procesadorImagen.generar(texto, usuario);

        if (!resultado.success) {
        message.reply(resultado.error);
        return;
        }

        // ✅ Mostrar mensaje solo cuando RunPod respondió OK
        await message.reply('🧠 Estoy trabajando en tu imagen, dame unos segundos...');

        const media = MessageMedia.fromFilePath(resultado.imagePath);

        // ✅ Frases aleatorias afectuosas
        const frases = [
        "💌 Aquí está tu imagen, espero que te encante ✨",
        "🎁 Hecha con cariño para ti 💖",
        "🌊 Esta salió especial, disfrútala",
        "✨ Como lo pediste... ¡con todo mi estilo!",
        "💫 Espero que esta imagen saque una sonrisa en ti"
        ];
        const fraseAleatoria = frases[Math.floor(Math.random() * frases.length)];

        const caption =
        `${fraseAleatoria}\n` +
        `👤 ${usuario.nombre}` + '\n' +
        (resultado.lora ? `🎭 ${resultado.lora}` : '');

        await message.reply(media, null, { caption });

        require('fs').unlinkSync(resultado.imagePath);
        await gestorUsuarios.actualizarUso(numero, usuario);

        // 🛠 Log interno para debug (incluye prompt original)
        console.log('📤 Imagen enviada con prompt:', texto);

    } catch (err) {
        console.error('Error enviando imagen:', err);
        message.reply('Ocurrió un error generando o enviando la imagen. Intenta más tarde.');
    }
    },


    'prompt': async (message, args) => {
      if (args.length === 0) {
        message.reply(`🎲 Prompt aleatorio:\n"${procesadorLenguaje.obtenerPromptAleatorio()}"`);
      } else {
        await comandos.generarimg(message, args);
      }
    }
  };

  client.on('message', async message => {
    if (message.fromMe) return;
    
    const raw = message.from.replace('@c.us','');
    const usuario = await gestorUsuarios.obtener(raw);

    // Comandos con prefijo
    if (message.body.startsWith(prefijo)) {
      const parts = message.body.slice(prefijo.length).trim().split(/ +/);
      const cmd = parts.shift().toLowerCase();
      if (comandos[cmd]) {
        try { 
          await comandos[cmd](message, parts); 
        } catch (e) { 
          message.reply(config.cliente.respuestas.error || 'Ocurrió un error.'); 
        }
      }
      return;
    }

    // Lenguaje natural solo para usuarios autorizados
    if (usuario && procesadorLenguaje.essolicitudImagen(message.body)) {
      await comandos.generarimg(message, [message.body]);
    }
  });

  return {
    nombre: 'Generador de Imágenes AI con Firebase',
    descripcion: 'RunPod + Flux con upsert automático en Firestore y NL',
    version: '2.1.0',
    comandos: Object.keys(comandos).map(c => `${prefijo}${c}`),
    usuarios_autorizados: 'Via Firestore',
    lenguaje_natural: 'Activado'
  };
};