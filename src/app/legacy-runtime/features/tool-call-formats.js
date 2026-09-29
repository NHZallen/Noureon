// Tool calling in each provider's own format, for Advanced mode's Python
// tool. The app describes tools and earlier tool rounds neutrally:
//
//   tool:  { name, description, parameters }            (JSON Schema)
//   turn:  { assistant: { text, toolCalls, parts, reasoningDetails },
//            results: [{ id, name, content }] }
//   call:  { id, name, arguments (JSON text), args (object or null) }
//
// Gemini wants the model's own parts back exactly as sent (they carry the
// thought signatures Gemini 3 checks); OpenAI-compatible APIs (OpenRouter,
// NVIDIA) want the assistant message with its tool_calls, then one `tool`
// message per result, and OpenRouter the reasoning details as well.

const parseArguments = (text) => {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
};

export function applyGeminiTools(payload, { tools = [], toolTurns = [] } = {}) {
  if (tools.length) {
    payload.tools = [...(payload.tools || []), {
      functionDeclarations: tools.map(({ name, description, parameters }) => ({ name, description, parameters }))
    }];
    payload.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  for (const turn of toolTurns) {
    const parts = turn.assistant?.parts?.length
      ? turn.assistant.parts
      : (turn.assistant?.toolCalls || []).map((call) => ({ functionCall: { name: call.name, args: call.args || {}, ...(call.id ? { id: call.id } : {}) } }));
    payload.contents.push({ role: 'model', parts });
    payload.contents.push({
      role: 'user',
      parts: (turn.results || []).map((result) => ({
        functionResponse: {
          name: result.name,
          ...(result.geminiId ? { id: result.geminiId } : {}),
          response: { result: result.content }
        }
      }))
    });
  }
  return payload;
}

export function applyOpenAiTools(payload, { tools = [], toolTurns = [] } = {}) {
  if (tools.length) {
    payload.tools = tools.map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters } }));
    payload.tool_choice = 'auto';
  }
  for (const turn of toolTurns) {
    const assistant = {
      role: 'assistant',
      content: turn.assistant?.text || '',
      tool_calls: (turn.assistant?.toolCalls || []).map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments || '{}' }
      }))
    };
    if (turn.assistant?.reasoningDetails?.length) assistant.reasoning_details = turn.assistant.reasoningDetails;
    payload.messages.push(assistant);
    for (const result of turn.results || []) {
      payload.messages.push({ role: 'tool', tool_call_id: result.id, content: result.content });
    }
  }
  return payload;
}

/**
 * The string value of `key` in JSON that is still arriving (a tool call's
 * arguments so far): what has been written of it, escapes decoded.
 */
export function partialJsonString(raw = '', key = 'code') {
  const start = new RegExp(`"${key}"\\s*:\\s*"`).exec(raw);
  if (!start) return '';
  const escapes = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
  let out = '';
  for (let index = start.index + start[0].length; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"') break;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = raw[index + 1];
    if (next === undefined) break;
    if (next === 'u') {
      const hex = raw.slice(index + 2, index + 6);
      if (hex.length < 4) break;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      index += 5;
    } else {
      out += escapes[next] ?? next;
      index += 1;
    }
  }
  return out;
}

// Collects one Gemini streamed response: its visible text, every part (to
// send back unchanged) and its function calls. `onReasoning(text)` hears the
// model's thought summaries and `onToolArguments({ name, arguments })` its
// function calls, as they arrive.
export function createGeminiCollector({ onReasoning = null, onToolArguments = null } = {}) {
  const parts = [];
  const toolCalls = [];
  let text = '';
  return {
    // Returns the visible text of one streamed chunk.
    add(chunk) {
      let visible = '';
      for (const part of chunk?.candidates?.[0]?.content?.parts || []) {
        parts.push(part);
        if (part.functionCall) {
          const args = part.functionCall.args && typeof part.functionCall.args === 'object' ? part.functionCall.args : {};
          onToolArguments?.({ name: String(part.functionCall.name || ''), arguments: JSON.stringify(args) });
          toolCalls.push({
            id: part.functionCall.id || `gemini-call-${toolCalls.length + 1}`,
            geminiId: part.functionCall.id || '',
            name: String(part.functionCall.name || ''),
            arguments: JSON.stringify(args),
            args
          });
        } else if (typeof part.text === 'string' && part.thought) {
          if (part.text) onReasoning?.(part.text);
        } else if (typeof part.text === 'string') {
          visible += part.text;
        }
      }
      text += visible;
      return visible;
    },
    result: () => ({ text, parts, toolCalls, reasoningDetails: [] })
  };
}

// Collects one OpenAI-compatible streamed response. Tool call arguments
// arrive in pieces keyed by `index`.
export function createOpenAiCollector({ onReasoning = null, onToolArguments = null } = {}) {
  const calls = new Map();
  const reasoningDetails = [];
  let text = '';
  let finishReason = '';
  return {
    add(chunk) {
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta || {};
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      for (const piece of delta.tool_calls || []) {
        const index = Number.isInteger(piece.index) ? piece.index : calls.size;
        const call = calls.get(index) || { id: '', name: '', arguments: '' };
        if (piece.id) call.id = piece.id;
        if (piece.function?.name) call.name += piece.function.name;
        if (typeof piece.function?.arguments === 'string') call.arguments += piece.function.arguments;
        calls.set(index, call);
        onToolArguments?.({ name: call.name, arguments: call.arguments });
      }
      if (Array.isArray(delta.reasoning_details)) reasoningDetails.push(...delta.reasoning_details);
      // The thinking, whichever way the provider names it (OpenRouter, DeepSeek, NVIDIA).
      let thought = typeof delta.reasoning === 'string' ? delta.reasoning : typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
      if (!thought && Array.isArray(delta.reasoning_details)) {
        thought = delta.reasoning_details.map((detail) => (typeof detail?.text === 'string' ? detail.text : typeof detail?.summary === 'string' ? detail.summary : '')).join('');
      }
      if (thought) onReasoning?.(thought);
      const visible = typeof delta.content === 'string' ? delta.content : '';
      text += visible;
      return visible;
    },
    result: () => ({
      text,
      parts: [],
      reasoningDetails,
      finishReason,
      toolCalls: [...calls.entries()].sort(([a], [b]) => a - b).map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        arguments: call.arguments || '{}',
        args: parseArguments(call.arguments)
      }))
    })
  };
}
