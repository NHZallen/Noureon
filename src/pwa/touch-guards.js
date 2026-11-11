// The page can be pinched to zoom (the interaction overhaul, docs/superpowers/specs/2026-11-11-interaction-overhaul-design.md §6): a person who cannot read
// the text at its size needs it, and the inputs are 16 px on a touch screen so that focusing one does not zoom the page by itself.
//
// What stays is the double tap: `touch-action: manipulation` (base.css) turns the double-tap zoom off, so a quick second tap is a second tap and the browser
// does not wait for it. There is no touchstart or touchend listener here on purpose: one that may call preventDefault makes the browser wait for the page's
// main thread before it scrolls anything, and while the page was busy (a long reply streaming) every swipe stalled and the chat looked frozen.
export function installTouchGuards() {}
