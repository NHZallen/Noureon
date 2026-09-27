// The curated icon vocabulary slides may reference with `"icon": "globe"`.
// Only names live here; the vector artwork is added with the PPTX generator.
// A small fixed set keeps icons consistent and lets the model choose reliably.

export const ICON_NAMES = Object.freeze([
  'package', 'globe', 'gauge', 'chart-bar', 'chart-line', 'trending-up', 'trending-down', 'users',
  'user', 'target', 'rocket', 'lightbulb', 'shield', 'lock', 'clock', 'calendar',
  'check', 'star', 'heart', 'leaf', 'building', 'map-pin', 'mail', 'settings',
  'cpu', 'database', 'cloud', 'code', 'book', 'coins', 'handshake', 'sparkles'
]);

const ICON_ALIASES = Object.freeze({
  product: 'package', box: 'package', world: 'globe', global: 'globe', market: 'globe', international: 'globe',
  performance: 'gauge', speed: 'gauge', operations: 'gauge', chart: 'chart-bar', bar: 'chart-bar', analytics: 'chart-bar',
  line: 'chart-line', growth: 'trending-up', increase: 'trending-up', up: 'trending-up', decline: 'trending-down', decrease: 'trending-down', down: 'trending-down',
  team: 'users', people: 'users', customers: 'users', community: 'users', person: 'user', profile: 'user',
  goal: 'target', aim: 'target', focus: 'target', launch: 'rocket', startup: 'rocket', idea: 'lightbulb', insight: 'lightbulb', innovation: 'lightbulb',
  security: 'shield', safety: 'shield', privacy: 'lock', secure: 'lock', time: 'clock', schedule: 'clock', date: 'calendar', event: 'calendar',
  done: 'check', success: 'check', quality: 'star', favorite: 'star', care: 'heart', health: 'heart', eco: 'leaf', nature: 'leaf', sustainability: 'leaf',
  office: 'building', company: 'building', location: 'map-pin', place: 'map-pin', pin: 'map-pin', email: 'mail', contact: 'mail',
  gear: 'settings', config: 'settings', process: 'settings', chip: 'cpu', hardware: 'cpu', ai: 'sparkles', magic: 'sparkles', data: 'database', storage: 'database',
  server: 'cloud', saas: 'cloud', developer: 'code', software: 'code', learn: 'book', education: 'book', docs: 'book',
  money: 'coins', revenue: 'coins', finance: 'coins', cost: 'coins', dollar: 'coins', partnership: 'handshake', partner: 'handshake', deal: 'handshake'
});

/** Returns a known icon name for what the model wrote, or null. */
export function normalizeIconName(value) {
  const name = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (!name) return null;
  if (ICON_NAMES.includes(name)) return name;
  return ICON_ALIASES[name.replace(/-/g, '')] || ICON_ALIASES[name] || null;
}
