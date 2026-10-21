export function getMessageTypeIcon(message) {
  if (!message.parts || message.parts.length === 0) {
    return '';
  }
  const hasImage = message.parts.some(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));
  const hasFile = message.parts.some(p => p.inlineData && !p.inlineData.mimeType.startsWith('image/'));

  if (hasImage) return '📷 ';
  if (hasFile) return '📎 ';
  return '';
}
