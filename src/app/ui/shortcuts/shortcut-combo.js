// Key combinations of the keyboard shortcuts (docs/superpowers/specs/2026-11-05-keyboard-shortcuts-design.md). A combination is a string of the same form everywhere (the registry, what is saved,
// what is compared): the modifiers in a fixed order, then the key, joined with "+": "Mod+Shift+S", "Alt+Enter", "Shift+Escape". `Mod` is the main modifier of the system: Ctrl on Windows and Linux, the
// Command key on a Mac. Only `Mod`, `Alt` and `Shift` are used; a key is named from where it is on the keyboard (event.code), not from what it types, so `Alt` on a Mac (which types other letters) and another
// layout read the same. Pure: no window, no document (the platform is given).

const MODIFIERS = ['Mod', 'Alt', 'Shift'];

/** The keys that are named by what they are called, not by their letter or digit. */
const CODE_NAMES = Object.freeze({
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\',
  Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Escape', Backspace: 'Backspace', Tab: 'Tab', Space: 'Space', Delete: 'Delete',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown'
});

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

export const isMacPlatform = (platform = '') => /mac|iphone|ipad/i.test(String(platform));

/** The key of an event: "S", "7", ",", "Enter", "F5"… or '' when it is only a modifier (or nothing the shortcuts can use). */
export function keyOfEvent(event) {
  const code = String(event?.code || '');
  if (MODIFIER_CODES.test(code)) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  if (CODE_NAMES[code]) return CODE_NAMES[code];
  // No usable code (a test, a synthetic event): the letter or name the event says.
  const key = String(event?.key ?? '');
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  if (key === ' ') return 'Space';
  if (['Enter', 'Escape', 'Backspace', 'Tab', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(key)) return key;
  if (/^[,./;'[\]\-=`\\]$/.test(key)) return key;
  return '';
}

/**
 * The combination of an event as { combo } (a string), { empty: true } when only a modifier is held, or { unsupported: true } when it uses a modifier the shortcuts do not (Ctrl on a Mac, the
 * Windows key elsewhere).
 */
export function comboFromEvent(event, platform = '') {
  const mac = isMacPlatform(platform);
  const mod = mac ? Boolean(event?.metaKey) : Boolean(event?.ctrlKey);
  const foreign = mac ? Boolean(event?.ctrlKey) : Boolean(event?.metaKey);
  const key = keyOfEvent(event);
  if (!key) return { empty: true };
  if (foreign) return { unsupported: true };
  const parts = [];
  if (mod) parts.push('Mod');
  if (event?.altKey) parts.push('Alt');
  if (event?.shiftKey) parts.push('Shift');
  parts.push(key);
  return { combo: parts.join('+') };
}

/** Is the string a combination of this form (known modifiers in order, one key)? */
export function isValidShape(combo) {
  if (typeof combo !== 'string' || !combo) return false;
  const parts = combo.split('+');
  const key = parts.pop();
  if (!key || (key.length > 1 && !/^(Enter|Escape|Backspace|Tab|Space|Delete|Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown|F([1-9]|1[0-2]))$/.test(key))) return false;
  if (key.length === 1 && !/^[A-Z0-9,./;'[\]\-=`\\]$/.test(key)) return false;
  const order = parts.map((part) => MODIFIERS.indexOf(part));
  return order.every((at) => at >= 0) && order.every((at, index) => index === 0 || at > order[index - 1]);
}

const parts = (combo) => String(combo || '').split('+');
const keyOf = (combo) => parts(combo).at(-1);
const has = (combo, modifier) => parts(combo).slice(0, -1).includes(modifier);

// What the browser keeps for itself (it will not give these to a page, or the page must not take them): tabs and windows, reload, the address bar, the developer tools, the history, numbers for tabs.
const RESERVED = new Set([
  'Mod+N', 'Mod+Shift+N', 'Mod+T', 'Mod+Shift+T', 'Mod+W', 'Mod+Shift+W', 'Mod+Q', 'Mod+Shift+Q', 'Mod+Tab', 'Mod+Shift+Tab', 'Mod+R', 'Mod+Shift+R', 'Mod+L', 'Mod+D', 'Mod+H', 'Mod+J',
  'Mod+Shift+I', 'Mod+Shift+J', 'Mod+Shift+C', 'Mod+Shift+Delete', 'Mod+PageUp', 'Mod+PageDown', 'Alt+F4', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+Home', 'F5', 'F11', 'F12', 'Mod+F5', 'Mod+Shift+B'
]);
// Editing the text of a box: a shortcut that took these would break typing.
const EDITING = new Set(['Mod+A', 'Mod+C', 'Mod+V', 'Mod+X', 'Mod+Z', 'Mod+Shift+Z', 'Mod+Y', 'Mod+F', 'Mod+P', 'Mod+B', 'Mod+I', 'Mod+U', 'Mod+Shift+V', 'Mod+Backspace', 'Mod+Delete', 'Mod+ArrowLeft', 'Mod+ArrowRight', 'Mod+ArrowUp', 'Mod+ArrowDown']);
const isDigitTab = (combo) => /^Mod\+[1-9]$/.test(combo);

/**
 * Can this combination be a shortcut? Returns { ok: true } or { ok: false, reason } with reason one of:
 * 'shape' (not a combination), 'modifier' (a plain key would be typed: it needs Ctrl/Cmd or Alt, the only ones that stand alone being Shift+Escape and the F keys), 'browser' (kept by the
 * browser), 'editing' (the keys of editing text), 'fixed' (Enter, Shift+Enter and Escape alone keep their own use).
 */
export function validateCombo(combo) {
  if (!isValidShape(combo)) return { ok: false, reason: 'shape' };
  const key = keyOf(combo);
  const mod = has(combo, 'Mod');
  const alt = has(combo, 'Alt');
  const fn = /^F([1-9]|1[0-2])$/.test(key);
  if (!mod && !alt && !fn && combo !== 'Shift+Escape') return { ok: false, reason: key === 'Enter' || key === 'Escape' ? 'fixed' : 'modifier' };
  if (RESERVED.has(combo) || isDigitTab(combo)) return { ok: false, reason: 'browser' };
  if (EDITING.has(combo)) return { ok: false, reason: 'editing' };
  return { ok: true };
}

/** The combination as the person reads it: "Ctrl+Shift+S" (or "Ctrl+⏎"), and on a Mac "⌘⇧S". Empty or missing: ''. */
export function formatCombo(combo, platform = '') {
  if (!combo) return '';
  const mac = isMacPlatform(platform);
  const names = { Enter: '⏎', Escape: 'Esc', Backspace: '⌫', Delete: 'Del', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space' };
  const list = parts(combo);
  const key = names[list.at(-1)] || list.at(-1);
  const mods = list.slice(0, -1).map((modifier) => (mac ? { Mod: '⌘', Alt: '⌥', Shift: '⇧' }[modifier] : { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift' }[modifier]));
  return mac ? `${mods.join('')}${key}` : [...mods, key].join('+');
}

/** Does the event press this combination (on this platform)? */
export function matchesCombo(event, combo, platform = '') {
  if (!combo) return false;
  const result = comboFromEvent(event, platform);
  return result.combo === combo;
}
