// A reply that may load skills by itself (docs/superpowers/specs/2026-10-09-skills-design.md, §4): the model is shown the list of the person's skills and is given
// one tool, load_skill; when it calls it the skill's text is handed back and it goes on, up to the limit of skills for a reply. This is the loop for a
// plain reply (no web research and no Python), which has no loop of its own; the other two kinds of reply carry the same tool in their own loops.
// Every word the model writes as text is the answer and streams as it comes.

import { LOAD_SKILL_TOOL, availableSkillsInstruction } from '../../../data/skill-tool.js';
import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';

/**
 * `loader` is createSkillLoader(...) (skill-tool.js). `onEvent({ type: 'skill', name, label })` is told when a skill is being loaded (the label says so in
 * `language`). Resolves { text, calls }.
 */
export async function runSkillsReply({ streamApiCall, requestParts, onChunk = () => {}, signal, requestOptions = {}, loader, language = 'zh-TW', onEvent = () => {} }) {
  const toolTurns = [];
  let text = '';
  const guidance = availableSkillsInstruction(loader.list);

  for (;;) {
    const canCall = loader.left > 0;
    let response = null;
    let roundStarted = false;
    // The words of a round are the answer, so they show as they come; the words after a round of calls start a new paragraph.
    const emit = (chunk) => {
      if (!chunk) return;
      const lead = !roundStarted && text && !text.endsWith('\n') ? '\n\n' : '';
      roundStarted = true;
      text += lead + chunk;
      onChunk(lead + chunk);
    };
    try {
      await streamApiCall(requestParts, emit, signal, false, {
        ...requestOptions,
        tools: canCall ? [LOAD_SKILL_TOOL] : [],
        toolTurns,
        additionalSystemInstruction: [requestOptions.additionalSystemInstruction, guidance].filter(Boolean).join('\n\n'),
        onResponseComplete: (value) => { response = value; }
      });
    } catch (error) {
      // A stop keeps what was written; anything else is the caller's to handle.
      if (!signal?.aborted) throw error;
    }
    const calls = (response?.toolCalls || []).filter((call) => loader.handles(call.name));
    if (signal?.aborted || !canCall || calls.length === 0) break;

    const results = [];
    for (const call of calls) {
      const wanted = typeof call.args?.name === 'string' ? call.args.name.trim() : '';
      if (wanted) onEvent({ type: 'skill', name: wanted, label: sandboxText(language, 'skillLoading', { name: wanted }) });
      const content = await loader.run(call);
      results.push({ id: call.id, geminiId: call.geminiId, name: call.name, content });
      if (signal?.aborted) break;
    }
    toolTurns.push({ assistant: response, results });
    if (signal?.aborted) break;
  }
  return { text, calls: loader.used };
}
