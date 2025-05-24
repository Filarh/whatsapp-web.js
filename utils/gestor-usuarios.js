const fs = require('fs');
const path = require('path');
const { db } = require('../firebase');
const { doc, getDoc, setDoc } = require('firebase/firestore');

const USUARIOS_PATH = path.join(__dirname, '../data/usuarios.json');

function limpiarNumero(numero) {
  return numero.replace(/[^\d]/g, '').replace(/^593/, '').replace(/^0/, '');
}

async function obtener(numero) {
  const num = limpiarNumero(numero);
  
  // 1) Intentar Firestore primero
  try {
    const snap = await getDoc(doc(db, 'usuarios', num));
    if (snap.exists()) {
      return snap.data();
    }
  } catch (error) {
    console.warn('Firebase inaccesible:', error.message);
  }
  
  // 2) Fallback a archivo local
  try {
    const todosUsuarios = JSON.parse(fs.readFileSync(USUARIOS_PATH, 'utf-8'));
    return todosUsuarios[num] || null;
  } catch (error) {
    console.warn('Error leyendo usuarios locales:', error.message);
    return null;
  }
}

async function asegurarFirestore(numero, usuario) {
  try {
    const ref = doc(db, 'usuarios', numero);
    const snap = await getDoc(ref);
    
    if (!snap.exists()) {
      const nuevoUsuario = {
        nombre: usuario.nombre || 'Invitado',
        telefono: usuario.telefono || numero,
        default_lora: usuario.default_lora || null,
        gender: usuario.gender || 'person', // Campo género agregado
        activo: true,
        usos: usuario.usos || 0,
        ultimo_uso: usuario.ultimo_uso || null,
        settings: {
          resolution: usuario.settings?.resolution || '1024x1024'
        }
      };
      
      await setDoc(ref, nuevoUsuario, { merge: true });
      console.log(`👤 Usuario ${numero} creado en Firestore con género: ${nuevoUsuario.gender}`);
    } else {
      // Si el usuario existe pero no tiene género, agregarlo
      const datosExistentes = snap.data();
      if (!datosExistentes.gender) {
        await setDoc(ref, {
          gender: usuario.gender || 'person'
        }, { merge: true });
        console.log(`🚻 Género agregado a usuario existente ${numero}: ${usuario.gender || 'person'}`);
      }
    }
  } catch (error) {
    console.error('Error asegurando usuario en Firestore:', error.message);
  }
}

async function actualizarUso(numero, usuario) {
  try {
    const ref = doc(db, 'usuarios', numero);
    await setDoc(ref, {
      usos: (usuario.usos || 0) + 1,
      ultimo_uso: new Date()
    }, { merge: true });
  } catch (error) {
    console.error('Error actualizando uso del usuario:', error.message);
  }
}

async function actualizarGenero(numero, nuevoGenero) {
  try {
    const ref = doc(db, 'usuarios', numero);
    await setDoc(ref, {
      gender: nuevoGenero
    }, { merge: true });
    console.log(`🚻 Género actualizado para usuario ${numero}: ${nuevoGenero}`);
    return true;
  } catch (error) {
    console.error('Error actualizando género del usuario:', error.message);
    return false;
  }
}

async function obtenerConfiguracion(numero) {
  const usuario = await obtener(numero);
  return usuario ? {
    defaultLora: usuario.default_lora,
    gender: usuario.gender || 'person',
    resolution: usuario.settings?.resolution || '1024x1024',
    nombre: usuario.nombre
  } : null;
}

module.exports = {
  limpiarNumero,
  obtener,
  asegurarFirestore,
  actualizarUso,
  actualizarGenero,
  obtenerConfiguracion
};