// "Run again" on a file card whose bytes are not on this device: the reply's
// saved code runs again in the sandbox, with the conversation's files in
// /input, and the files it makes replace the missing ones in the message.
// Loaded when the button is pressed.

import { createFileCardElement } from '../files/file-card-renderer.js';
import { liftSandboxRunBlock } from './sandbox-run-block.js';
import {
  describeSandboxFile,
  encodeBase64,
  forgetSandboxFileBlob,
  getSandboxFileHooks,
  getSandboxFilePart,
  latestRunFiles,
  registerSandboxFileParts
} from './sandbox-files.js';

export async function rerunSandboxFiles({ trigger, language = 'zh-TW', getSandbox }) {
  const messageElement = trigger?.closest?.('[data-message-index]');
  const message = messageElement?.__astraRenderedMessage;
  const text = message?.parts?.find((part) => typeof part.text === 'string')?.text || '';
  const { run } = liftSandboxRunBlock(text);
  if (!run?.steps?.some((step) => step.code)) throw new Error('the code of this reply is not saved');
  registerSandboxFileParts(message.parts);

  const sandbox = getSandbox({ language });
  await sandbox.prepare();
  await sandbox.clear();
  // The missing files have no bytes, so they are not among the inputs.
  const inputs = await getSandboxFileHooks().inputs();
  await sandbox.mount(inputs.map((file) => ({ name: file.name, type: file.type, bytes: file.bytes() })));

  const produced = new Map();
  for (const step of run.steps) {
    if (!step.code) continue;
    const result = await sandbox.run(step.code);
    for (const file of result.files || []) produced.set(file.name, file);
  }

  let restored = 0;
  for (const entry of latestRunFiles(run)) {
    const part = getSandboxFilePart(entry.id);
    const output = produced.get(entry.name);
    if (!part || !output) continue;
    part.data = encodeBase64(output.bytes);
    part.size = output.bytes.byteLength;
    delete part.cloudAssetPending;
    forgetSandboxFileBlob(entry.id);
    restored += 1;
  }
  if (!restored) throw new Error('running the code again made none of the files');
  await getSandboxFileHooks().save();

  // The cards of this reply show the restored files.
  const canRerun = true;
  for (const entry of latestRunFiles(run)) {
    const card = messageElement.querySelector(`.ac-file-card[data-file-id="sandbox-${entry.id}"]`);
    if (card) card.replaceWith(createFileCardElement(card.ownerDocument, describeSandboxFile(entry, { canRerun }), { language }));
  }
  return restored;
}
