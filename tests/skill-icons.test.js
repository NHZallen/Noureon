import assert from 'node:assert/strict';
import test from 'node:test';

import { skillIcon, skillMark } from '../src/app/ui/cli/cli-icons.js';
import { OFFICIAL_SKILL_CATALOG } from '../src/data/skill-catalog.js';
import { OFFICIAL_SKILL_ICONS, SKILL_ICON_PATHS } from '../src/data/skill-icons.js';
import { APP_LIBRARIES } from '../src/data/third-party.js';

test('every official skill has an icon of its own, and no two share one', () => {
  const names = OFFICIAL_SKILL_CATALOG.map((skill) => skill.name);
  assert.deepEqual(Object.keys(OFFICIAL_SKILL_ICONS).sort(), [...names].sort(), 'an icon for each official skill and none left over');
  const used = Object.values(OFFICIAL_SKILL_ICONS);
  assert.equal(new Set(used).size, used.length, 'each icon is used by one skill');
  for (const icon of used) assert.match(SKILL_ICON_PATHS[icon] || '', /<(path|circle|rect|line|polyline|polygon|ellipse)\b/, `${icon} has drawing`);
  assert.deepEqual(Object.keys(SKILL_ICON_PATHS).sort(), [...used].sort(), 'no drawing is left unused');
});

test('the drawings are only shapes: nothing in them can run or load anything', () => {
  for (const [icon, markup] of Object.entries(SKILL_ICON_PATHS)) {
    assert.doesNotMatch(markup, /<script|<style|<image|<foreignObject|\son[a-z]+=|href=|javascript:/i, icon);
    assert.doesNotMatch(markup, /#[0-9a-fA-F]{3,8}\b|rgb\(/, `${icon}: the colour is the text's own`);
  }
});

test('an official skill is drawn with its icon in the frame the other icons have, in any size and class', () => {
  const html = skillMark('meeting-notes', '會議記錄', 18, 'input-indicator-mode-icon');
  assert.match(html, /^<svg class="input-indicator-mode-icon" viewBox="0 0 24 24" width="18" height="18"/);
  assert.match(html, /stroke="currentColor" stroke-width="1.8"/);
  assert.ok(html.includes(SKILL_ICON_PATHS['clipboard-list']));
  assert.notEqual(html, skillIcon(18, 'input-indicator-mode-icon'), 'not the star');
  // The title is not what picks it: the name is (the page shows another language's title for the same skill).
  assert.equal(skillMark('meeting-notes', 'Meeting notes', 18), skillMark('meeting-notes', '會議記錄', 18));
});

test('a skill the person added shows the first letter of its title, framed in a chip or a menu, bare where there is a frame already', () => {
  const framed = skillMark('weekly', '週報整理', 18, 'x');
  assert.match(framed, /^<span class="x"/);
  assert.match(framed, />週<\/span>$/, 'the first letter of the title');
  assert.match(framed, /border:1\.5px solid currentColor;border-radius:5px/, 'a small frame');
  assert.match(framed, /width:18px;height:18px/);
  const bare = skillMark('weekly', '週報整理', 22, '', { framed: false });
  assert.doesNotMatch(bare, /border:|border-radius/, 'the list of the page has its own frame');
  assert.match(bare, /font-weight:600;line-height:1;font-size:16px;/, 'written as separate properties: a font shorthand with "inherit" in it is dropped by the browser');
  assert.match(skillMark('sql-helper', 'sql-helper', 18), />S<\/span>$/, 'a latin letter is made a capital');
  assert.match(skillMark('x', '  🙂 smile', 18), /🙂<\/span>$/, 'a whole character, not half of one');
  assert.match(skillMark('x', 'élan', 18), />É<\/span>$/);
});

test('what the letter is made of cannot become markup, and a skill with no title at all gets the star', () => {
  assert.match(skillMark('x', '<img src=x onerror=alert(1)>', 18), />&lt;<\/span>$/);
  assert.doesNotMatch(skillMark('x', '<img src=x onerror=alert(1)>', 18), /<img/);
  assert.match(skillMark('x', '"quoted"', 18), />&quot;<\/span>$/);
  assert.equal(skillMark('', '', 16, 'c'), skillIcon(16, 'c'));
  assert.equal(skillMark('x', '   ', 16), skillIcon(16));
});

test('the icons come from Lucide, whose licence asks for its notice: it is on the licences page', () => {
  const entry = APP_LIBRARIES.find((library) => library.name === 'Lucide');
  assert.ok(entry);
  assert.equal(entry.license, 'ISC');
  assert.match(entry.note, /Copyright \(c\) 2026 Lucide Icons and Contributors/);
});
