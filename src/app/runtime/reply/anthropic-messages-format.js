// The Anthropic Messages form of API (OpenCode Go speaks it for Claude Haiku, MiniMax and Qwen): the conversation as content blocks, the tools
// (`tools` with `input_schema`, `tool_use` blocks, `tool_result` answers), and the collector of its stream. The same neutral description of tools
// and tool rounds as tool-call-formats.js (tool, turn, call).
//
// Shared by the page and the server: no window, no document, no browser storage.

import { opencodeModelReadsPdf } from '../shell/opencode-models.js';
import { roundImages } from '../../../data/tool-result.js';

const parseArguments = (text) => {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

/**
 * The conversation as `messages`: roles `user` and `assistant` only (the system instruction goes in `system`), the first one a user's, two of the
 * same role joined into one (some services that speak this form want them to alternate). Pictures go as base64 blocks; a file of another kind is
 * named in a line of text, as the other forms do for a model that cannot read it.
 */
export function buildAnthropicMessages(messages, { modelInfo, modelSupportsVision }) {
  const out = [];
  for (const message of messages) {
    const role = message.role === 'model' || message.role === 'assistant' ? 'assistant' : 'user';
    const content = [];
    for (const part of message.parts || []) {
      if (part.text) {
        content.push({ type: 'text', text: part.text });
      } else if (part.inlineData) {
        const mimeType = part.inlineData.mimeType || '';
        if (mimeType.startsWith('image/') && role === 'user' && modelSupportsVision(modelInfo)) {
          content.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: part.inlineData.data } });
        } else if (mimeType === 'application/pdf' && role === 'user' && opencodeModelReadsPdf(modelInfo)) {
          content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: part.inlineData.data } });
        } else {
          content.push({ type: 'text', text: `[Attachment omitted for ${modelInfo?.name || 'this model'}: ${part.inlineData.name || mimeType || 'file'}]` });
        }
      }
    }
    if (!content.length) continue;
    const previous = out.at(-1);
    if (previous && previous.role === role) previous.content.push(...content);
    else out.push({ role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

/** The tools, and the rounds of tool calls so far, in this form: a call is a `tool_use` block, its answer a `tool_result` block in the next user message. */
import { steerNote } from './steer-queue.js';

export function applyAnthropicTools(payload, { tools = [], toolTurns = [] } = {}) {
  if (tools.length) {
    payload.tools = tools.map(({ name, description, parameters }) => ({ name, description, input_schema: parameters }));
    payload.tool_choice = { type: 'auto' };
  }
  for (const turn of toolTurns) {
    const given = (turn.assistant?.contentBlocks || []).filter((block) => block && !(block.type === 'text' && !block.text));
    const blocks = given.length
      ? given
      : [
        ...(turn.assistant?.text ? [{ type: 'text', text: turn.assistant.text }] : []),
        ...(turn.assistant?.toolCalls || []).map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.args || {} }))
      ];
    payload.messages.push({ role: 'assistant', content: blocks });
    payload.messages.push({
      role: 'user',
      content: [
        ...(turn.results || []).map((result) => ({ type: 'tool_result', tool_use_id: result.id, content: result.content })),
        // The pictures a tool shows the model go after the answers, in the same message.
        ...roundImages(turn.results).flatMap((image) => [
          ...(image.label ? [{ type: 'text', text: image.label }] : []),
          { type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.data } }
        ]),
        // What the person added while the reply was being made.
        ...(turn.steer?.length ? [{ type: 'text', text: steerNote(turn.steer) }] : [])
      ]
    });
  }
  return payload;
}

// Collects one streamed response of this form (server-sent events, each a JSON object with a `type`): the text, the thinking and the arguments of
// a tool call arrive in pieces, block by block. The blocks are kept as they came (the thinking with its signature) to be sent back with the answers
// of the tools. An error event is left in `failure` for the caller, as the Responses collector does.
export function createAnthropicCollector({ onReasoning = null, onToolArguments = null } = {}) {
  const blocks = [];
  let text = '';
  let finishReason = '';
  let failure = '';
  return {
    add(event) {
      switch (event?.type) {
        case 'content_block_start': {
          const start = event.content_block || {};
          blocks[event.index] = { ...start, ...(start.type === 'tool_use' ? { json: '' } : {}), ...(start.type === 'text' ? { text: start.text || '' } : {}), ...(start.type === 'thinking' ? { thinking: start.thinking || '', signature: start.signature || '' } : {}) };
          if (start.type === 'text' && start.text) {
            text += start.text;
            return start.text;
          }
          return '';
        }
        case 'content_block_delta': {
          const block = blocks[event.index];
          const delta = event.delta || {};
          if (!block) return '';
          if (delta.type === 'text_delta' && typeof delta.text === 'string') {
            block.text = (block.text || '') + delta.text;
            text += delta.text;
            return delta.text;
          }
          if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
            block.thinking = (block.thinking || '') + delta.thinking;
            if (delta.thinking) onReasoning?.(delta.thinking);
          } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
            block.signature = (block.signature || '') + delta.signature;
          } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
            block.json = (block.json || '') + delta.partial_json;
            onToolArguments?.({ name: block.name || '', arguments: block.json });
          }
          return '';
        }
        case 'message_delta':
          if (event.delta?.stop_reason) finishReason = event.delta.stop_reason;
          return '';
        case 'error':
          failure = event.error?.message || event.message || 'The response stream reported an error.';
          return '';
        default:
          return '';
      }
    },
    get failure() { return failure; },
    result() {
      const kept = blocks.filter(Boolean).map((block) => {
        if (block.type === 'tool_use') {
          const args = parseArguments(block.json);
          return { type: 'tool_use', id: block.id, name: block.name, input: args || {} };
        }
        if (block.type === 'thinking') return { type: 'thinking', thinking: block.thinking || '', signature: block.signature || '' };
        return block;
      });
      return {
        text,
        parts: [],
        reasoningDetails: [],
        contentBlocks: kept,
        finishReason,
        toolCalls: blocks.filter((block) => block?.type === 'tool_use').map((block, index) => {
          const args = parseArguments(block.json);
          return { id: block.id || `toolu_${index}`, name: block.name, arguments: block.json || '{}', args };
        })
      };
    }
  };
}
