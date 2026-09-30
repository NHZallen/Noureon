# liquid-glass (vendored)

`liquid-glass.js` is the zero-dependency refraction engine from
https://github.com/gentpan/liquidglass (`lib/liquid-glass.js`, v1.0.0), copied unmodified under the
MIT licence in `LICENSE`. It bends the live page behind a glass element in Chromium
(`backdrop-filter: url()`); Safari and Firefox cannot do that, so the app only loads it in Chromium
and keeps its own CSS glass elsewhere (see `src/app/ui/motion/glass-lens.js`).
