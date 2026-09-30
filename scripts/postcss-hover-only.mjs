// Puts every :hover rule inside @media (hover: hover), so it applies only where a pointer can really hover.
// On a touch screen the browser has no hover, and it fakes one: the last thing tapped stays ":hover" (the
// tapped button kept its grey background) until the next tap somewhere else. With the media query the hover
// colours and effects simply never apply there. Tailwind's own hover: utilities get the same treatment from
// its hoverOnlyWhenSupported option; this covers the hand-written CSS.

const HOVER_MEDIA = '(hover: hover)';

const insideHoverMedia = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'media' && /hover\s*:\s*hover/.test(parent.params)) return true;
  }
  return false;
};

const insideKeyframes = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return true;
  }
  return false;
};

// :not(:hover) means "no pointer over it", which is what a touch screen should keep.
const needsHover = (selector) => /:hover\b/.test(selector.replace(/:not\([^)]*:hover[^)]*\)/g, ''));

export default function hoverOnly() {
  return {
    postcssPlugin: 'noureon-hover-only',
    Once(root, { AtRule }) {
      root.walkRules((rule) => {
        if (insideKeyframes(rule) || insideHoverMedia(rule)) return;
        const hoverSelectors = rule.selectors.filter(needsHover);
        if (hoverSelectors.length === 0) return;
        const otherSelectors = rule.selectors.filter((selector) => !hoverSelectors.includes(selector));
        const media = new AtRule({ name: 'media', params: HOVER_MEDIA });
        media.append(rule.clone({ selectors: hoverSelectors }));
        rule.after(media);
        if (otherSelectors.length > 0) rule.selectors = otherSelectors;
        else rule.remove();
      });
    }
  };
}

hoverOnly.postcss = true;
