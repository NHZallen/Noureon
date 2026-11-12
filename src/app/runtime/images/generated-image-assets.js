import { pictureSizeOfBlob } from '../../ui/files/picture-size.js';
import { createImageFileName } from '../../ui/files/file-name-policy.js';
import { settlePicture, settlePictures } from '../../ui/files/picture-loading.js';
import { saveWithShareSheet } from './picture-blob.js';
import { withIntrinsicSize } from './svg-writer.js';

// A drawing kept before every drawing was given a size (only a viewBox, or its own 300 or 512) is shown at the size every picture has: its text is brought to it when it is read, the file kept is not touched.
const withPictureSize = async (descriptor, blob) => {
  if (descriptor?.mediaType !== 'image/svg+xml' || typeof blob?.text !== 'function') return blob;
  try {
    return new Blob([withIntrinsicSize(await blob.text())], { type: blob.type || 'image/svg+xml' });
  } catch {
    return blob;
  }
};

/**
 * The number a picture has in its message, as the person sees it on the picture (the chip), or its place among the pictures of the message.
 * `element` is anything inside its card.
 */
export const pictureNumberOf = (element) => {
  const card = element?.closest?.('.generated-image-card');
  const shown = Number(card?.querySelector?.('.picture-number')?.textContent);
  if (Number.isInteger(shown) && shown >= 1) return shown;
  const cards = [...(card?.closest?.('.message-stack')?.querySelectorAll?.('.generated-image-card') || [])];
  return Math.max(1, cards.indexOf(card) + 1);
};

/** The name a picture is downloaded under (src/app/ui/files/file-name-policy.js): its words, the day and the minute, its number. */
export const downloadNameOf = (descriptor, element) => createImageFileName({
  description: descriptor?.title || descriptor?.prompt || '',
  createdAt: descriptor?.createdAt || null,
  number: pictureNumberOf(element),
  mediaType: descriptor?.mediaType
});

const decodeBase64 = (value) => {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const encodeBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

// The size the picture really has, kept with the picture (`width`, `height`) so that the next time its card is drawn the place is already the right shape.
const rememberPictureSize = (descriptor, width, height) => {
  if (!descriptor || !(width > 0) || !(height > 0)) return;
  descriptor.width = width;
  descriptor.height = height;
};

// The nearest box around the card that scrolls (the chat).
const scrollerOf = (element) => {
  for (let node = element?.parentElement; node && node.nodeType === 1; node = node.parentElement) {
    const overflowY = node.ownerDocument?.defaultView?.getComputedStyle?.(node)?.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
};

// Puts the cards in the shape of their pictures before the pictures are drawn, all at once, and keeps the person where they are: the chat stays at its end if it was there,
// otherwise the first thing on the screen stays where it was (a browser with no scroll anchoring, Safari, would move what is read as the cards above it change).
const shapeCards = (cards) => {
  const todo = cards.filter(({ card, width, height }) => card && width > 0 && height > 0 && card.style.aspectRatio !== `${width} / ${height}`);
  if (!todo.length) return;
  const scroller = scrollerOf(todo[0].card);
  const atEnd = scroller ? scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 4 : false;
  let anchor = null;
  let anchorTop = 0;
  if (scroller && !atEnd) {
    const top = scroller.getBoundingClientRect().top;
    // The first thing that begins on the screen (one that begins above it and reaches in does not tell where the content under it went).
    anchor = [...scroller.querySelectorAll('*')].find((node) => node.getBoundingClientRect().top >= top && node.getBoundingClientRect().height > 0) || null;
    anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
  }
  for (const { card, width, height } of todo) {
    card.style.aspectRatio = `${width} / ${height}`;
    card.style.setProperty('--picture-ratio', String(width / height));
    // (Not marked as natural yet: that frees the card from the shape and leaves it as tall as the picture is, which is nothing until the picture is drawn.)
  }
  if (!scroller) return;
  if (atEnd) scroller.scrollTop = scroller.scrollHeight;
  else if (anchor) scroller.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
};

const applyNaturalImageAspect = (imageElement) => {
  const width = Number(imageElement?.naturalWidth);
  const height = Number(imageElement?.naturalHeight);
  if (!width || !height) return;
  const card = imageElement.closest?.('.generated-image-card');
  if (!card) return;
  card.style.aspectRatio = `${width} / ${height}`;
  card.classList.add('has-natural-aspect');
};

export function createGeneratedImageAssetStore({
  setItem,
  getItem,
  getUserName = () => 'anonymous',
  randomUUID = () => crypto.randomUUID(),
  createObjectURL = (blob) => URL.createObjectURL(blob),
  shouldPersist = () => true
} = {}) {
  const volatileBlobs = new WeakMap();

  const put = async (descriptor, blob) => {
    if (shouldPersist()) {
      descriptor.storageKey ||= `generatedImage:${getUserName() || 'anonymous'}:${descriptor.id}`;
      delete descriptor.ephemeral;
      await setItem(descriptor.storageKey, blob);
      volatileBlobs.delete(descriptor);
    } else {
      delete descriptor.storageKey;
      descriptor.ephemeral = true;
      volatileBlobs.set(descriptor, blob);
    }
    return descriptor;
  };

  const save = async ({ b64Json, mediaType = 'image/png', aspectRatio = '', title = '' }) => {
    const id = randomUUID();
    const bytes = decodeBase64(b64Json);
    const blob = new Blob([bytes], { type: mediaType });
    const descriptor = {
      id,
      mediaType,
      size: blob.size,
      createdAt: new Date().toISOString()
    };
    if (title) descriptor.title = String(title).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (aspectRatio) descriptor.aspectRatio = aspectRatio;
    try {
      const bitmap = typeof createImageBitmap === 'function' && mediaType !== 'image/svg+xml' ? await createImageBitmap(blob) : null;
      if (bitmap) { rememberPictureSize(descriptor, bitmap.width, bitmap.height); bitmap.close?.(); }
    } catch { /* the size is learned when the picture is first drawn */ }
    await put(descriptor, blob);
    return descriptor;
  };

  const getBlob = async (descriptor) => {
    const volatileBlob = descriptor && volatileBlobs.get(descriptor);
    if (volatileBlob instanceof Blob) return withPictureSize(descriptor, volatileBlob);
    if (!descriptor?.storageKey) return null;
    const value = await getItem(descriptor.storageKey);
    return value instanceof Blob ? withPictureSize(descriptor, value) : null;
  };

  const persist = async (descriptor) => {
    if (!descriptor || (descriptor.storageKey && !descriptor.ephemeral)) return descriptor;
    const blob = await getBlob(descriptor);
    if (!blob) return descriptor;
    descriptor.storageKey = `generatedImage:${getUserName() || 'anonymous'}:${descriptor.id}`;
    delete descriptor.ephemeral;
    await setItem(descriptor.storageKey, blob);
    volatileBlobs.delete(descriptor);
    return descriptor;
  };

  const discard = (descriptor) => {
    if (descriptor) volatileBlobs.delete(descriptor);
  };

  const getDataUrl = async (descriptor) => {
    const blob = await getBlob(descriptor);
    if (!blob) return '';
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${descriptor.mediaType || blob.type || 'image/png'};base64,${encodeBase64(bytes)}`;
  };

  // An SVG is a document that can hold script: the blob: address of one, opened in a tab (the context menu of a picture or a link offers it), is a page of the
  // app's own origin, which could read what the app keeps. A data: address is never opened as a page by the browser, and an <img> runs no script in it.
  const pictureUrlOf = async (descriptor, blob) => {
    if (String(descriptor?.mediaType || blob.type || '').toLowerCase().startsWith('image/svg+xml')) {
      return `data:image/svg+xml;base64,${encodeBase64(new Uint8Array(await blob.arrayBuffer()))}`;
    }
    return createObjectURL(blob);
  };

  const bind = async (root, descriptors = []) => {
    // The pictures nearest to what is on the screen first, each on its own: the one being looked at does not wait for the others to be read.
    const distance = (descriptor) => {
      const element = root.querySelector?.(`[data-generated-image-id="${descriptor.id}"]`);
      const rect = element?.getBoundingClientRect?.();
      const view = globalThis.innerHeight || 0;
      return rect ? Math.abs((rect.top + rect.bottom) / 2 - view / 2) : Infinity;
    };
    const ordered = [...descriptors].sort((first, second) => distance(first) - distance(second));
    await Promise.all(ordered.map(async descriptor => {
      const blob = await getBlob(descriptor);
      if (blob && !(descriptor.width > 0 && descriptor.height > 0)) {
        const size = await pictureSizeOfBlob(blob);
        if (size) rememberPictureSize(descriptor, size.width, size.height);
      }
      // The card takes the shape of its picture from the file, before the picture is drawn (and the person stays where they are).
      shapeCards([...root.querySelectorAll(`[data-generated-image-id="${descriptor.id}"]`)]
        .map(element => ({ card: element.closest?.('.generated-image-card'), width: descriptor.width, height: descriptor.height })));
      if (!blob) {
        settlePictures(root, descriptor.id);
        return;
      }
      const objectUrl = await pictureUrlOf(descriptor, blob);
      root.querySelectorAll(`[data-generated-image-id="${descriptor.id}"]`)
        .forEach(element => {
          if (typeof element.addEventListener === 'function') {
            element.addEventListener('load', () => {
              rememberPictureSize(descriptor, Number(element.naturalWidth), Number(element.naturalHeight));
              applyNaturalImageAspect(element);
              settlePicture(element);
            }, { once: true });
            element.addEventListener('error', () => settlePicture(element), { once: true });
          }
          element.src = objectUrl;
          applyNaturalImageAspect(element);
        });
      root.querySelectorAll(`[data-generated-image-download="${descriptor.id}"]`)
        .forEach(element => {
          element.href = objectUrl;
          element.download = downloadNameOf(descriptor, element);
          // The number is read when it is pressed (a picture of a reply may be numbered after it was bound).
          // On an iPhone the link does nothing, so the file goes to the share sheet instead (picture-blob.js).
          element.addEventListener?.('click', (event) => {
            element.download = downloadNameOf(descriptor, element);
            if (saveWithShareSheet({ blob: element.retimedBlob || blob, name: element.download })) event.preventDefault();
          });
        });
    }));
  };

  return { bind, discard, getBlob, getDataUrl, persist, put, save };
}
