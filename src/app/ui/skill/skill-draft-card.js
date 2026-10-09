// The card of a skill a model wrote for the person (docs/superpowers/specs/2026-10-09-skills-design.md, §15): the skill-creator skill has the model put the finished
// skill in a ```skill-draft block, and the chat shows it as this card: the name, what it is for, the whole text to read, and a button that opens the window
// of a pasted skill with the draft in it (the person reads it there and presses "Add"; nothing is saved by the model). A draft that is not a good skill
// (yet) is shown as the code it is, with the reason, so the person can ask the model to put it right. Loaded when the first card is on the page.

import { parseSkillMarkdown } from '../../../data/skill-format.js';
import { skillText } from '../../runtime/skill/skill-texts.js';
import { skillIcon } from '../cli/cli-icons.js';

/** The draft text a placeholder carries ('' when it cannot be read). */
export function draftOf(element) {
  try {
    return decodeURIComponent(element?.dataset?.draft || '');
  } catch {
    return '';
  }
}

/**
 * Turns the placeholders of ```skill-draft blocks under `root` into cards. `onAdd(text)` is called with the draft when the person presses the button.
 * A placeholder is made once (`data-ready`). Returns how many cards were made.
 */
export function hydrateSkillDrafts({ root, language, onAdd }) {
  const t = (key, values) => skillText(language, key, values);
  let made = 0;
  for (const element of root.querySelectorAll?.('.skill-draft-card:not([data-ready])') || []) {
    const document = element.ownerDocument;
    const text = draftOf(element);
    const make = (tag, className, content) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (content !== undefined) node.textContent = content;
      return node;
    };
    element.dataset.ready = 'true';
    const parsed = parseSkillMarkdown(text);
    if (!parsed.ok) {
      // Not a skill yet: the text as it is, with why.
      element.classList.add('is-invalid');
      const pre = make('pre', 'skill-draft-code');
      pre.append(make('code', '', text));
      element.replaceChildren(pre, make('p', 'skill-draft-note', t('skillDraftInvalid', { reason: t(`skillErr_${parsed.error}`) })));
      made += 1;
      continue;
    }
    const { skill } = parsed;
    const head = make('div', 'skill-draft-head');
    const mark = make('span', 'skill-draft-mark');
    mark.innerHTML = skillIcon(20);
    const titles = make('div', 'skill-draft-titles');
    titles.append(make('span', 'skill-draft-kind', t('skillDraftLabel')), make('strong', 'skill-draft-name', skill.name), make('span', 'skill-draft-description', skill.description));
    head.append(mark, titles);
    const details = make('details', 'skill-draft-details');
    details.append(make('summary', '', t('skillDraftShowText', { count: skill.body.length })));
    const pre = make('pre', 'skill-draft-text');
    pre.textContent = skill.body;
    details.append(pre);
    const actions = make('div', 'skill-draft-actions');
    const add = make('button', 'skill-draft-add', t('skillDraftAdd'));
    add.type = 'button';
    add.addEventListener('click', () => onAdd(text));
    actions.append(add, make('span', 'skill-draft-hint', t('skillDraftHint')));
    element.replaceChildren(head, details, actions);
    made += 1;
  }
  return made;
}
