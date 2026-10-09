// The skills a model wrote for the person (docs/superpowers/specs/2026-10-09-skills-design.md, §15): the cards in the chat (ui/skill/skill-draft-card.js) and what their button does.
// Loaded by lazy-skill-mode.js when the first ```skill-draft placeholder is on the page, so a page without one never loads it.

import { addSkill } from './skill-state.js';
import { skillText } from './skill-texts.js';

/**
 * The button of a card opens the window of a pasted skill with the draft in it (or, for a draft with files, the window of a skill pack): the person reads it all and presses "Add" there (nothing is saved by the model).
 * `own()` is the skills the person has pasted (skill-store.js), `skillStore` the cloud table of them. Returns { hydrate, addDraft }.
 */
export function createSkillDrafts({ document, language, getConfig, saveConfig = async () => {}, showNotification = () => {}, getAccountReady = () => true, skillStore = null, own = () => [], refresh = () => {}, logger = console }) {
  const addDraft = async (text) => {
    if (!skillStore || !getAccountReady()) {
      showNotification(skillText(language(), 'skillsNeedAccount'), 'error');
      return;
    }
    await skillStore.list().catch(() => {});
    const added = (name) => {
      addSkill(getConfig(), name);
      showNotification(skillText(language(), 'skillAdded_notice', { name }), 'success');
      refresh();
      void Promise.resolve(saveConfig()).catch((error) => logger?.warn?.('Saving the skills failed.', error));
    };
    const existing = (name) => own().some((skill) => skill.name === name);
    const { draftHasFiles, readDraftBundle } = await import('../../../data/skill-draft.js');
    if (draftHasFiles(text)) {
      // A draft with files is a skill pack: the window that shows a pack, with every file to read, and "Add" there.
      const read = await readDraftBundle(text);
      if (!read.ok) {
        showNotification(`${skillText(language(), `skillErr_${read.error}`)}${read.detail ? ` (${read.detail})` : ''}`, 'error');
        return;
      }
      const [{ openSkillBundleModal }] = await Promise.all([import('../../ui/skill/skill-bundle-modal.js'), import('../../ui/skill/skill-bundle-modal.css').catch(() => {})]);
      openSkillBundleModal({
        document,
        language: language(),
        read,
        existing,
        onSubmit: async (pack, { replace }) => {
          const result = await skillStore.addBundle(pack, { replace });
          if (result.ok) added(result.skill.name);
          return result;
        }
      });
      return;
    }
    const { openSkillPasteModal } = await import('../../ui/skill/skill-paste-modal.js');
    openSkillPasteModal({
      document,
      language: language(),
      initialText: text,
      existing,
      onSubmit: async (pasted, { replace }) => {
        const result = await skillStore.add(pasted, { replace });
        if (result.ok) added(result.skill.name);
        return result;
      }
    });
  };
  let card = null;
  const hydrate = async () => {
    card ||= await Promise.all([import('../../ui/skill/skill-draft-card.js'), import('../../ui/skill/skill-draft-card.css').catch(() => {})]);
    card[0].hydrateSkillDrafts({ root: document, language: language(), onAdd: addDraft });
  };
  return { hydrate, addDraft };
}
