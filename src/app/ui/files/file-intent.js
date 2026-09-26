import { hasFileBlocks } from './file-block-protocol.js';

// Cheap, eager intent check. The (much longer) authoring guidance is only
// imported and injected when this returns true, mirroring chart guidance.
const FORMAT_PATTERN = /(?:^|[^a-z0-9])(?:pdf|docx?|xlsx?|pptx?|csv|tsv|txt|json|ya?ml|xml|html?|markdown|ics|vcf|srt|vtt|sql|excel|powerpoint|ms\s*word|google\s*(?:docs|sheets|slides))(?:$|[^a-z0-9])|\.[a-z0-9]{1,5}\s*(?:檔|格式|file)|\bword\s*(?:檔|文件|格式|document|file|doc)|(?:成|用|轉|做)\s*word/i;
const INTENT_PATTERNS = [
  /下載|匯出|導出|存成|存檔|另存|輸出成|輸出為|轉成.{0,6}(?:檔|格式)|做成.{0,8}(?:檔|文件|簡報|表格|報表)|製作.{0,6}(?:檔|文件|簡報)|檔案|附件|簡報|投影片|試算表|報表檔|可下載|给我.{0,6}(?:文件|文档)|文档|下载|导出/,
  /\b(?:download(?:able)?|export(?:ed)?|save\s+(?:it\s+|this\s+)?as|as\s+an?\s+(?:file|attachment)|files?|spreadsheets?|slides?|slide\s*deck|presentation|attachment)\b/i,
  /télécharg|exporter|fichier|tableur|diaporama|présentation/i,
  /descarg|exportar|archivo|hoja\s+de\s+cálculo|diapositivas|presentación/i,
  /скача|экспорт|файл|таблиц[ауы]|презентац|слайд/i
];

export function mayNeedFileGuidance(text = '') {
  const source = String(text || '');
  if (!source.trim()) return false;
  return FORMAT_PATTERN.test(source) || INTENT_PATTERNS.some((pattern) => pattern.test(source));
}

const getMessageText = (message) => (message?.parts || [])
  .filter((part) => typeof part?.text === 'string')
  .map((part) => part.text)
  .join('\n');

/**
 * Follow-up edits ("make the title bigger") rarely repeat the word "file", so
 * guidance also applies while the latest model reply contains a file block.
 */
export function conversationHasRecentFile(history = []) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role !== 'model' && message?.role !== 'assistant') continue;
    return hasFileBlocks(getMessageText(message));
  }
  return false;
}

export function shouldInjectFileGuidance({ currentText = '', history = [] } = {}) {
  return mayNeedFileGuidance(currentText) || conversationHasRecentFile(history);
}
