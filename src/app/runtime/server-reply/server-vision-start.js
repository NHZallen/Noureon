// A visual check asked for again (the 重試 button of the note of one that failed or was stopped, runtime/features/vision-retry.js), handed to
// the server. Loaded on the first press: most pages never press it. `begin` and `withCloudFiles` are server-reply.js's.

/**
 * The files `fileIds` of the reply `source`, with the conversation as it stood when that reply was asked for (Python is given it when it redoes a
 * deck). Resolves like `begin`; { ok: false, reason: 'unsupported_mode' } when the server cannot draw slides (the check is then made here).
 */
export async function startVisionRun({ begin, withCloudFiles }, { conversation, source, fileIds, modelInfo, visionCheck, uiLanguage, config = {} }) {
  const messages = conversation.messages || [];
  const asked = messages.slice(0, Math.max(0, messages.indexOf(source))).findLastIndex((message) => message.role === 'user');
  const [kept] = await withCloudFiles([{ role: 'model', parts: (source.parts || []).filter((part) => part?.sandboxFile?.data) }]);
  return begin('/v1/runs', {
    conversation: { ...conversation, messages: messages.slice(0, asked + 1) },
    modelInfo,
    requestParts: asked >= 0 ? messages[asked].parts : [{ text: '' }],
    visionCheck,
    vision: { source: { messageId: source.id, text: source.parts?.[0]?.text || '', parts: kept.parts.map(({ sandboxFile: file }) => ({ sandboxFile: { id: file.id, name: file.name, data: file.data } })), fileIds } },
    assistantMessageId: globalThis.crypto.randomUUID(),
    sequence: 0,
    uiLanguage,
    config
  });
}
