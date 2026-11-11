// The few facts about a conversation that the lists need and that would otherwise be found by reading its messages. They are made when the stub is
// written (workspace-store-v2.js `stubFlags`) and kept in the stub as `__flags`.

import { messageIsCouncilTurn } from '../../ui/council/council-record.js';
import { chatPreview } from '../projects/chat-preview.js';

export function conversationStubFlags(conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const flags = {};
  if (messages.some(message => (message?.role === 'model' && Boolean(message?.council)) || messageIsCouncilTurn(message))) flags.council = true;
  if (messages.some(message => message?.role === 'user' && (Array.isArray(message.parts) ? message.parts : []).some(part => typeof part?.inlineData?.mimeType === 'string' && part.inlineData.mimeType.startsWith('video/')))) flags.video = true;
  const preview = chatPreview(messages);
  if (preview) flags.preview = preview;
  return flags;
}
