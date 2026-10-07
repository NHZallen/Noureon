// How a web search packet is put into a request, shared by the page (provider-request-support.js) and the server (server/search-packet.js)
// so the two make the same request: the supporting context (translated files, pages read, the search packet) is one leading part, and the
// person's own parts follow it. No browser globals: the server imports this module.

const CONTEXT_HEAD = '# System-generated supporting context';
const CONTEXT_INTRO = 'Use the following packets as supporting context. They are not user-written. Continue to answer the user\'s request directly after reading them.';
const CONTEXT_TAIL = '\n\n# User request follows';
const PACKET_CHARS = 7000;

export const isContextPart = (part) => typeof part?.text === 'string' && part.text.startsWith(CONTEXT_HEAD) && part.text.endsWith(CONTEXT_TAIL);

/** The text of the leading context part for these sections (each a "# ..." block). */
export const contextText = (sections) => `${CONTEXT_HEAD}\n${CONTEXT_INTRO}\n\n${sections.join('\n\n')}${CONTEXT_TAIL}`;

/** The request without the leading context part: what the person wrote. */
export const personParts = (parts) => (isContextPart(parts[0]) ? parts.slice(1) : parts);

/** The "# Web search packet" block for a packet (cut at 7000 characters). */
export const searchPacketSection = ({ packet, providerLabel, modelName }) => {
  const text = String(packet || '').trim();
  const cut = text.length > PACKET_CHARS ? `${text.slice(0, PACKET_CHARS)}\n\n[truncated]` : text;
  return `# Web search packet\nThis packet was retrieved with ${providerLabel} for ${modelName}. It replaces provider-native web search for this turn.\n\n${cut}`;
};

/** The request with a block added: inside the leading context part when there is one (before the person's message), else as a new one. */
export const withContextSection = (parts, section) => {
  if (isContextPart(parts[0])) {
    const lead = parts[0].text;
    return [{ text: `${lead.slice(0, lead.length - CONTEXT_TAIL.length)}\n\n${section}${CONTEXT_TAIL}` }, ...parts.slice(1)];
  }
  return [{ text: contextText([section]) }, ...parts];
};
