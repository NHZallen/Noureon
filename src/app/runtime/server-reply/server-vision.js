// The visual check of a presentation, when the server makes it (server/vision-check.js). The check is a run of its own on the server; every
// page of the account may watch it, and draws the same progress line as for a check made in the page (ui/files/vision/vision-progress.js),
// from the calls the server tells ({ m: 'set' | 'slide' | 'sheet' | 'think' | 'issues' | 'py' | … }). A page that joins late is given the
// calls so far. While the check runs the chat cannot send (runtime/features/vision-check-lock.js), on every page.

import { visionText } from '../../ui/files/vision/vision-texts.js';
import { setVisionLocked } from '../features/vision-check-lock.js';
import { withFileBytes } from './server-reply.js';

const LOOKS = 4;
const LOOK_EVERY_MS = 1500;

// Whether a reply may hold a presentation (as the page's own check asks): a block of a .pptx file in its text, or a .pptx that Python made.
const DECK_BLOCK = /(?:`{3,}|~{3,})\s*file\s+[^\n]*\.pptx/i;
const mayHaveDeck = (message) => DECK_BLOCK.test(message?.parts?.[0]?.text || '') || (message?.parts || []).some((part) => /\.pptx$/i.test(part?.sandboxFile?.name || ''));

const lastMessageStack = (document) => [...(document?.querySelectorAll?.('.message-stack') || [])].at(-1) || null;

export function createServerVisionFollow({
  serverReply,
  document,
  getLanguage = () => 'zh-TW',
  showNotification = () => {},
  getActiveConversation = () => null,
  getSync = () => globalThis.__astraCloudSyncV2,
  onLockChange = () => {},
  findHost = lastMessageStack,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  warn = () => {}
}) {
  const following = new Set();
  const locked = new Map();

  const lock = (conversationId, on) => {
    if (on) locked.set(conversationId, (locked.get(conversationId) || 0) + 1);
    else if ((locked.get(conversationId) || 0) <= 1) locked.delete(conversationId);
    else locked.set(conversationId, locked.get(conversationId) - 1);
    setVisionLocked('server', [...locked.keys()]);
    onLockChange();
  };

  /** Follows the check `runId` of `conversation` until the server says it is over. Resolves when it is. */
  const attach = async ({ runId, conversation, host = null }) => {
    if (!runId || following.has(runId)) return;
    following.add(runId);
    lock(conversation.id, true);
    const language = getLanguage();
    const controller = new AbortController();
    const stopWatching = new AbortController();
    // The stop of the progress line stops the check on the server (and so on every page).
    controller.signal.addEventListener('abort', () => { void serverReply.request('POST', `/v1/runs/${runId}/stop`).catch?.(() => {}); }, { once: true });
    let progress = null;
    let python = null;
    let replaying = false;
    let createVisionProgress = null;
    // When the check began, in this page's clock: the server says how long it has been going (the calls so far come with it), and each
    // call says when it happened, so every page shows the same seconds, however late it was opened.
    let began = null;
    const handle = (call) => {
      const [first, second] = call.a || [];
      const at = began !== null && Number.isFinite(call.t) ? began + call.t : null;
      progress?.happenedAt?.(at);
      try {
        apply(call, first, second, at);
      } finally {
        progress?.happenedAt?.(null);
      }
    };
    const apply = (call, first, second, at) => {
      switch (call.m) {
        case 'begin':
          progress?.remove();
          python = null;
          progress = createVisionProgress({ document, language, controller, host: host || findHost(document), startedAt: at });
          break;
        case 'set': progress?.set(first, second); break;
        case 'slide': progress?.slideRendered(first); break;
        case 'sheet': progress?.sheetReady(first); break;
        case 'think': progress?.thinking(first); break;
        case 'issues': progress?.showIssues(first); break;
        case 'text': progress?.setText(first); break;
        case 'py':
          python ||= progress?.python(language) || null;
          python?.event(at === null ? withFileBytes(first) : { ...withFileBytes(first), at });
          break;
        case 'pyEnd':
          python?.remove();
          python = null;
          break;
        case 'remove':
          progress?.remove();
          progress = null;
          break;
        case 'file-end': {
          progress?.remove();
          progress = null;
          python = null;
          // What the page already told is not told again when the calls so far are replayed to it.
          if (replaying) break;
          // The result is a reply the server wrote into the chat (a corrected reply, or a note of how the check ended): the cloud sync brings it
          // in. Only when it could not be written is the result told by a notice.
          if (first?.messageId) void Promise.resolve(getSync()?.flush?.()).catch(() => {});
          else if (first?.outcome === 'clean' && getActiveConversation()?.id === conversation.id) showNotification(visionText(language, 'clean'), 'success');
          else if (first?.outcome === 'failed') showNotification(visionText(language, 'failed', { reason: first.reason || '' }), 'warning');
          else if (first?.outcome === 'left' && first.found) showNotification(visionText(language, 'leftAlone', { found: first.found }), 'warning');
          break;
        }
        default: break;
      }
    };
    try {
      ({ createVisionProgress } = await import('../../ui/files/vision/vision-progress.js'));
      await serverReply.watchRun(runId, {
        signal: stopWatching.signal,
        onEvent: (event) => {
          if (event.r && began === null) began = Date.now() - (Number(event.r.elapsedMs) || 0);
          if (Array.isArray(event.r?.vc)) {
            replaying = true;
            try {
              event.r.vc.forEach(handle);
            } finally {
              replaying = false;
            }
          } else if (event.vc) handle(event.vc);
          return event.done ? 'done' : null;
        }
      });
    } catch (error) {
      warn('Following the visual check of the server failed.', error);
    } finally {
      stopWatching.abort();
      progress?.remove();
      following.delete(runId);
      lock(conversation.id, false);
    }
  };

  // The check of a reply whose check the server makes: found if its id was not heard, and followed under the message.
  const findAndAttach = async ({ conversation, host }) => {
    for (let look = 0; look < LOOKS; look += 1) {
      let run = null;
      try {
        run = await serverReply.find(conversation.id);
      } catch {
        run = null;
      }
      if (run?.kind === 'vision') return attach({ runId: run.runId, conversation, host });
      await wait(LOOK_EVERY_MS);
    }
    return null;
  };

  /**
   * The check of a reply that the server may check (`note`: { vision, visionRunId }, what the server said when the reply was over): followed
   * under the message; the page makes no check of its own.
   */
  const scheduleServer = ({ conversation, message, targetElement = null, note }) => {
    const host = targetElement?.closest?.('.message-stack') || null;
    if (note.visionRunId) return attach({ runId: note.visionRunId, conversation, host });
    // The id was not heard (the live channel broke): looked for, but only for a reply that holds a presentation.
    return mayHaveDeck(message) ? findAndAttach({ conversation, host }) : null;
  };

  return { attach, scheduleServer };
}
