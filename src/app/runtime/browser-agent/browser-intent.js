// Whether a message asks, in words, for a real browser ("open a browser for me", "幫我開瀏覽器"): the browser agent is then switched on for the conversation, as if the row of the "＋" menu had been
// pressed (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §2.3). A short list of phrases in the five languages, kept narrow on purpose: a message that only talks about a browser ("it works
// in the browser", "which browser is faster") is not a request. Pure.

const PHRASES = [
  // zh-TW / zh-CN
  /(?:開|打開|開啟|啟動|幫我開|幫我用|使用|用)(?:一個|個|真的|真實的)?\s*(?:瀏覽器|浏览器)/,
  /(?:開|开|打开|启动|使用|用)(?:一个|个|真的)?\s*浏览器/,
  /瀏覽器代理|浏览器代理/,
  // English
  /\b(?:open|launch|start|use|fire up)\s+(?:up\s+)?(?:a|the|your|my)?\s*(?:real\s+|web\s+)?browser\b/i,
  /\bbrowser agent\b/i,
  // French
  /\b(?:ouvre|ouvrir|lance|lancer|utilise|utiliser)\b[^.!?\n]{0,24}\bnavigateur\b/i,
  // Russian
  /(?:открой|открыть|запусти|запустить|используй|использовать)[^.!?\n]{0,24}браузер/i,
  // Spanish
  /\b(?:abre|abrir|usa|usar|lanza|inicia|iniciar)\b[^.!?\n]{0,24}\bnavegador\b/i
];

/** True when the text asks for a browser in words. */
export const asksForBrowser = (text) => {
  const value = String(text ?? '').slice(0, 2000);
  return value.length > 0 && PHRASES.some((pattern) => pattern.test(value));
};
