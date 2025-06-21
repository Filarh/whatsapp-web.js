/**
 * Plugin generador de índices FAISS para productos
 */

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = (client, config) => {
    // Tu diccionario de prefijos (mantenerlo igual)
    const prefijos = {
        'PP': 'PAPAIZ', 'PAP': 'PAPAIZ',
        'ILL': 'ILLINOIS',
        'MED': 'MEDECO', 'MD': 'MEDECO',
        'MAS': 'MASTER',
        'DX9': 'DEXTER',
        'IF': 'IFAM',
        'KAE': 'KALE',
        'TE': 'TESA',
        'TUBKL': 'KL', 'KL': 'KL',
        'OJ': 'OJMAR',
        'KE': 'KABA', 'KABA': 'KABA',
        'MT': 'MOTTURA',
        'ZA': 'ZADI', 'ZD': 'ZADI',
        'YAR': 'YARDENI',
        'TOV': 'TOVER',
        'SUZU': 'Suzuki', 'SZ': 'Suzuki',
        'CY': 'Yale', 'YA': 'Yale',
        'CV': 'Viro', 'VI': 'Viro', 'VIR': 'Viro',
        'KOM': 'Komatsu',
        'GB': 'Globe',
        'HY': 'Hyundai', 'HUHAA': 'Hyundai', 'OSHY': 'Hyundai',
        'HOND': 'Honda', 'OSHOND': 'Honda',
        'DAE': 'Chevrolet', 'AVEO': 'Chevrolet', 'CHV': 'Chevrolet', 'GM': 'Chevrolet',
        'KAW': 'Kawasaki',
        'FO': 'Ford', 'FOF': 'Ford',
        'TOY': 'Toyota', 'TOYO': 'Toyota', 'TO': 'Toyota',
        'ISU': 'Isuzu', 'ISUZU': 'Isuzu',
        'MZ': 'Mazda', 'MAZ': 'Mazda',
        'MIT': 'Mitsubishi', 'MI': 'Mitsubishi',
        'MG': 'Multlock', 'MUL': 'Multlock', 'MTK': 'Multlock', 'MLK': 'Multlock',
        'HN': 'Hino', 'HIN': 'Hino',
        'KEN': 'Kenworth', 'KW': 'Kwikset', 'CK': 'Kwikset', 'KWS': 'Kwikset',
        'BAJ': 'Bajaj',
        'OP': 'Opel',
        'FI': 'Fiat',
        'SS': 'SsangYong',
        'KIA': 'Kia', 'KI': 'Kia', 'KK': 'Kia', 'K1': 'Kia',
        'DAI': 'Daihatsu',
        'CAT': 'Caterpillar',
        'YAMA': 'Yamaha', 'Y153': 'Yamaha',
        'DX': 'Daewoo',
        'BH': 'BMW', 'BM': 'BMW',
        'GAT': 'Gato',
        'MEH': 'Mercedes - Benz', 'MEHM': 'Mercedes - Benz', 'MEHF': 'Mercedes - Benz', 'MEHD': 'Mercedes - Benz', 'ME': 'Mercedes - Benz', 'OSME': 'Mercedes - Benz',
        'VON': 'Volkswagen', 'VO': 'Volkswagen', 'VW': 'Volkswagen',
        'CHR': 'Chrysler',
        'DAT': 'Nissan', 'DN': 'Nissan',
        'VCH': 'Ducati',
        'EV': 'Evergood',
        'BDA': 'BAODEAN', 'OSBDA': 'BAODEAN',
        'SKO': 'SKODA',
        'NE': 'Renault',
        'SIX': 'Citroen',
        'FRE': 'freightliner',
        'ABL': 'Abloy',
        'LA': 'LADA',
        'AME': 'American-lock',
        'TRX': 'Travex',
        'MK2': 'Forte',
        'SC': 'SCHLAGE',
        'LAN': 'LANFOR',
        'PH': 'PHILLIPS',
        'COR': 'CORBIN',
        'ITA': 'ITALIKA',
        'CI': 'Cisa',
        'CL': 'Clark-forklift',
        'TAT': 'Tata',
        'TVS': 'TVS',
        'KYM': 'Kymco',
        'JD': 'John-Deere',
        'SA': 'Sargent',
        'ZE': 'ZEISS-IKON'
    };

    // Función para calcular hash del archivo
    function calcularHashArchivo(rutaArchivo) {
        try {
            const contenido = fs.readFileSync(rutaArchivo);
            return crypto.createHash('md5').update(contenido).digest('hex');
        } catch (error) {
            return null;
        }
    }

    // Función para expandir códigos con prefijos
    function expandirCodigo(codigo) {
        const variantes = new Set([codigo]);
        
        Object.entries(prefijos).forEach(([prefijo, marca]) => {
            if (codigo.toUpperCase().startsWith(prefijo.toUpperCase())) {
                const resto = codigo.substring(prefijo.length);
                variantes.add(`${marca} ${resto}`);
                variantes.add(`${marca}${resto}`);
                variantes.add(`${prefijo} ${resto}`);
            }
        });

        return Array.from(variantes);
    }

    // Función mejorada para generar variantes de búsqueda
    function generarVariantes(texto) {
        const variantes = new Set();
        const textoLimpio = texto.toLowerCase().trim();
        
        variantes.add(textoLimpio);
        variantes.add(textoLimpio.replace(/\s+/g, ''));
        variantes.add(textoLimpio.replace(/\s+/g, '-'));
        variantes.add(textoLimpio.replace(/[-_]/g, ' '));
        
        // Sin caracteres especiales
        const sinEspeciales = textoLimpio.replace(/[^\w\s]/g, '');
        variantes.add(sinEspeciales);
        
        // Palabras individuales importantes
        const palabras = textoLimpio.split(/\s+/).filter(p => p.length > 2);
        palabras.forEach(palabra => variantes.add(palabra));
        
        return Array.from(variantes).filter(v => v.length > 0);
    }

    function procesarExcel(rutaExcel) {
        try {
            console.log('Procesando archivo Excel:', rutaExcel);
            
            const workbook = XLSX.readFile(rutaExcel);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const datos = XLSX.utils.sheet_to_json(worksheet);
            
            console.log(`Procesando ${datos.length} filas`);
            
            const productos = [];
            const precios = [];
            
            datos.forEach((fila, index) => {
                try {
                    const codigo = String(fila['CÓDIGO'] || fila['Código'] || fila['codigo'] || '').trim();
                    const nombre = String(fila['NOMBRE DE PRODUCTO'] || fila['Nombre'] || fila['nombre'] || '').trim();
                    const pvpNormal = parseFloat(fila['PVP NORMAL'] || fila['PVP'] || fila['Precio'] || 0);
                    const categoria = String(fila['CATEGORIA'] || fila['Categoría'] || '').trim();
                    const marca = String(fila['MARCA'] || fila['Marca'] || '').trim();
                    
                    if (!codigo && !nombre) return;
                    
                    const id = `prod_${(index + 1).toString().padStart(6, '0')}`;
                    
                    // Generar texto de búsqueda optimizado para embeddings
                    const elementosBusqueda = [];
                    
                    // Código y variantes
                    if (codigo) {
                        const variantesCodigo = expandirCodigo(codigo);
                        elementosBusqueda.push(...variantesCodigo);
                    }
                    
                    // Nombre limpio y variantes
                    if (nombre) {
                        elementosBusqueda.push(nombre);
                        elementosBusqueda.push(...generarVariantes(nombre));
                    }
                    
                    // Marca y categoría
                    if (marca && marca !== 'MARCA GENERICA') {
                        elementosBusqueda.push(marca);
                    }
                    if (categoria && categoria !== 'CATEGORIA GENERAL') {
                        elementosBusqueda.push(categoria);
                    }
                    
                    // Tags adicionales para mejorar la búsqueda
                    const tags = [];
                    if (categoria) tags.push(categoria.toLowerCase());
                    if (marca && marca !== 'MARCA GENERICA') tags.push(marca.toLowerCase());
                    if (codigo) tags.push(codigo.toLowerCase());
                    
                    // ESTRUCTURA COMPATIBLE CON TU DATASETMANAGER
                    const producto = {
                        id: id,
                        input: elementosBusqueda.join(' '), // Texto principal para embedding
                        output: JSON.stringify({
                            codigo: codigo,
                            nombre: nombre,
                            marca: marca,
                            categoria: categoria,
                            precio: pvpNormal,
                            tipo: 'producto'
                        }),
                        tags: tags // Array de tags para enriquecer el embedding
                    };
                    
                    productos.push(producto);
                    
                    // Producto específico para precios
                    if (pvpNormal > 0) {
                        const precioId = `precio_${(index + 1).toString().padStart(6, '0')}`;
                        const textoPrecio = `${codigo} ${nombre} precio costo vale cuanto`.toLowerCase();
                        
                        const precio = {
                            id: precioId,
                            input: textoPrecio,
                            output: JSON.stringify({
                                codigo: codigo,
                                nombre: nombre,
                                precio: pvpNormal,
                                tipo: 'precio',
                                respuesta: `El precio de ${nombre} (${codigo}) es $${pvpNormal}`
                            }),
                            tags: ['precio', 'costo', codigo.toLowerCase()]
                        };
                        
                        precios.push(precio);
                    }
                    
                } catch (error) {
                    console.error(`Error procesando fila ${index + 1}:`, error.message);
                }
            });
            
            return { productos, precios };
            
        } catch (error) {
            console.error('Error procesando Excel:', error);
            throw error;
        }
    }

    // Función para guardar JSONL compatible con tu DatasetManager
    function guardarJSONL(datos, nombreArchivo) {
        const rutaArchivo = path.join(__dirname, '..', 'data', nombreArchivo);
        
        const directorio = path.dirname(rutaArchivo);
        if (!fs.existsSync(directorio)) {
            fs.mkdirSync(directorio, { recursive: true });
        }
        
        const lineas = datos.map(item => JSON.stringify(item)).join('\n');
        fs.writeFileSync(rutaArchivo, lineas, 'utf8');
        
        console.log(`Archivo ${nombreArchivo} guardado con ${datos.length} registros`);
        return rutaArchivo;
    }

    // Resto del código igual...
    client.on('message', async (message) => {
        if (!message.body.startsWith(config.bot.prefijo + 'generar-indices')) return;
        
        try {
            const args = message.body.split(' ').slice(1);
            const rutaExcel = args[0] || path.join(__dirname, '..', 'data', 'productos.xlsx');
            
            if (!fs.existsSync(rutaExcel)) {
                return message.reply('❌ No se encontró el archivo Excel. Coloca el archivo en la carpeta data/ con el nombre productos.xlsx');
            }
            
            const hashActual = calcularHashArchivo(rutaExcel);
            const archivoHash = path.join(__dirname, '..', 'data', '.hash_productos');
            
            let hashAnterior = null;
            if (fs.existsSync(archivoHash)) {
                hashAnterior = fs.readFileSync(archivoHash, 'utf8').trim();
            }
            
            if (hashActual === hashAnterior) {
                return message.reply('✅ Los archivos JSONL ya están actualizados (mismo hash del Excel)');
            }
            
            await message.reply('🔄 Procesando archivo Excel...');
            
            const { productos, precios } = procesarExcel(rutaExcel);
            
            // Guardar con nombres específicos para diferentes datasets
            const rutaProductos = guardarJSONL(productos, 'productos.jsonl');
            const rutaPrecios = guardarJSONL(precios, 'precios.jsonl');
            
            fs.writeFileSync(archivoHash, hashActual);
            
            const respuesta = `✅ *Índices generados exitosamente*

📊 *Estadísticas:*
- Productos procesados: ${productos.length}
- Precios procesados: ${precios.length}
- Archivos generados:
  - ${path.basename(rutaProductos)}
  - ${path.basename(rutaPrecios)}

🔍 *Listos para indexación FAISS*
💡 *Tip:* Configura estos datasets en tu config/ai.js`;

            await message.reply(respuesta);
            
        } catch (error) {
            console.error('Error generando índices:', error);
            await message.reply(`❌ Error: ${error.message}`);
        }
    });

    // Comando de ayuda igual...
    
    return {
        nombre: 'Generador Índices FAISS',
        descripcion: 'Convierte Excel de productos a archivos JSONL para indexación FAISS',
        version: '1.0.0',
        comandos: ['generar-indices', 'ayuda-indices']
    };
};