// The faces a design draws with: every family of its font roles at the weights it uses, so they can be loaded before text is measured
// (the page registers them as fonts, the server makes them as static faces). `eastAsian: false` leaves out the large CJK faces.

import { FONT_FAMILIES, FONT_SETS, MONO_FAMILY } from './fonts.js';

export function familiesOf(tokens, design, { eastAsian = true } = {}) {
  const set = FONT_SETS[design.fonts] || FONT_SETS.modern;
  const roles = tokens.fonts;
  const families = new Map();
  const add = (family, weight) => {
    if (!family || FONT_FAMILIES[family]?.system) return;
    if (!families.has(family)) families.set(family, new Set());
    families.get(family).add(weight);
  };
  for (const [name, role] of Object.entries({ heading: roles.heading, body: roles.body, bodyStrong: roles.bodyStrong, label: roles.label })) {
    const weight = name === 'heading' ? design.headingWeight : name === 'bodyStrong' ? 700 : name === 'label' ? 500 : 400;
    const definition = set[name === 'bodyStrong' ? 'body' : name];
    [role.latin, definition?.cyrillic].forEach((family) => { add(family, weight); add(family, 700); });
    if (eastAsian) {
      add(role.eastAsian, weight);
      add(role.eastAsian, 700);
    }
  }
  add(MONO_FAMILY, 500);
  add(MONO_FAMILY, 700);
  return families;
}
