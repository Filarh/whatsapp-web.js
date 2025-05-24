// firebase.js
const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');

// Configuración del proyecto de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyC1Xtt6g0VvZlOnIXZpk6wSU8qEcKsHbrA",
  authDomain: "stockredig-16721.firebaseapp.com",
  projectId: "stockredig-16721",
  storageBucket: "stockredig-16721.firebasestorage.app",
  messagingSenderId: "298587383724",
  appId: "1:298587383724:web:330744568b983c08d7fc09",
  measurementId: "G-2XY52NWTJ2"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar Firestore
const db = getFirestore(app);

// Función helper para inicializar usuarios en Firebase
async function inicializarUsuariosEnFirebase() {
  const { doc, setDoc } = require('firebase/firestore');
  const fs = require('fs');
  const path = require('path');
  
  try {
    const usuariosPath = path.join(__dirname, 'data/usuarios.json');
    const usuarios = JSON.parse(fs.readFileSync(usuariosPath, 'utf-8'));
    
    for (const [numero, userData] of Object.entries(usuarios)) {
      const userDoc = doc(db, 'usuarios', numero);
      await setDoc(userDoc, {
        ...userData,
        sincronizado: true,
        fecha_sincronizacion: new Date()
      }, { merge: true });
      console.log(`Usuario ${userData.nombre} sincronizado en Firebase`);
    }
    
    console.log('Todos los usuarios han sido sincronizados con Firebase');
  } catch (error) {
    console.error('Error sincronizando usuarios con Firebase:', error);
  }
}

// Función para agregar nuevo usuario
async function agregarUsuario(numero, datosUsuario) {
  const { doc, setDoc } = require('firebase/firestore');
  
  try {
    const numeroLimpio = numero.replace(/[^\d]/g, '').replace(/^593/, '').replace(/^0/, '');
    const userDoc = doc(db, 'usuarios', numeroLimpio);
    
    const nuevoUsuario = {
      nombre: datosUsuario.nombre,
      telefono: datosUsuario.telefono,
      default_lora: datosUsuario.default_lora || null,
      activo: true,
      fecha_registro: new Date(),
      usos: 0,
      ultimo_uso: null
    };
    
    await setDoc(userDoc, nuevoUsuario);
    console.log(`Usuario ${datosUsuario.nombre} agregado exitosamente`);
    return true;
  } catch (error) {
    console.error('Error agregando usuario:', error);
    return false;
  }
}

// Función para actualizar LoRA de usuario
async function actualizarLoraUsuario(numero, nuevaLora) {
  const { doc, updateDoc } = require('firebase/firestore');
  
  try {
    const numeroLimpio = numero.replace(/[^\d]/g, '').replace(/^593/, '').replace(/^0/, '');
    const userDoc = doc(db, 'usuarios', numeroLimpio);
    
    await updateDoc(userDoc, {
      default_lora: nuevaLora,
      fecha_actualizacion: new Date()
    });
    
    console.log(`LoRA actualizada para usuario ${numero}: ${nuevaLora}`);
    return true;
  } catch (error) {
    console.error('Error actualizando LoRA:', error);
    return false;
  }
}

module.exports = { 
  app, 
  db, 
  inicializarUsuariosEnFirebase,
  agregarUsuario,
  actualizarLoraUsuario
};
