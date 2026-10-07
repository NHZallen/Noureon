// An image made by the server (a run of `kind: 'image'`, docs/superpowers/specs/2026-10-06-server-image-generation-design.md): the page hands
// over the prompt, the shape and size, and the pictures to start from; the server asks OpenRouter's images endpoint (the same call the page
// makes when it does this itself), keeps each picture in the person's cloud space, and gives back the message parts the app already knows
// ({ generatedImage } with the marker of the stored file), so every page of the account restores the picture from there.
//
// A stop or the time limit puts the request down; the reply is then empty and the caller says how it ended (as for a text reply).

import { randomUUID } from 'node:crypto';

import { createOpenRouterImageGenerator } from '../src/app/legacy-runtime/features/openrouter-image-generation.js';
import { ReplyError, scrubMessage } from './executor.js';
import { ERROR_CODES } from './protocol.js';

// A picture that cannot be kept is tried again this many times (a moment apart) before the image is given up.
const SAVE_RETRIES = 2;

const toDataUrl = (bytes, mimeType) => `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`;

/**
 * Makes the image. `files` is the person's cloud store (file-store.js). Resolves { parts, status, run, toolCalls } (status 'done' or
 * 'stopped'); throws a ReplyError (provider_error, or image_not_saved when the pictures were made but could not be kept).
 */
export async function executeImage({
  spec,
  secrets,
  signal,
  userId,
  files,
  fetchImpl = fetch,
  now = Date.now,
  onUpdate = () => {},
  onProblem = () => {},
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  const startedAt = now();
  const { image } = spec;
  const aspectRatio = image.config.aspectRatio;
  const stopped = () => ({ parts: [{ text: '' }], status: 'stopped', run: { elapsedMs: now() - startedAt }, toolCalls: 0 });

  // What the other pages of the account see until the picture is there: the same place-holder the page itself draws.
  onUpdate([{ imageGenerationLoading: true, imageAspectRatio: aspectRatio }]);

  const inputReferences = [];
  for (const reference of image.references) {
    if (typeof reference === 'string') {
      inputReferences.push(reference);
      continue;
    }
    try {
      const bytes = await files.load({ userId, marker: reference });
      inputReferences.push(toDataUrl(bytes, reference.__astraCloudAsset.mimeType));
    } catch (error) {
      if (signal?.aborted) return stopped();
      onProblem('image_reference_unreadable', error);
      throw new ReplyError('A reference picture could not be read from your cloud space.', ERROR_CODES.providerError);
    }
  }
  if (signal?.aborted) return stopped();

  let result;
  try {
    result = await createOpenRouterImageGenerator({ fetchImpl })({
      apiKey: secrets.providerKey,
      model: spec.model.id,
      prompt: image.prompt,
      config: image.config,
      inputReferences,
      signal
    });
  } catch (error) {
    if (signal?.aborted) return stopped();
    throw new ReplyError(scrubMessage(error?.message, secrets), ERROR_CODES.providerError);
  }
  if (signal?.aborted) return stopped();
  if (!result?.images?.length) throw new ReplyError('Image generation finished, but no picture came back.', ERROR_CODES.providerError);

  const parts = [];
  for (const picture of result.images) {
    const bytes = Buffer.from(picture.b64Json, 'base64');
    const mediaType = picture.mediaType || 'image/png';
    const id = randomUUID();
    let marker = null;
    for (let attempt = 0; !marker; attempt += 1) {
      try {
        // Like the pictures the app's own sync keeps, a generated image is not stopped by the person's 500 MB (quota: false).
        marker = await files.save({ userId, bytes, mimeType: mediaType, encoding: 'blob', quota: false });
      } catch (error) {
        onProblem('image_not_saved', error);
        if (attempt >= SAVE_RETRIES) throw new ReplyError('The image could not be kept in the cloud space.', ERROR_CODES.imageNotSaved);
        await wait(500 * 2 ** attempt);
      }
    }
    parts.push({
      generatedImage: {
        id,
        // The key the app's sync gives a picture it restores (src/app/sync/cloud-assets.js): the page stores the file under it.
        storageKey: `generatedImage:supabase:${userId}:${id}`,
        mediaType,
        size: bytes.byteLength,
        ...(aspectRatio ? { aspectRatio } : {}),
        cloudAsset: marker
      }
    });
  }
  return { parts, status: 'done', run: { elapsedMs: now() - startedAt }, toolCalls: 0 };
}
