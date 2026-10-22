// The wait for a picture a text model draws by itself, in the reply (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md): the same field of dots and
// words of the stages the wait for a picture has (ui/image-wait/), under the words the model has written so far. It appears when the picture model is asked
// (after the person allowed it), turns into a line saying the picture is ready when it is made, and goes when the reply is drawn whole (the picture is there then)
// or when the drawing stops or fails.

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { imageWaitMarkup, loadImageWait } from '../image-wait/image-wait-markup.js';

const ratioOf = (value) => (/^\d{1,2}:\d{1,2}$/.test(String(value || '')) ? String(value).replace(':', ' / ') : '1 / 1');

/** `place()` returns the element the stage goes after (the bubble of the words so far), or null when there is none yet. Returns { handle(event), remove() }. */
export function createDrawStage({ document, place, language }) {
  let stage = null;
  const remove = () => {
    stage?.remove();
    stage = null;
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
      else if (event.event === 'done' && event.kind !== 'view' && stage) {
        // The picture is made: the dots stop, and the line says so until the picture takes their place.
        stage.classList.add('is-finished');
        stage.querySelector('noureon-image-wait')?.remove();
        const label = stage.querySelector('.generated-image-wait-label');
        if (label) label.textContent = sandboxText(language, 'imageStageDone');
      } else if (event.event === 'failed' || event.event === 'stopped' || (event.event === 'answer' && stage)) remove();
    },
    remove,
    get element() { return stage; }
  };
}
