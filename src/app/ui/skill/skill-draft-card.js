// The card of a skill a model wrote for the person (docs/superpowers/specs/2026-10-09-skills-design.md, §15): the skill-creator skill has the model put the finished
// skill in a ```skill-draft block, and the chat shows it as this card: the name, what it is for, the whole text to read, and a button that opens the window
// of a pasted skill with the draft in it (the person reads it there and presses "Add"; nothing is saved by the model). A draft that is not a good skill
// (yet) is shown as the code it is, with the reason, so the person can ask the model to put it right. Loaded when the first card is on the page.

import { draftHasFiles, readDraftBundle } from '../../../data/skill-draft.js';
import { parseSkillMarkdown } from '../../../data/skill-format.js';
import { skillText } from '../../runtime/skill/skill-texts.js';
import { skillMark } from '../cli/cli-icons.js';
import { formatFileSize } from './skill-file-size.js';

/** The draft text a placeholder carries ('' when it cannot be read). */
export function draftOf(element) {
  try {
    return decodeURIComponent(element?.dataset?.draft || '');
  } catch {
    return '';
  }
}

/** The card of a good draft: `skill` is { name, description, body }, `files` the other files of a draft with files ([{ path, kind, size }]) or null. */
function goodCard({ element, text, skill, files, t, onAdd }) {
  const document = element.ownerDocument;
  const make = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const head = make('div', 'skill-draft-head');
  const mark = make('span', 'skill-draft-mark');
  mark.innerHTML = skillMark(skill.name, skill.name, 20, '', { framed: false });
  const titles = make('div', 'skill-draft-titles');
  titles.append(make('span', 'skill-draft-kind', t('skillDraftLabel')), make('strong', 'skill-draft-name', skill.name), make('span', 'skill-draft-description', skill.description));
  head.append(mark, titles);
  const details = make('details', 'skill-draft-details');
  details.append(make('summary', '', t('skillDraftShowText', { count: skill.body.length })));
  const pre = make('pre', 'skill-draft-text');
  pre.textContent = skill.body;
  details.append(pre);
  const parts = [head, details];
  if (files?.length) {
    // The files that come with it: the person reads each of them in the window the button opens; a script is marked.
    const box = make('div', 'skill-draft-files');
    box.append(make('span', 'skill-draft-files-title', t('skillBundleFiles', { count: files.length })));
    const list = make('ul', 'skill-draft-file-list');
    for (const file of files) {
      const item = make('li', 'skill-draft-file');
      item.append(make('span', 'skill-draft-file-path', file.path));
      if (file.kind === 'script') item.append(make('span', 'cs-badge skill-draft-script', t('skillKindScript')));
      item.append(make('span', 'skill-draft-file-size', formatFileSize(file.size)));
      list.append(item);
    }
    box.append(list);
    parts.push(box);
  }
  const actions = make('div', 'skill-draft-actions');
  const add = make('button', 'skill-draft-add', t('skillDraftAdd'));
  add.type = 'button';
  add.addEventListener('click', () => onAdd(text));
  actions.append(add, make('span', 'skill-draft-hint', t('skillDraftHint')));
  parts.push(actions);
  element.replaceChildren(...parts);
}

/** The card of a draft that is not a skill (yet): the text as it is, and why. */
function invalidCard({ element, text, reason, t }) {
  const document = element.ownerDocument;
  element.classList.add('is-invalid');
  const pre = document.createElement('pre');
  pre.className = 'skill-draft-code';
  const code = document.createElement('code');
  code.textContent = text;
  pre.append(code);
  const note = document.createElement('p');
  note.className = 'skill-draft-note';
  note.textContent = t('skillDraftInvalid', { reason });
  element.replaceChildren(pre, note);
}

/**
 * Turns the placeholders of ```skill-draft blocks under `root` into cards. `onAdd(text)` is called with the draft when the person presses the button.
 * A placeholder is made once (`data-ready`). A draft with files is checked as an uploaded pack is, which takes a moment: its card is made then. Returns how many
 * placeholders were taken up.
 */
export function hydrateSkillDrafts({ root, language, onAdd }) {
  const t = (key, values) => skillText(language, key, values);
  let made = 0;
  for (const element of root.querySelectorAll?.('.skill-draft-card:not([data-ready])') || []) {
    const text = draftOf(element);
    element.dataset.ready = 'true';
    made += 1;
    if (draftHasFiles(text)) {
      void readDraftBundle(text).then((read) => {
        if (!element.isConnected) return;
        if (!read.ok) invalidCard({ element, text, reason: `${t(`skillErr_${read.error}`)}${read.detail ? ` (${read.detail})` : ''}`, t });
        else goodCard({ element, text, skill: read.skill, files: read.files.map(({ path, kind, size }) => ({ path, kind, size })), t, onAdd });
      }).catch(() => invalidCard({ element, text, reason: t('skillErr_failed'), t }));
      continue;
    }
    const parsed = parseSkillMarkdown(text);
    if (!parsed.ok) invalidCard({ element, text, reason: t(`skillErr_${parsed.error}`), t });
    else goodCard({ element, text, skill: parsed.skill, files: null, t, onAdd });
  }
  return made;
}
