// The choices the model picker makes outside the council (council-controls-lifecycle.js): choosing the model of a conversation (with
// the terms a hidden or stealth model asks to be accepted first), and the depth slider of how much the model thinks.

import { noteModelsUsed as noteRecent } from '../../ui/model-picker/model-groups.js';
import { chooseEffort, switchEffort } from '../shell/reasoning-memory.js';

export function createPickerChoices({
  document, models, getActiveConversation, getConfig, getI18n, showCustomDialog, getModelReasoningConfig, normalizeReasoningEffort,
  normalizeConversationModel, renderSidebar, renderInputIndicators, saveAppData, saveConfig, afterPaint
}) {
  const chooseModel = async (modelId) => {
    const conv = getActiveConversation();
    const config = getConfig();
    if (!conv || conv.archived) return false;
    const info = models.find((model) => model.id === modelId);
    if (!info) return false;
    const translations = getI18n()[config.uiLanguage] || {};
    const acknowledged = Array.isArray(config.acknowledgedStealthModelTerms) ? config.acknowledgedStealthModelTerms : [];
    const acknowledgementId = info.stealthTermsAcknowledgementId || info.id;
    if (info.hiddenModel && !acknowledged.includes(acknowledgementId)) {
      // A hidden (test) model of OpenCode Go: what that means, with no terms page to link to (OpenCode's announcements are the word on it).
      const accepted = await showCustomDialog({
        title: translations.hiddenModelTermsTitle || 'Hidden test model',
        message: translations.hiddenModelTermsMessage || 'This is a hidden test model of OpenCode Go. It may be renamed, changed or removed at any time. For its data retention and whether it is used for training, follow what OpenCode announces.',
        buttons: [
          { text: translations.cancel || 'Cancel', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false },
          { text: translations.confirm || 'Confirm', class: 'px-4 py-2 rounded-md btn-primary', value: () => true }
        ]
      });
      if (!accepted) return false;
      config.acknowledgedStealthModelTerms = [...acknowledged, acknowledgementId];
    } else if (info.requiresStealthTermsAcknowledgement && !acknowledged.includes(acknowledgementId)) {
      const placeholder = '{termsLink}';
      const template = translations.stealthModelTermsMessage || 'This stealth model is developed and operated by a third-party model provider. Prompts and completions for this model are retained by the provider and are not used for training; all other use is governed by the {termsLink}.';
      const linkText = translations.stealthModelTermsLink || 'Stealth Model Terms(opens in new tab)';
      const at = template.indexOf(placeholder);
      const messageParts = at === -1
        ? [template]
        : [template.slice(0, at), { text: linkText, href: 'https://openrouter.ai/terms/stealth' }, template.slice(at + placeholder.length)];
      const accepted = await showCustomDialog({
        title: translations.stealthModelTermsTitle || 'Stealth model terms',
        messageParts,
        buttons: [
          { text: translations.cancel || 'Cancel', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false },
          { text: translations.confirm || 'Confirm', class: 'px-4 py-2 rounded-md btn-primary', value: () => true }
        ]
      });
      if (!accepted) return false;
      config.acknowledgedStealthModelTerms = [...acknowledged, acknowledgementId];
    }
    // The level of the model it leaves is kept, and the new one gets the level chosen for it in this conversation (its default the first time).
    switchEffort(conv, info, { getModelReasoningConfig, normalizeReasoningEffort });
    conv.model = info.id;
    conv.provider = info.provider;
    if (info.outputModality === 'image' && conv.council) conv.council.enabled = false;
    config.lastUsedModel = modelId;
    config.recentModelIds = noteRecent(config.recentModelIds, [modelId]);
    renderSidebar();
    renderInputIndicators();
    afterPaint(async () => {
      await saveAppData();
      await saveConfig();
    });
    return true;
  };

  const DEPTH_KEYS = Object.freeze({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, Home: 'first', End: 'last' });

  // Draws the thumb, the fill and the name at a position between 0 and the last level.
  const paintDepth = (input, position, { tick = false } = {}) => {
    const wrap = input.closest('[data-mp-slider]');
    if (tick && wrap && wrap.dataset.mpLevel !== undefined && Number(wrap.dataset.mpLevel) !== position) {
      try { document.defaultView?.navigator?.vibrate?.(6); } catch { /* no haptics here */ }
    }
    if (wrap) wrap.dataset.mpLevel = String(position);
    const last = Math.max(1, Number(input.max));
    wrap?.style.setProperty('--mp-p', String(Math.min(1, Math.max(0, position / last))));
    const labels = JSON.parse(input.closest('[data-mp-depth]')?.dataset.mpLabels || '[]');
    const label = labels[Math.min(labels.length - 1, Math.max(0, Math.round(position)))];
    if (label === undefined) return null;
    const value = input.closest('[data-mp-depth]')?.querySelector('[data-mp-depth-value]');
    if (value && value.textContent !== label) {
      value.textContent = label;
      const reduce = document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (typeof value.animate === 'function' && !reduce) {
        value.animate([{ opacity: 0.3, transform: 'translateY(5px) scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 170, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' });
      }
    }
    input.setAttribute('aria-valuetext', label);
    // The button in the composer follows the thumb while it is dragged, not only when it lands (its width does not change: it keeps the longest name).
    const shown = input.closest('#model-council-control')?.querySelector('.mp-depth-trigger-value');
    if (shown && shown.textContent !== label) shown.textContent = label;
    return label;
  };

  // Lands on a level: the choice is saved without redrawing the panel, which would cut the
  // thumb's short move to that dot.
  const commitDepth = async (container, input, index) => {
    input.value = String(index);
    const label = paintDepth(input, index);
    const conv = getActiveConversation();
    const info = conv ? normalizeConversationModel(conv) : null;
    const options = getModelReasoningConfig(info)?.options || [];
    const chosen = normalizeReasoningEffort(info, options[index]);
    if (!conv || !chosen || chosen === normalizeReasoningEffort(info, conv.reasoningEffort)) return;
    chooseEffort(conv, info.id, chosen);
    const shown = container.querySelector('.mp-depth-trigger-value');
    if (shown && label) shown.textContent = label;
    await saveAppData();
  };

  return { chooseModel, DEPTH_KEYS, paintDepth, commitDepth };
}
