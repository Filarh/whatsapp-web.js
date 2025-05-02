/**
 * Archivo de funciones auxiliares para el bot
 */

const fs = require('fs');
const path = require('path');

/**
 * Crea un directorio si no existe
 * @param {string} dir - Ruta del directorio
 */
const crearDirectorio = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Directorio creado: ${dir}`);
    }
};

/**
 * Carga todos los archivos de un directorio
 * @param {string} dir - Directorio a cargar
 * @returns {Array} - Lista de archivos JS
 */
const cargarArchivos = (dir) => {
    if (!fs.existsSync(dir)) {
        crearDirectorio(dir);
        return [];
    }
    
    return fs.readdirSync(dir)
        .filter(file => file.endsWith('.js'))
        .map(file => path.join(dir, file));
};

/**
 * Formatea el tiempo en formato legible
 * @param {Date} fecha - Fecha a formatear
 * @returns {string} - Fecha formateada
 */
const formatearFecha = (fecha = new Date()) => {
    return fecha.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

/**
 * Formatea la hora en formato legible
 * @param {Date} fecha - Fecha a formatear
 * @returns {string} - Hora formateada
 */
const formatearHora = (fecha = new Date()) => {
    return fecha.toLocaleTimeString('es-ES');
};

/**
 * Comprueba si un mensaje contiene una palabra clave
 * @param {string} mensaje - Mensaje a comprobar
 * @param {Array} palabrasClave - Lista de palabras clave
 * @returns {boolean} - true si el mensaje contiene alguna palabra clave
 */
const contienePalabraClave = (mensaje, palabrasClave) => {
    const mensajeLower = mensaje.toLowerCase();
    return palabrasClave.some(palabra => mensajeLower.includes(palabra.toLowerCase()));
};

/**
 * Registra un mensaje en la consola con formato
 * @param {string} tipo - Tipo de mensaje (INFO, ERROR, etc)
 * @param {string} mensaje - Mensaje a mostrar
 */
const log = (tipo, mensaje) => {
    const fecha = new Date().toISOString();
    console.log(`[${fecha}] [${tipo}] ${mensaje}`);
};

module.exports = {
    crearDirectorio,
    cargarArchivos,
    formatearFecha,
    formatearHora,
    contienePalabraClave,
    log
}; 