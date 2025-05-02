import { pipeline, env } from '@xenova/transformers';
import { pathToFileURL } from 'url';
import path from 'path';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = pathToFileURL(path.resolve('./models')).href + '/';

console.log('[TEST] Intentando cargar modelo desde:', env.localModelPath);

const extractor = await pipeline('feature-extraction', 'mks');
const result = await extractor('Hola mundo', { pooling: 'mean', normalize: true });

console.log('[TEST] Vector (primeros 5):', result.data.slice(0, 5));
