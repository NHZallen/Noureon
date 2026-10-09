// The deep research as the composer sees it: its item in the "+" menu, its chip above the message box (and in the message that is sent), the
// editing of a plan (a chip with the plan's name: what is written next changes that plan), and what sending does then. The rest (starting,
// following, the cards) is loaded when it is needed (research-run.js, ui/research/).

import { renderComposerToolIcon } from '../../composer-tool-icons.js';
import { registerResearchMode } from './research-bridge.js';
import { getResearch, subscribeAnyResearch } from './research-store.js';
import { createCliMode } from '../cli/cli-mode.js';
import { createLazySkillMode } from '../skill/lazy-skill-mode.js';
import { createQuizWatch } from '../quiz/quiz-watch.js';
import { createLazySkillStore } from '../skill/lazy-skill-store.js';
import { researchText } from './research-texts.js';

export const RESEARCH_INDICATOR_ID = 'deep-research-indicator';
export const PLAN_INDICATOR_ID = 'research-plan-indicator';
const MENU_BUTTON_ID = 'research-mode-menu-btn';

const escapeHTML = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const shorten = (text, limit) => (String(text).length > limit ? `${String(text).slice(0, limit - 1)}…` : String(text));

export function createResearchMode({
  document,
  getActiveConversation,
  normalizeConversationModel,
  modelSupportsToolCalling,
  isImageConversation,
  isCouncilEnabled,
  serverReply,
  researchTools,
  // The chat's own preparation of a sent message: shows it, keeps it, and gives what the reply needs.
  prepare,
  messageInput,
  addMessageToUI,
  saveAppData,
  showNotification,
  getConfig,
  saveConfig,
  getUiLanguage,
  setAbortController,
  updateSubmitButtonState,
  refresh,
  closeAllPopovers,
  logger = console
}) {
  const getInput = () => messageInput;
  // The CLI tools (命令工具) share this host: they too put a chip in the box and an entry in the menus. A box that cannot take listeners
  // (a test) has none.
  // The skills the person pasted are kept in their cloud account: the account library is loaded when first needed.
  const skillStore = createLazySkillStore({
    getClient: async () => (await import('../../auth/supabase-client.js')).getSupabaseClient(),
    getUserId: async () => {
      if (!serverReply.hasAccount()) return '';
      const client = (await import('../../auth/supabase-client.js')).getSupabaseClient();
      const { data } = (await client?.auth?.getSession?.()) || {};
      return data?.session?.user?.id || '';
    }
  });
  const cli = typeof messageInput?.addEventListener === 'function' && typeof document?.addEventListener === 'function'
    ? createCliMode({ document, messageInput, isLocked: () => getActiveConversation()?.retentionMode === 'ephemeral', getConfig, saveConfig, getUiLanguage, refresh: () => refresh(), showNotification, getAccountReady: () => serverReply.hasAccount(), skillStore, logger })
    : null;
  // The skills share it too: "/" in the box, and the chip of a skill (a temporary chat has them as well, those that are only words: not those with a script).
  const skills = typeof messageInput?.addEventListener === 'function' && typeof document?.addEventListener === 'function'
    ? createLazySkillMode({ document, messageInput, getConfig, getUiLanguage, refresh: () => refresh(), skillStore, openStore: (kind) => cli?.openStore?.(kind), isTemporary: () => { const conversation = getActiveConversation(); return Boolean(conversation?.isTemporary || conversation?.retentionMode === 'ephemeral'); }, saveConfig, showNotification, getAccountReady: () => serverReply.hasAccount(), logger })
    : null;
  // The cards of the quizzes a model wrote (```quiz): made when a placeholder is on the page.
  if (typeof document?.addEventListener === 'function') createQuizWatch({ document, getUiLanguage, logger });
  const getSync = () => globalThis.__astraCloudSyncV2;
  const warn = (...args) => logger?.warn?.(...args);
  const releaseBusy = () => {
    setAbortController(null);
    updateSubmitButtonState(false);
  };
  // Image conversations, the model council and temporary chats have no deep research.
  const isUnavailable = () => {
    const conversation = getActiveConversation();
    return !conversation || isImageConversation(conversation) || isCouncilEnabled(conversation) || conversation.retentionMode === 'ephemeral';
  };
  // The reason (a key of the research texts) this model cannot do a research now, or null.
  const canResearch = (model) => {
    if (!model || !modelSupportsToolCalling(model)) return 'needToolModel';
    if (model.provider === 'gemini') return 'unsupportedModel';
    if (!researchTools.hasKey()) return 'needSearchKey';
    return serverReply.hasAccount() ? null : 'needAccount';
  };
  let armed = false;
  let editing = null;
  let runtime = null;

  const language = () => getUiLanguage();
  const loadRuntime = async () => {
    if (!runtime) {
      const { createResearchRuntime } = await import('./research-run.js');
      runtime ||= createResearchRuntime({ serverReply, addMessageToUI, saveAppData, showNotification, getSync, getLanguage: language, getConfig, releaseBusy, warn });
    }
    return runtime;
  };

  const editingHere = () => Boolean(editing && getActiveConversation()?.id === editing.conversationId);

  // A research that is being done (not yet at its report) in the open chat: what is written then is an instruction for it.
  const runningHere = () => {
    if (isUnavailable()) return null;
    const messages = getActiveConversation()?.messages || [];
    for (let index = messages.length - 1; index >= Math.max(0, messages.length - 40); index -= 1) {
      const entry = getResearch(messages[index]?.id);
      if (entry?.runId && entry.plan?.phase === 'researching' && !entry.report) return { runId: entry.runId, messageId: messages[index].id, title: entry.plan.title || '', kind: 'steer' };
    }
    return null;
  };
  const steeringHere = () => !armed && !editingHere() && runningHere();

  const setArmed = (value) => {
    armed = value;
    refresh();
  };

  const toggle = () => {
    closeAllPopovers();
    if (armed) {
      setArmed(false);
      return;
    }
    const reason = canResearch(normalizeConversationModel(getActiveConversation()));
    if (reason) {
      showNotification(researchText(language(), reason), 'warning');
      return;
    }
    // A plan that was being changed is let go (its countdown runs again).
    if (editing) void endEdit();
    setArmed(true);
    getInput()?.focus?.();
  };

  const ensureMenuButton = () => {
    const popover = document.getElementById('file-options-popover');
    if (!popover) return null;
    let button = document.getElementById(MENU_BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = MENU_BUTTON_ID;
      button.type = 'button';
      button.className = 'w-full text-left px-4 py-2 text-sm hover:bg-[var(--hover-bg)] flex items-center gap-3';
      button.addEventListener('click', toggle);
      popover.insertBefore(button, document.getElementById('learning-mode-btn') || null);
    }
    const label = researchText(language(), 'menuLabel');
    const description = researchText(language(), 'menuDescription');
    if (button.dataset.language !== language()) {
      button.dataset.language = language();
      button.innerHTML = `${renderComposerToolIcon('deepResearch')}<span class="composer-menu-copy"><span class="composer-menu-label"></span><span class="composer-menu-description"></span></span>`;
      button.querySelector('.composer-menu-label').textContent = label;
      button.querySelector('.composer-menu-description').textContent = description;
    }
    return button;
  };

  /** Called when the buttons of the "+" menu are brought up to date. */
  const syncMenu = () => {
    cli?.sync();
    skills?.sync();
    const button = ensureMenuButton();
    if (!button) return;
    button.style.display = isUnavailable() ? 'none' : 'flex';
    button.classList.toggle('is-active', armed && !isUnavailable());
  };

  /** Adds this mode's chips to the composer's (the same markup as the others: `closeButton(id, title)` gives the ✕). */
  const indicators = (map, closeButton) => {
    cli?.indicators(map, closeButton);
    skills?.indicators(map, closeButton);
    if (armed && !isUnavailable()) {
      map.set(RESEARCH_INDICATOR_ID, {
        id: RESEARCH_INDICATOR_ID,
        html: `<span class="input-indicator-content flex items-center gap-2"><span class="input-indicator-leading">${renderComposerToolIcon('deepResearch', 'input-indicator-mode-icon')}</span><span>${escapeHTML(researchText(language(), 'menuLabel'))}</span></span>${closeButton('close-research-btn-input', escapeHTML(researchText(language(), 'closeChip')))}`,
        eventListener: (element) => element.querySelector('#close-research-btn-input').addEventListener('click', () => setArmed(false))
      });
    }
    const steering = steeringHere();
    if (steering) {
      map.set(PLAN_INDICATOR_ID, {
        id: PLAN_INDICATOR_ID,
        html: `<span class="input-indicator-content flex items-center gap-2"><span class="input-indicator-leading">${renderComposerToolIcon('deepResearch', 'input-indicator-mode-icon')}</span><span>${escapeHTML(shorten(`${researchText(language(), 'steer')}: ${steering.title}`, 28))}</span></span>`,
        eventListener: () => {}
      });
    }
    if (editingHere()) {
      map.set(PLAN_INDICATOR_ID, {
        id: PLAN_INDICATOR_ID,
        html: `<span class="input-indicator-content flex items-center gap-2"><span class="input-indicator-leading">${renderComposerToolIcon('deepResearch', 'input-indicator-mode-icon')}</span><span>${escapeHTML(shorten(editing.kind === 'steer' ? `${researchText(language(), 'steer')}: ${editing.title || ''}` : editing.title || researchText(language(), 'menuLabel'), 28))}</span></span>${closeButton('close-research-plan-btn-input', escapeHTML(researchText(language(), 'planChipClose')))}`,
        eventListener: (element) => element.querySelector('#close-research-plan-btn-input').addEventListener('click', () => { void endEdit(); })
      });
    }
  };

  /** Whether what is sent now belongs here (a new research, or the words that change a plan) and not to the chat's own reply. */
  const takes = (options = {}) => !options.preserveComposer && ((armed && !isUnavailable()) || editingHere() || Boolean(steeringHere()));

  const sendInstruction = async (target) => {
    const input = getInput();
    const text = String(input.value || '').trim();
    if (!text) return;
    const rt = await loadRuntime();
    const steering = target.kind === 'steer';
    const result = await rt.control(target.runId, steering ? 'steer' : 'plan', { instruction: text });
    if (!result.ok) {
      showNotification(researchText(language(), result.code === 'wrong_phase' ? 'wrongPhase' : 'actionFailed'), 'warning');
      if (target === editing && (result.code === 'wrong_phase' || result.code === 'not_found')) editing = null;
      refresh();
      return;
    }
    if (steering) showNotification(researchText(language(), 'steerSent'), 'success');
    input.value = '';
    // The box is told it was emptied, so it takes its height again.
    input.dispatchEvent(new (input.ownerDocument?.defaultView || globalThis).Event('input', { bubbles: true }));
    if (target === editing) editing = null;
    refresh();
  };

  const submit = async () => {
    if (editingHere()) {
      await sendInstruction(editing);
      return;
    }
    const running = steeringHere();
    if (running) {
      await sendInstruction(running);
      return;
    }
    const input = getInput();
    const topic = String(input.value || '').trim();
    if (!topic) return;
    const modelInfo = normalizeConversationModel(getActiveConversation());
    const reason = canResearch(modelInfo);
    if (reason) {
      showNotification(researchText(language(), reason), 'warning');
      return;
    }
    const prepared = await prepare();
    if (!prepared.shouldContinue) return;
    // The chip goes only now: the message that was just sent still carries it.
    setArmed(false);
    const rt = await loadRuntime();
    await rt.start({ prepared, topic, modelInfo });
  };

  /** The card's "Edit": the countdown is held and what is written next changes that plan. */
  const beginEdit = async ({ runId, messageId, title, kind = 'plan' }) => {
    const rt = await loadRuntime();
    // A plan is held (its countdown stops) while it is changed; an instruction for the research that runs holds nothing.
    const result = kind === 'steer' ? { ok: true } : await rt.control(runId, 'hold');
    if (!result.ok) {
      showNotification(researchText(language(), result.code === 'wrong_phase' ? 'wrongPhase' : 'actionFailed'), 'warning');
      return false;
    }
    armed = false;
    editing = { runId, messageId, title, kind, conversationId: getActiveConversation()?.id };
    refresh();
    getInput()?.focus?.();
    return true;
  };

  /** Ends the changing of a plan without a change: the countdown runs again. */
  const endEdit = async ({ release = true } = {}) => {
    const was = editing;
    editing = null;
    refresh();
    if (was && release && was.kind !== 'steer') {
      try {
        await (await loadRuntime()).control(was.runId, 'release');
      } catch (error) {
        warn('Letting the plan go on failed.', error);
      }
    }
  };

  // The cards: a message of a research holds a place (`.research-card-host`), and the card module is loaded when the first one is on the page.
  const mountHost = (host, attempt = 0) => {
    if (!host.isConnected || host.__researchCard || host.__researchMounting) return;
    const message = host.closest('[data-message-index]')?.__astraRenderedMessage;
    if (!message) {
      if (attempt < 5) setTimeout(() => mountHost(host, attempt + 1), 60);
      return;
    }
    host.__researchMounting = true;
    void Promise.all([import('../../ui/research/research-card.js'), import('../../ui/research/research-card.css')]).then(([{ mountResearchCard }]) => {
      mountResearchCard({
        host,
        message,
        getLanguage: language,
        showNotification,
        openReader: async ({ messageId }) => {
          const [{ openResearchReader }] = await Promise.all([import('../../ui/research/research-reader.js'), import('../../ui/research/research-reader.css')]);
          return openResearchReader({ messageId, getLanguage: language, showNotification, document });
        }
      });
    }).catch((error) => warn('Drawing the card of a deep research failed.', error)).finally(() => { host.__researchMounting = false; });
  };
  const scanHosts = (root) => {
    if (root?.nodeType !== 1) return;
    if (root.matches('.research-card-host')) mountHost(root);
    root.querySelectorAll('.research-card-host').forEach((host) => mountHost(host));
  };
  const Observer = document.defaultView?.MutationObserver;
  if (Observer && document.body) {
    new Observer((records) => records.forEach((record) => record.addedNodes.forEach(scanHosts))).observe(document.body, { childList: true, subtree: true });
    scanHosts(document.body);
  }

  // The words in the empty box while a research runs in the open chat.
  const placeholder = () => (steeringHere() || (editingHere() && editing.kind === 'steer') ? researchText(language(), 'steerPlaceholder') : null);
  // When a research starts or ends its work in the open chat, the box (its words, its chip) follows.
  let lastKey = '';
  subscribeAnyResearch(() => {
    const running = runningHere();
    const key = running ? `${running.runId}|${armed}` : '';
    if (key === lastKey) return;
    lastKey = key;
    refresh();
    updateSubmitButtonState(false);
  });

  const mode = {
    placeholder,
    syncMenu,
    indicators,
    takes,
    submit,
    toggle,
    beginEdit,
    endEdit,
    isEditing: (messageId) => Boolean(editing && editing.messageId === messageId),
    // A research the server is running (found when the chat is opened): followed from here.
    followRun: async (args) => (await loadRuntime()).followRun(args),
    control: async (runId, action, payload) => (await loadRuntime()).control(runId, action, payload),
    settle: async (args) => (await loadRuntime()).settle(args)
  };
  registerResearchMode(mode);
  return mode;
}
