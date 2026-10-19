// The 重試 button of the note of a visual check that failed or was stopped: checks those files of the reply again, on the server when it can
// (the check then goes on when the page is closed, server/vision-check.js), else here (vision-check-scheduler.js). Loaded on the first press
// (submit-input-council-lifecycle.js listens for it); the button is drawn by message-markup-renderer.js when vision-retry-state.js says so.

import { visionText } from '../../ui/files/vision/vision-texts.js';
import { eligibleVisionFiles } from '../../ui/files/vision/vision-eligibility.js';
import { freeDecks } from '../../ui/files/vision/free-decks.js';
import { resolveReplyMode } from '../sandbox/file-mode.js';
import { chatsUnderVisionCheck } from './vision-check-lock.js';

const DECK_BLOCK = /(?:`{3,}|~{3,})\s*file\s+[^\n]*\.pptx/i;
const holdsDeck = (message) => message?.role === 'model' && !message.metadata?.visionCheck
  && (DECK_BLOCK.test(message.parts?.[0]?.text || '') || freeDecks(message).length > 0);

/** The reply a note is about: the one it names, else (a note written before notes named it) the last reply with a presentation before it. */
export function visionNoteSource(conversation, note) {
  const messages = conversation?.messages || [];
  const named = note?.metadata?.visionCheck?.sourceMessageId;
  if (named) return messages.find((message) => message.id === named) || null;
  return messages.slice(0, Math.max(0, messages.indexOf(note))).findLast(holdsDeck) || null;
}

/**
 * The press of the button `button` (data-vision-retry: the note's id) in `conversation`. `scheduler`: the page's checks; `serverReply`: the
 * server's (planVision, startVision, followVision); `isReplying()`: whether a reply is being written now.
 */
export async function retryVisionCheck({ button, conversation, getConfig, scheduler, serverReply, supportsToolCalling, modelSupportsVision, isReplying, showNotification, language }) {
  const note = conversation?.messages?.find((message) => message.id === button.dataset.visionRetry);
  if (!note) return;
  const tell = (key) => showNotification(visionText(language, key), 'warning');
  const source = visionNoteSource(conversation, note);
  if (!source) return tell('retryGone');
  const model = scheduler.modelFor(conversation);
  if (!model || model.outputModality === 'image' || !modelSupportsVision(model)) return tell('retryNoModel');
  if (isReplying() || chatsUnderVisionCheck.has(conversation.id)) return tell('retryBusy');
  // The files of the note that are still to be checked (a note written before notes named its files: all of the reply's).
  const named = note.metadata.visionCheck.fileIds;
  const fileIds = eligibleVisionFiles({ conversation, message: source, model, config: { ...getConfig(), visionCheckEnabled: true }, signal: null, modelSupportsVision })
    .map((file) => file.id).filter((id) => !Array.isArray(named) || named.includes(id)).slice(0, 20);
  if (!fileIds.length) return tell('retryGone');
  button.disabled = true;
  const done = () => button.closest('.vision-retry-row')?.remove();
  const host = button.closest('.message-stack');
  if (serverReply.planVision({ conversation }).ok) {
    const advanced = resolveReplyMode({ conversation, config: getConfig(), modelInfo: model, supportsToolCalling }).advanced;
    const started = await serverReply.startVision({
      conversation, source, fileIds, modelInfo: model, uiLanguage: language, config: getConfig(),
      visionCheck: { deckDesign: conversation.deckDesign || 'auto', advanced }
    }).catch(() => ({ ok: false }));
    if (started.ok) {
      done();
      void serverReply.followVision({ runId: started.run.runId, conversation, host });
      return;
    }
  }
  // Not by the server (it cannot draw slides, the chat is not in the cloud, the setting says here): made on this page.
  if (scheduler.retry({ conversation, message: source, fileIds, targetElement: button })) return done();
  button.disabled = false;
  tell('retryBusy');
}
