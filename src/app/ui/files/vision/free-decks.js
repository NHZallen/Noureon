// Decks Python drew itself (Advanced mode), saved with the message. Kept apart from vision-eligibility.js (which reads design specs) so the
// chat's own code can ask for them without carrying the design system.
export const freeDecks = message => (message?.parts || [])
  .filter(part => part.sandboxFile?.id && part.sandboxFile.data && /\.pptx$/i.test(part.sandboxFile.name || ''))
  .map(part => ({ id: part.sandboxFile.id, name: part.sandboxFile.name, free: true }));
