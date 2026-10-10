// The scroll of the home page: each story is a tall section with a window pinned (position: sticky) inside it, and how far the person has
// scrolled through the section decides which frame of the window and which caption show. Nothing here moves the page; it only sets classes.

const clamp = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** @returns {() => void} a function that stops it */
export function installHomeScroll({ window, document, container, onNear = () => {} }) {
  const stories = [...container.querySelectorAll('.hm-story')];
  const reduce = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  // The visible height: an in-app browser has bars that 100svh does not know about, so it is taken once and only made smaller while the width stays.
  let height = 0;
  let width = 0;
  const measure = () => {
    const now = Math.min(window.innerHeight, document.documentElement.clientHeight || window.innerHeight);
    if (!height || window.innerWidth !== width) {
      height = now;
      width = window.innerWidth;
    } else if (now < height) {
      height = now;
    }
  };
  const sizeCaptions = () => {
    for (const story of stories) {
      const caps = story.querySelector('.hm-caps');
      if (caps) story.style.setProperty('--caph', `${Math.round(caps.getBoundingClientRect().height)}px`);
    }
  };
  const frame = () => {
    for (const story of stories) {
      const rect = story.getBoundingClientRect();
      const progress = reduce ? 1 : clamp(-rect.top / Math.max(1, rect.height - height));
      if (rect.top < height * 2 && rect.bottom > -height) onNear(story);
      story.querySelector('.hm-win')?.style.setProperty('--e', reduce ? 1 : clamp((height - rect.top) / (height * 0.9)));
      const frames = [...story.querySelectorAll('.hm-fr')];
      let lastFrame = 0;
      frames.forEach((node, index) => { if (progress >= parseFloat(node.dataset.at)) lastFrame = index; });
      frames.forEach((node, index) => node.classList.toggle('on', index <= lastFrame));
      const caps = [...story.querySelectorAll('.hm-cap')];
      let current = 0;
      caps.forEach((node, index) => { if (progress >= parseFloat(node.dataset.from)) current = index; });
      caps.forEach((node, index) => node.classList.toggle('on', index === current));
      story.querySelectorAll('.hm-steps b').forEach((bar, index) => {
        const from = parseFloat(caps[index].dataset.from);
        const to = index + 1 < caps.length ? parseFloat(caps[index + 1].dataset.from) : 1;
        bar.style.width = `${clamp((progress - from) / (to - from)) * 100}%`;
      });
    }
  };
  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      if (container.style.display === 'none') {
        stop();
        return;
      }
      frame();
    });
  };
  const onResize = () => { measure(); sizeCaptions(); queue(); };
  const stop = () => {
    window.removeEventListener('scroll', queue);
    window.removeEventListener('resize', onResize);
  };
  measure();
  sizeCaptions();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', onResize);
  document.fonts?.ready?.then(sizeCaptions);
  frame();
  return stop;
}

/** The blocks that fade in as they come into view. */
export function installReveal({ window, container }) {
  const nodes = [...container.querySelectorAll('.hm-rv')];
  const reduce = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  if (!('IntersectionObserver' in window) || reduce) {
    nodes.forEach((node) => node.classList.add('in'));
    return;
  }
  const observer = new window.IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const node = entry.target;
      node.style.transitionDelay = `${Math.min([...node.parentNode.children].indexOf(node), 8) * 60}ms`;
      node.classList.add('in');
      observer.unobserve(node);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  nodes.forEach((node) => observer.observe(node));
}
