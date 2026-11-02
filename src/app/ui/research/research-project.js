// A finished deep research added to a project as a source (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §11): the person picks the project in a small sheet, and the report goes in as a
// Markdown file (its text with the list of its sources at the end, as the Markdown download), read and kept like any file added to a project. A report that is already there is not added twice.

import { getProjectsApi } from '../../runtime/projects/projects-api.js';
import { researchText } from '../../runtime/research/research-texts.js';
import { reportFileName, reportMarkdown } from './research-export.js';

/** The most projects the sheet lists (the newest first). */
export const PROJECTS_LISTED_MAX = 30;

/** The words for a report that could not be added (`code` is the reason the file was refused). */
export const addFailureKey = (code) => (code === 'duplicate' ? 'alreadyInProject' : code === 'full' || code === 'too_much' || code === 'files_too_much' ? 'projectFull' : 'addToProjectFailed');

/**
 * Asks which project and adds the report to it. `showNotification(message, type)` says what happened. Resolves { ok, project? } (nothing when the person closes the sheet).
 */
export async function addReportToProject({ report, language = 'en', document = globalThis.document, showNotification = () => {}, api = getProjectsApi() }) {
  const t = (key, values) => researchText(language, key, values);
  const projects = api?.list?.() || [];
  if (!api) { showNotification(t('addToProjectFailed'), 'error'); return { ok: false }; }
  if (!projects.length) { showNotification(t('noProjects'), 'error'); return { ok: false }; }
  // The styles and the sheet of the projects are loaded now (they are not part of the chat).
  await Promise.all([import('../../../styles/projects.css'), import('../../../styles/projects-wide.css')]).catch(() => {});
  const { openActionSheet } = await import('../projects/project-parts.js');
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'pj pj-dialog-only';
    document.body.appendChild(root);
    let chosen = false;
    openActionSheet({
      document, root, title: t('addToProjectTitle'), // (A choice closes the sheet first and then runs: the answer is given once that has had its turn.)
      onClose: () => { root.remove(); queueMicrotask(() => { if (!chosen) resolve({ ok: false }); }); },
      items: projects.slice(0, PROJECTS_LISTED_MAX).map((project) => ({
        label: project.name, icon: 'folder',
        action: async () => {
          chosen = true;
          const file = new globalThis.File([reportMarkdown(report, language)], reportFileName(report, 'md'), { type: 'text/markdown' });
          const result = await api.addFile(project.id, file, { origin: 'research' }).catch(() => ({ ok: false, code: 'failed' }));
          if (result.ok) showNotification(`${t('addedToProject', { name: project.name })}${result.truncated ? ` ${t('addedTruncated')}` : ''}`, 'success');
          else showNotification(t(addFailureKey(result.code), { name: project.name }), 'error');
          resolve({ ok: Boolean(result.ok), project: project.id });
        }
      }))
    });
  });
}
