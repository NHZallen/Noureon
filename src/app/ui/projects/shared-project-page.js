// The parts of a shared project that the page of the projects does not have (docs/superpowers/specs/2026-11-06-project-sharing-design.md, §13): the list "Shared with you", and the question asked when a person leaves.
// The project itself is shown by the page of the projects (ui/projects/projects-page.js), the same page as a project of the person's own.

import { make, openSheet, projectMark } from './project-parts.js';

/**
 * The question asked before leaving a project: whether to make a project of one's own from the conversations one made there (`mineCount` of them), with a name and the kind of memory.
 * `onLeave({ own, name, memory })` is called when the person says to leave.
 */
export function openLeaveDialog({ document, root, text, project = {}, mineCount = 0, onLeave }) {
  const choice = { own: mineCount > 0, name: `${project.name || ''}`, memory: 'default' };
  return openSheet({
      document, root, title: text('psLeaveTitle', { name: project.name || '' }), dialog: true, close: text('psCancel'),
      body: (content, { close }) => {
        content.appendChild(make(document, 'p', 'pj-note', text('psLeaveBody')));
        if (mineCount > 0) {
          const own = make(document, 'button', 'psh-choice');
          own.type = 'button';
          own.setAttribute('data-leave-own', '');
          own.setAttribute('aria-pressed', 'true');
          own.append(make(document, 'span', 'psh-choice-label', text('psLeaveOwn')), make(document, 'span', 'pj-note', text('psLeaveOwnHint', { count: mineCount })));
          const fields = make(document, 'div', 'psh-own-fields');
          const name = make(document, 'input', 'psh-input');
          name.type = 'text';
          name.id = 'psh-own-name';
          name.value = text('psLeaveOwnDefaultName', { name: project.name || '' });
          choice.name = name.value;
          name.addEventListener('input', () => { choice.name = name.value; });
          const memory = make(document, 'select', 'psh-input');
          memory.id = 'psh-own-memory';
          for (const [value, key] of [['default', 'psMemDefault'], ['project', 'psMemProject']]) { const option = make(document, 'option', '', text(key)); option.value = value; memory.appendChild(option); }
          memory.addEventListener('change', () => { choice.memory = memory.value; });
          fields.append(name, memory);
          own.addEventListener('click', () => { choice.own = !choice.own; own.setAttribute('aria-pressed', String(choice.own)); fields.hidden = !choice.own; });
          content.append(own, fields);
        }
        const buttons = make(document, 'div', 'psh-buttons');
        const cancel = make(document, 'button', 'pj-text-button', text('psCancel'));
        cancel.type = 'button';
        cancel.addEventListener('click', close);
        const confirm = make(document, 'button', 'pj-button pj-primary psh-go', text('psLeaveGo'));
        confirm.type = 'button';
        confirm.setAttribute('data-leave-go', '');
        confirm.addEventListener('click', () => { close(); onLeave({ ...choice }); });
        buttons.append(cancel, confirm);
        content.appendChild(buttons);
      }
    });
}

/** Fills `box` with the projects of the person that were shared with them ([{ project_id, owner_id, name, icon, color, owner_name, role }]); `onOpen(item)` opens one. */
export function drawSharedProjects({ document, box, text, items, onOpen }) {
  box.replaceChildren();
  for (const item of items) {
    const row = make(document, 'button', 'pj-row psh-shared-row');
    row.type = 'button';
    row.dataset.projectId = item.project_id;
    row.appendChild(projectMark(document, { icon: item.icon || 'default', color: item.color || 'gray' }));
    const label = make(document, 'span', 'pj-row-text');
    label.append(make(document, 'span', 'pj-row-title', item.name || ''), make(document, 'span', 'pj-row-meta', `${item.owner_name || ''} · ${text(item.role === 'editor' ? 'psRoleEditor' : 'psRoleChat')}`));
    row.appendChild(label);
    row.addEventListener('click', () => onOpen(item));
    box.appendChild(row);
  }
}
