import { circleSegments, parsePathData, roundedRectSegments } from './svg-path.js';

// The curated icon vocabulary slides may reference with `"icon": "globe"`.
// The drawings below are shared by the slide preview (SVG) and PowerPoint
// (custom geometry), so an icon looks the same in both.
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

// Line drawings on a 24 × 24 grid, stroked at 1.75 with round caps and joins.
// Each part is path data, ['circle', cx, cy, r] or ['rect', x, y, w, h, r].
export const ICON_STROKE = 1.75;
export const ICON_DRAWINGS = Object.freeze({
  package: ['M3.5 7.5 12 3.5 20.5 7.5 12 11.5Z', 'M3.5 7.5V16.5L12 20.5 20.5 16.5V7.5', 'M12 11.5V20.5', 'M7.8 5.5 16.2 9.5'],
  globe: [['circle', 12, 12, 8.5], 'M3.5 12H20.5', 'M12 3.5C15 6.7 15 17.3 12 20.5', 'M12 3.5C9 6.7 9 17.3 12 20.5'],
  gauge: ['M4 16.5A8 8 0 1 1 20 16.5', 'M12 16.5 16.2 11.5', ['circle', 12, 16.5, 1.3], 'M4 20H20'],
  'chart-bar': ['M4 20.5H20', ['rect', 5.5, 12, 3.2, 5.5, 0.6], ['rect', 10.4, 6, 3.2, 11.5, 0.6], ['rect', 15.3, 9, 3.2, 8.5, 0.6]],
  'chart-line': ['M4 4V20H20', 'M7.5 15 11 11 14 14 19 8'],
  'trending-up': ['M3.5 17 9.5 11 13.5 15 20.5 8', 'M15 8H20.5V13.5'],
  'trending-down': ['M3.5 7 9.5 13 13.5 9 20.5 16', 'M15 16H20.5V10.5'],
  users: [['circle', 9, 8.5, 3.2], 'M3.5 19.5C4.1 16.2 6.3 14.5 9 14.5S13.9 16.2 14.5 19.5', 'M15.5 5.6A3 3 0 0 1 15.5 11.4', 'M17.2 14.7C19.1 15.3 20.2 16.9 20.5 19.5'],
  user: [['circle', 12, 8, 3.8], 'M4.5 20C5.3 16 8.1 14 12 14S18.7 16 19.5 20'],
  target: [['circle', 12, 12, 8.5], ['circle', 12, 12, 5], ['circle', 12, 12, 1.5]],
  rocket: ['M12 3.5C15.2 5.5 16.8 8.8 16.8 12.7L14.5 16H9.5L7.2 12.7C7.2 8.8 8.8 5.5 12 3.5Z', ['circle', 12, 9.5, 1.6], 'M7.4 13 5 15.5 5.8 18.3 9.5 16', 'M16.6 13 19 15.5 18.2 18.3 14.5 16', 'M10.5 18.5 12 21 13.5 18.5'],
  lightbulb: ['M9 17.5H15', 'M10 20.5H14', 'M8.6 15C6.7 13.6 5.5 11.6 5.5 9.2A6.5 6.5 0 0 1 18.5 9.2C18.5 11.6 17.3 13.6 15.4 15Z'],
  shield: ['M12 3.5 19 6V11.5C19 15.9 16.1 19.4 12 20.5 7.9 19.4 5 15.9 5 11.5V6Z', 'M9 12 11.2 14.2 15.2 10'],
  lock: [['rect', 5, 10.5, 14, 10, 2], 'M8 10.5V7.5A4 4 0 0 1 16 7.5V10.5', 'M12 14.5V17'],
  clock: [['circle', 12, 12, 8.5], 'M12 7.5V12L15 14'],
  calendar: [['rect', 4, 5.5, 16, 14.5, 2], 'M4 10H20', 'M8.5 3.5V7.5', 'M15.5 3.5V7.5'],
  check: ['M5 12.5 9.5 17 19 7.5'],
  star: ['M12 3.8 14.5 9 20.1 9.8 16 13.7 17 19.3 12 16.6 7 19.3 8 13.7 3.9 9.8 9.5 9Z'],
  heart: ['M12 19.5C12 19.5 4.5 15.1 4.5 9.5A4.2 4.2 0 0 1 12 7.2 4.2 4.2 0 0 1 19.5 9.5C19.5 15.1 12 19.5 12 19.5Z'],
  leaf: ['M5 19C5 11 10 5.5 19.5 4.5 19 13.5 13.5 19 5 19Z', 'M5 19 13 11'],
  building: ['M5 20.5V4.5H14V20.5', 'M14 9.5H19V20.5', 'M3.5 20.5H20.5', 'M8 8H11', 'M8 11.5H11', 'M8 15H11', 'M16.5 13H16.6', 'M16.5 16.5H16.6'],
  'map-pin': ['M12 21C12 21 5.5 15.1 5.5 9.8A6.5 6.5 0 0 1 18.5 9.8C18.5 15.1 12 21 12 21Z', ['circle', 12, 9.8, 2.4]],
  mail: [['rect', 3.5, 5.5, 17, 13, 2], 'M4 7.5 12 13 20 7.5'],
  settings: ['M4 7H12.5', 'M17.5 7H20', ['circle', 15, 7, 2.3], 'M4 17H6.5', 'M11.5 17H20', ['circle', 9, 17, 2.3]],
  cpu: [['rect', 7, 7, 10, 10, 1.5], ['rect', 10, 10, 4, 4, 0.5], 'M10 3.5V7', 'M14 3.5V7', 'M10 17V20.5', 'M14 17V20.5', 'M3.5 10H7', 'M3.5 14H7', 'M17 10H20.5', 'M17 14H20.5'],
  database: ['M5 6C5 4.6 8.1 3.5 12 3.5S19 4.6 19 6 15.9 8.5 12 8.5 5 7.4 5 6Z', 'M5 6V18C5 19.4 8.1 20.5 12 20.5S19 19.4 19 18V6', 'M5 12C5 13.4 8.1 14.5 12 14.5S19 13.4 19 12'],
  cloud: ['M7 18.5A4.5 4.5 0 0 1 6.4 9.5 5.5 5.5 0 0 1 17 8.2 4.2 4.2 0 0 1 17.3 18.5Z'],
  code: ['M8.5 7.5 4 12 8.5 16.5', 'M15.5 7.5 20 12 15.5 16.5', 'M13.5 5.5 10.5 18.5'],
  book: ['M4.5 5.5C7 4.5 9.5 4.5 12 6V20C9.5 18.5 7 18.5 4.5 19.5Z', 'M19.5 5.5C17 4.5 14.5 4.5 12 6V20C14.5 18.5 17 18.5 19.5 19.5Z'],
  coins: [['circle', 9, 9, 5.5], ['circle', 9, 9, 2.4], 'M14.5 9.5A5.5 5.5 0 1 1 9.5 14.5'],
  handshake: ['M2.5 11 6 7.5 9.5 9', 'M21.5 11 18 7.5 14 9 9.5 12.5A1.5 1.5 0 0 0 11.5 14.7L14 13 18 17', 'M6 13.5 10 17.5A1.4 1.4 0 0 0 12 15.5', 'M8.5 16 11 18.5A1.4 1.4 0 0 0 13 16.5L14 17.5A1.4 1.4 0 0 0 16 15.5'],
  // Internal: the frame drawn on image placeholders (not offered to models).
  photo: [['rect', 3.5, 5, 17, 14, 1.5], 'M4 16.5 9 11.5 13 15.5 15.5 13 20 17.5', ['circle', 15.5, 9, 1.6]],
  sparkles: ['M12 4 13.6 8.4 18 10 13.6 11.6 12 16 10.4 11.6 6 10 10.4 8.4Z', 'M18.5 15.5 19.2 17.3 21 18 19.2 18.7 18.5 20.5 17.8 18.7 16 18 17.8 17.3Z', 'M5.5 16V19', 'M4 17.5H7']
});

/** An icon as absolute move/line/cubic/close segments on the 24 × 24 grid. */
export function iconSegments(name) {
  const drawing = ICON_DRAWINGS[name];
  if (!drawing) return [];
  return drawing.flatMap((part) => {
    if (typeof part === 'string') return parsePathData(part);
    if (part[0] === 'circle') return circleSegments(part[1], part[2], part[3]);
    return roundedRectSegments(part[1], part[2], part[3], part[4], part[5] || 0);
  });
}
