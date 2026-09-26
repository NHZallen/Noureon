import { isGeneratorAvailable } from './file-type-registry.js';

// Every generator is a separate dynamic import so its library is fetched only
// when the user actually downloads that kind of file.
const GENERATOR_LOADERS = Object.freeze({
  text: () => import('./generators/text-file.js').then((module) => module.generateTextFile)
});

export class FileGenerationError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'FileGenerationError';
    if (cause) this.cause = cause;
  }
}

export async function generateFileBlob(descriptor) {
  if (!descriptor) throw new FileGenerationError('missing file');
  if (descriptor.policy === 'block') throw new FileGenerationError('blocked file type');
  const loader = GENERATOR_LOADERS[descriptor.generator];
  if (!loader || !isGeneratorAvailable(descriptor.generator)) {
    throw new FileGenerationError('unsupported file type');
  }
  const generate = await loader();
  const blob = await generate(descriptor);
  if (!(blob instanceof Blob)) throw new FileGenerationError('generator returned no data');
  return blob;
}
