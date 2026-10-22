// The wait for a picture a text model draws by itself, in the reply (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md): the same field of dots and
// words of the stages the wait for a picture has (ui/image-wait/), under the words the model has written so far. It appears when the picture model is asked
// (after the person allowed it) and goes when the picture takes its place (picture-flow.js), or when the drawing stops or fails.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { leave } from './fold-animation.js';
import { imageWaitMarkup, loadImageWait } from '../image-wait/image-wait-markup.js';

const ratioOf = (value) => (/^\d{1,2}:\d{1,2}$/.test(String(value || '')) ? String(value).replace(':', ' / ') : '1 / 1');
/** The shape as a number (width over height), for the size the stylesheet works out. */
export const ratioNumber = (value) => {
  const [width, height] = String(value || '').split(':').map(Number);
  return width > 0 && height > 0 ? width / height : 1;
};

/** `place()` returns the element the stage goes after (the bubble of the words so far), or null when there is none yet. Returns { handle(event), remove() }. */
export function createDrawStage({ document, place, language }) {
  let stage = null;
  const remove = () => {
    stage?.remove();
    stage = null;
  };
  // The wait ends without a picture (stopped, failed, or the picture is taken over): it folds away rather than vanishing.
  const settle = () => {
    const old = stage;
    stage = null;
    leave(old);
  };
  const show = (event) => {
    const after = place();
    if (!after || stage?.isConnected) return;
    void loadImageWait();
    stage = document.createElement('div');
    stage.className = 'generated-image-stage reply-draw-stage';
    stage.dataset.drawId = String(event.id || '');
    const skeleton = document.createElement('div');
    skeleton.className = 'generated-image-skeleton generated-image-skeleton-sized';
    skeleton.setAttribute('role', 'status');
    skeleton.setAttribute('aria-live', 'polite');
    skeleton.dataset.targetAspectRatio = String(event.aspectRatio || '1:1');
    skeleton.style.aspectRatio = ratioOf(event.aspectRatio);
    skeleton.style.setProperty('--picture-ratio', String(ratioNumber(event.aspectRatio)));
    skeleton.innerHTML = imageWaitMarkup({ label: sandboxText(language, 'imageDrawing'), startedAt: Date.now() });
    stage.append(skeleton);
    after.after(stage);
  };
  return {
    handle(event) {
      if (event?.type === 'reset') {
        remove();
        return;
      }
      if (event?.type !== 'image') return;
      if (event.event === 'drawing') show(event);
      else if (event.event === 'failed' || event.event === 'stopped' || (event.event === 'answer' && stage)) settle();
    },
    remove,
    get element() { return stage; }
  };
}
