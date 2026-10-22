// A reply of a text model that draws pictures by itself, as it is written on the page (docs/superpowers/specs/2026-10-22-text-model-image-tool-design.md): words, the picture
// where the model drew it, words. The words before the picture stream into the first bubble; when the picture is made, a place for it is made under that bubble (the wait for
// the picture turns into the picture itself as soon as it is brought here) and the words that follow stream into a new bubble under it. Nothing is drawn again when the reply
// ends. It follows the events of the step list ({ type: 'image', event: 'done', pictures }) and sits between the words the server sends and the renderer that draws them.

const END = Symbol('end');

/**
 * `targetElement`: where the first words stream (inside the first bubble). `streamMarkdownResponse(element, feed, signal, options)` draws words as they come
 * (`feed(onChunk)` is the source). `hydrateParts(parts)` brings the pictures here; `mountPictures({ parts, firstNumber, slot })` puts their cards in `slot`
 * (bound, with the number each has in the message) and resolves whether it did. `getStage()` is the element of the wait for the picture. Returns { wrap, handle, finish }.
 */
export function createPictureFlow({ document, targetElement, streamMarkdownResponse, signal = null, hydrateParts, mountPictures, getStage = () => null }) {
  const segments = [{ element: targetElement, text: '', feed: null, done: null, drawn: null }];
  let current = segments[0];
  let delivered = 0;
  const offsets = [];
  const pictures = [];
  const mounting = [];
  // Pictures that stand further on in the answer than the words that have come so far (a page that joins late is told where they stand before it is given the words).
  const pending = [];
  // The pictures already placed or waiting (the steps are told again when the channel is joined again: a picture is not placed twice).
  const known = new Set();
  let shown = 0;
  let failed = false;

  const bubbleOf = (element) => element.closest?.('.message-bubble') || null;

  // A bubble for the words that follow a picture: the same as the one the words before it are in.
  const makeTail = (after) => {
    const bubble = bubbleOf(targetElement);
    const content = document.createElement('div');
    content.className = String(targetElement.className || '').replace(/\b(is-streaming-response|typing-cursor)\b/g, '').trim();
    if (!bubble) {
      after.after(content);
      return { element: content, bubble: null };
    }
    const shell = bubble.cloneNode(false);
    shell.removeAttribute('id');
    const prose = bubble.querySelector('.message-content')?.cloneNode(false);
    if (prose) {
      prose.innerHTML = '';
      prose.append(content);
      shell.append(prose);
    } else {
      shell.append(content);
    }
    after.after(shell);
    return { element: content, bubble: shell };
  };

  const startTail = (after) => {
    const { element, bubble } = makeTail(after);
    const segment = { element, bubble, text: '', feed: null, done: null, drawn: null };
    // (The renderer asks for its source at once, so the words that come next already have a place to go.)
    segment.drawn = streamMarkdownResponse(element, (onChunk) => new Promise((resolve) => {
      segment.feed = onChunk;
      segment.done = resolve;
    }), signal, {}).catch(() => '');
    segments.push(segment);
    current = segment;
    return segment;
  };

  const split = (made) => {
    const parts = made.filter((part) => part?.generatedImage);
    if (!parts.length) return;
    const before = current;
    const stage = getStage();
    const slot = document.createElement('div');
    slot.className = 'reply-picture-slot';
    // The wait for the picture goes into the place; the picture takes its place when it is here.
    const anchor = before.bubble || bubbleOf(before.element) || before.element;
    anchor.after(slot);
    if (stage && stage !== slot) slot.append(stage);
    parts.forEach(() => offsets.push(delivered));
    const firstNumber = pictures.length + 1;
    pictures.push(...parts);
    startTail(slot);
    mounting.push((async () => {
      try {
        const hydrated = await hydrateParts(parts);
        if (!(await mountPictures({ parts: hydrated, firstNumber, slot }))) throw new Error('no picture to show');
        shown += parts.length;
      } catch {
        failed = true;
        slot.remove();
      }
    })());
  };

  return {
    /** The source of the words, between the server and the renderer of the first bubble: after a picture the words go to the bubble that follows it. */
    wrap(onChunk) {
      const give = (text) => {
        if (!text) return;
        delivered += text.length;
        current.text += text;
        if (current.feed) current.feed(text);
        else onChunk(text);
      };
      return (delta) => {
        let text = String(delta ?? '');
        // Words that run past the place of a picture are given in two: what comes before it, the picture, what comes after.
        while (text && pending.length && pending[0].at < delivered + text.length) {
          const next = pending.shift();
          const cut = Math.max(0, next.at - delivered);
          give(text.slice(0, cut));
          text = text.slice(cut);
          split(next.pictures);
        }
        give(text);
      };
    },
    handle(event) {
      if (event?.type !== 'image' || event.event !== 'done' || event.kind === 'view' || !Array.isArray(event.pictures)) return;
      const fresh = event.pictures.filter((part) => part?.generatedImage?.id && !known.has(part.generatedImage.id));
      if (!fresh.length) return;
      fresh.forEach((part) => known.add(part.generatedImage.id));
      // As it happens it stands where the words are now; told where it stood, further on, it waits for the words to get there (a place already passed is the place now).
      const at = Number.isFinite(event.at) ? event.at : delivered;
      if (at > delivered) {
        pending.push({ at, pictures: fresh });
        pending.sort((a, b) => a.at - b.at);
      } else split(fresh);
    },
    /** The reply is over: the last bubble is finished, every picture is in place. Resolves what the message is made of. */
    async finish() {
      // A picture further on than the words ever got stands at the end.
      while (pending.length) split(pending.shift().pictures);
      for (const segment of segments) segment.done?.(END);
      await Promise.all(segments.map((segment) => segment.drawn));
      await Promise.all(mounting);
      // A bubble after a picture with nothing in it (the model said nothing after it drew) is not left as an empty box. (The first bubble holds the step list.)
      segments.slice(1).forEach((segment) => {
        if (!segment.text.trim()) segment.bubble?.setAttribute('hidden', '');
      });
      return {
        // The words of the first bubble, and all the words, in order.
        headText: segments[0].text,
        text: segments.map((segment) => segment.text).join(''),
        offsets: [...offsets],
        pictures: [...pictures],
        // Whether every picture is on the page already (otherwise the message is drawn whole when it ends, as before).
        shownAll: !failed && shown === pictures.length
      };
    },
    get pictureCount() { return pictures.length; }
  };
}
