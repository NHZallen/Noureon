import demoConversations from './demo-conversations/index.js';

if (typeof window !== 'undefined') {
  window.demoConversations = demoConversations;
}
globalThis.demoConversations = demoConversations;

export { demoConversations };
export default demoConversations;
