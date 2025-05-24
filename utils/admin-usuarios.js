const { db, agregarUsuario, actualizarLoraUsuario, inicializarUsuariosEnFirebase } = require('../config/firebase');
const { doc, getDoc, getDocs, collection, updateDoc, deleteDoc } = require('firebase/firestore');
const fs = require('fs');
const path = require('path');

class AdminUsuarios {
    constructor() {
        this.usuariosPath = path.join(__dirname, '../data/usuarios.json');
    }

    // Limpiar número de teléfono
    limpiarNumero(numero) {
        return numero.replace(/[^\d]/g, '').replace(/^593/, '').replace(/^0/, '');
    }

    // Listar todos los usuarios
    async listarUsuarios() {
        try {
            console.log('\n=== USUARIOS REGISTRADOS ===');
            const usuariosSnapshot = await getDocs(collection(db, 'usuarios'));
            
            if (usuariosSnapshot.empty) {
                console.log('No hay usuarios registrados en Firebase');
                return;
            }

            usuariosSnapshot.forEach((doc) => {
                const data = doc.data();
                console.log(`\n📱 ${data.nombre}`);
                console.log(`   Teléfono: ${data.telefono}`);
                console.log(`   LoRA: ${data.default_lora || 'Sin LoRA'}`);
                console.log(`   Activo: ${data.activo ? '✅' : '❌'}`);
                console.log(`   Usos: ${data.usos || 0}`);
                console.log(`   Último uso: ${data.ultimo_uso?.toDate?.() || 'Nunca'}`);
            });
        } catch (error) {
            console.error('Error listando usuarios:', error);
        }
    }

    // Agregar nuevo usuario
    async agregarNuevoUsuario(nombre, telefono, lora = null) {
        const numeroLimpio = this.limpiarNumero(telefono);
        
        const datosUsuario = {
            nombre,
            telefono,
            default_lora: lora
        };

        const exito = await agregarUsuario(numeroLimpio, datosUsuario);
        
        if (exito) {
            // También agregarlo al archivo local
            this.agregarUsuarioLocal(numeroLimpio, datosUsuario);
            console.log(`✅ Usuario ${nombre} agregado exitosamente`);
        } else {
            console.log(`❌ Error agregando usuario ${nombre}`);
        }
    }

    // Agregar usuario al archivo local
    agregarUsuarioLocal(numero, datosUsuario) {
        try {
            let usuarios = {};
            if (fs.existsSync(this.usuariosPath)) {
                usuarios = JSON.parse(fs.readFileSync(this.usuariosPath, 'utf-8'));
            }

            usuarios[numero] = {
                ...datosUsuario,
                activo: true,
                fecha_registro: new Date().toISOString().split('T')[0],
                usos: 0
            };

            fs.writeFileSync(this.usuariosPath, JSON.stringify(usuarios, null, 2));
            console.log('Usuario también agregado al archivo local');
        } catch (error) {
            console.error('Error agregando usuario local:', error);
        }
    }

    // Actualizar LoRA de usuario
    async actualizarLora(telefono, nuevaLora) {
        const numeroLimpio = this.limpiarNumero(telefono);
        const exito = await actualizarLoraUsuario(numeroLimpio, nuevaLora);
        
        if (exito) {
            console.log(`✅ LoRA actualizada para ${telefono}: ${nuevaLora}`);
        } else {
            console.log(`❌ Error actualizando LoRA para ${telefono}`);
        }
    }

    // Desactivar usuario
    async desactivarUsuario(telefono) {
        try {
            const numeroLimpio = this.limpiarNumero(telefono);
            const userDoc = doc(db, 'usuarios', numeroLimpio);
            
            await updateDoc(userDoc, {
                activo: false,
                fecha_desactivacion: new Date()
            });
            
            console.log(`✅ Usuario ${telefono} desactivado`);
        } catch (error) {
            console.error('Error desactivando usuario:', error);
        }
    }

    // Reactivar usuario
    async reactivarUsuario(telefono) {
        try {
            const numeroLimpio = this.limpiarNumero(telefono);
            const userDoc = doc(db, 'usuarios', numeroLimpio);
            
            await updateDoc(userDoc, {
                activo: true,
                fecha_reactivacion: new Date()
            });
            
            console.log(`✅ Usuario ${telefono} reactivado`);
        } catch (error) {
            console.error('Error reactivando usuario:', error);
        }
    }

    // Sincronizar usuarios locales con Firebase
    async sincronizarConFirebase() {
        console.log('🔄 Sincronizando usuarios con Firebase...');
        await inicializarUsuariosEnFirebase();
    }

    // Obtener estadísticas
    async obtenerEstadisticas() {
        try {
            console.log('\n=== ESTADÍSTICAS DEL SISTEMA ===');
            const usuariosSnapshot = await getDocs(collection(db, 'usuarios'));
            
            let totalUsuarios = 0;
            let usuariosActivos = 0;
            let totalUsos = 0;
            let usuariosConLora = 0;
            const lorasUsadas = new Set();

            usuariosSnapshot.forEach((doc) => {
                const data = doc.data();
                totalUsuarios++;
                
                if (data.activo) usuariosActivos++;
                if (data.usos) totalUsos += data.usos;
                if (data.default_lora) {
                    usuariosConLora++;
                    lorasUsadas.add(data.default_lora);
                }
            });

            console.log(`📊 Total de usuarios: ${totalUsuarios}`);
            console.log(`✅ Usuarios activos: ${usuariosActivos}`);
            console.log(`❌ Usuarios inactivos: ${totalUsuarios - usuariosActivos}`);
            console.log(`🎨 Total de imágenes generadas: ${totalUsos}`);
            console.log(`🎭 Usuarios con LoRA personalizada: ${usuariosConLora}`);
            console.log(`🔧 LoRAs diferentes en uso: ${lorasUsadas.size}`);
            
            if (lorasUsadas.size > 0) {
                console.log(`\n🎭 LoRAs utilizadas:`);
                lorasUsadas.forEach(lora => console.log(`   - ${lora}`));
            }

        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
        }
    }

    // Hacer backup de usuarios
    async hacerBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(__dirname, `../backups/usuarios_backup_${timestamp}.json`);
            
            // Crear directorio de backups si no existe
            const backupDir = path.dirname(backupPath);
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const usuariosSnapshot = await getDocs(collection(db, 'usuarios'));
            const backup = {};

            usuariosSnapshot.forEach((doc) => {
                backup[doc.id] = doc.data();
            });

            fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
            console.log(`✅ Backup creado: ${backupPath}`);
        } catch (error) {
            console.error('Error creando backup:', error);
        }
    }
}

// Funciones de línea de comandos
async function ejecutarComando() {
    const admin = new AdminUsuarios();
    const args = process.argv.slice(2);
    const comando = args[0];

    switch (comando) {
        case 'listar':
            await admin.listarUsuarios();
            break;

        case 'agregar':
            if (args.length < 3) {
                console.log('Uso: node admin-usuarios.js agregar <nombre> <telefono> [lora]');
                break;
            }
            const nombre = args[1];
            const telefono = args[2];
            const lora = args[3] || null;
            await admin.agregarNuevoUsuario(nombre, telefono, lora);
            break;

        case 'actualizar-lora':
            if (args.length < 3) {
                console.log('Uso: node admin-usuarios.js actualizar-lora <telefono> <nueva-lora>');
                break;
            }
            await admin.actualizarLora(args[1], args[2]);
            break;

        case 'desactivar':
            if (args.length < 2) {
                console.log('Uso: node admin-usuarios.js desactivar <telefono>');
                break;
            }
            await admin.desactivarUsuario(args[1]);
            break;

        case 'reactivar':
            if (args.length < 2) {
                console.log('Uso: node admin-usuarios.js reactivar <telefono>');
                break;
            }
            await admin.reactivarUsuario(args[1]);
            break;

        case 'sincronizar':
            await admin.sincronizarConFirebase();
            break;

        case 'estadisticas':
            await admin.obtenerEstadisticas();
            break;

        case 'backup':
            await admin.hacerBackup();
            break;

        default:
            console.log(`
🚀 ADMINISTRADOR DE USUARIOS - Sistema de Generación de Imágenes

Comandos disponibles:
  listar                                    - Lista todos los usuarios
  agregar <nombre> <telefono> [lora]       - Agrega un nuevo usuario
  actualizar-lora <telefono> <nueva-lora>  - Actualiza la LoRA de un usuario
  desactivar <telefono>                    - Desactiva un usuario
  reactivar <telefono>                     - Reactiva un usuario
  sincronizar                              - Sincroniza usuarios locales con Firebase
  estadisticas                             - Muestra estadísticas del sistema
  backup                                   - Crea backup de todos los usuarios

Ejemplos:
  node admin-usuarios.js listar
  node admin-usuarios.js agregar "Juan Pérez" "+593987654321" "juan.safetensors"
  node admin-usuarios.js actualizar-lora "+593987654321" "nueva_lora.safetensors"
  node admin-usuarios.js desactivar "+593987654321"
            `);
    }

    process.exit(0);
}

// Si se ejecuta directamente
if (require.main === module) {
    ejecutarComando().catch(console.error);
}

module.exports = AdminUsuarios;