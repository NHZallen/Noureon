# Reply suggestion (建議回覆) — 2026-10-28

After a reply ends, the message box shows one short grey sentence the person might answer ("好，採用 A 方案"). A thin grey arrow at its right (or Tab) turns it into normal text that can be edited or sent; typing, Esc or sending drops it. Decided with Allen on 2026-10-28: on by default, one sentence, no "another one" button, never stored.

## How it works
- **Trigger**: `emitReplyEnded()` (`runtime/features/reply-events.js`) is called from `runSubmitFinalCleanupLifecycle`, which every kind of reply reaches. `startReplySuggestion` (`ui/reply-suggestion/start-suggestion.js`) listens.
- **Model**: the memory model (`config.memoryModelId`) through `runMemoryModel` with its own request purpose `background-suggestion` and `maxTokens: 120`. No memory model, no suggestion.
- **Content sent**: the last 1500 characters of the reply, the first 400 of the question before it, and up to three earlier messages of the person (200 characters each, to match how they write). Nothing else; the answer is never saved.
- **What it guesses** (changed the same day, at Allen's request): always the next message of this person, not only after a question. After a question or options, the answer they would give; after plain information, the natural next step for this topic and this person. Never a generic filler; NONE only when the next words cannot be guessed at all.
- **Skipped**: temporary chats, image conversations, council on, replies under 8 characters, error replies, a reply that followed a steer message, and when the model answers NONE / nothing / more than 80 characters or fails or takes more than 12 s.
- **Dropped**: when the person types, presses Esc, sends, changes conversation, or another message arrives (generation counter + abort).
- **Taking it**: Tab, the arrow button, or Right arrow in the empty box (as Claude Code). Typing, Esc, sending drop it.
- **Back-off** (looked at how Claude Code and Qwen Code do it, 2026-10-28): after 5 suggestions in a row that were not taken, only every third reply gets one until the person takes one. The counters live in memory only.
- **Self-check in the prompt**: the model asks itself whether the person would think "that is just what I was about to type" (Qwen Code's idea).
- **Setting**: Settings → Chat, switch `#reply-suggestion-toggle-switch`, config `replySuggestionEnabled` (true unless `false`).
- **Page start**: `ui/page-extras.js` starts avatar, provider quota and reply suggestion with one registration line in `shell.js`.

## Notes
- The settings modal never saved `replyInputMode` (missing from the `Object.assign` list in `settings-modal-lifecycle.js`); fixed together with the new key.
- Privacy texts in five languages and `PRIVACY.md` mention it.
- Not yet tried with real models or on a phone; to check on staging.
