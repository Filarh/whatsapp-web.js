# Análisis de Llaves con MobileVIT v2

Este módulo integra un modelo de visión por computadora MobileVIT v2_025 en formato ONNX para analizar imágenes de llaves a través de WhatsApp.

## Características

- Clasificación de llaves según marca, submarca, tipo, número de pines, etc.
- Integrado con la API de WhatsApp Web.js
- Preprocesamiento de imágenes optimizado
- Modelo ligero (aprox. 4MB) que funciona localmente sin necesidad de servicios externos

## Instalación

1. Asegúrate de tener instaladas las dependencias:

```bash
npm install
```

2. Descarga el modelo ONNX y colócalo en la carpeta `/models`:

```bash
npm run descargar-modelo <URL_DEL_MODELO>
```

Reemplaza `<URL_DEL_MODELO>` con la URL donde se encuentra el archivo del modelo ONNX.

## Configuración

El sistema ya viene preconfigurado para funcionar con el bot de WhatsApp. El modelo se cargará automáticamente al iniciar el bot.

### Etiquetas del Modelo

Para personalizar las etiquetas que reconoce el modelo, edita el objeto `etiquetas` en el archivo `/plugins/comandos-vision.js`. Asegúrate de que las etiquetas coincidan con las clases que fueron utilizadas durante el entrenamiento del modelo.

```javascript
const etiquetas = {
    'brand': ['marca1', 'marca2', 'marca3'],
    'subbrand': ['submarca1', 'submarca2', 'submarca3'],
    'side': ['lado1', 'lado2'],
    'pins': ['2 pines', '3 pines', '4 pines', '5 pines'],
    'model': ['modelo1', 'modelo2', 'modelo3'],
    'material': ['metal', 'plástico', 'mixto']
};
```

## Uso

Una vez que el bot esté funcionando, puedes enviar el comando `!analizarllave` junto con una imagen de una llave para recibir un análisis.

También puedes responder a un mensaje que contenga una imagen con el comando `!analizarllave`.

### Formato de Respuesta

El sistema proporcionará dos tipos de resultados:

1. **Resultado técnico**: Un desglose técnico de cada característica detectada con su nivel de confianza
2. **Respuesta amigable**: Un resumen en lenguaje natural que describe las características principales de la llave

## Desarrollo

### Estructura del Modelo

El modelo MobileVIT v2_025 espera imágenes de 224x224 píxeles y genera predicciones para 6 categorías diferentes. La estructura de las salidas es la siguiente:

- `output_0`: Marca
- `output_1`: Submarca
- `output_2`: Lado
- `output_3`: Pines
- `output_4`: Modelo
- `output_5`: Material

### Preprocesamiento

Las imágenes se redimensionan a 224x224 píxeles y se normalizan dividiendo entre 255 antes de pasarlas al modelo.

### Postprocesamiento

Las salidas del modelo se procesan con una función softmax para obtener probabilidades, y luego se selecciona la clase con mayor probabilidad para cada categoría.

## Solución de Problemas

Si el modelo no se carga correctamente, verifica:

1. Que el archivo del modelo existe en la carpeta `/models` con el nombre `mobilevit_v2_025.onnx`
2. Que las dependencias `onnxruntime-node` y `sharp` están instaladas
3. Que las entradas y salidas del modelo coinciden con lo esperado por el código

## Recursos

- [Documentación de ONNX Runtime para Node.js](https://onnxruntime.ai/docs/get-started/with-node.html)
- [Documentación de Sharp para procesamiento de imágenes](https://sharp.pixelplumbing.com/) 