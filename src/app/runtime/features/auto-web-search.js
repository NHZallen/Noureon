const RECENCY_PATTERNS = [
  /\b(latest|current|recent|today|tomorrow|this week|this month|live)\b/i,
  /(最新|目前|現在|今日|今天|明天|近期|本週|本月|即時|剛剛)/u,
  /\b(aujourd'hui|actuel|derni[eè]res? nouvelles|m[eé]t[eé]o|prix)\b/i,
  /(сегодня|сейчас|последн|погода|цена)/i,
  /\b(hoy|actual|últim[oa]s?|noticias|tiempo|precio)\b/i
];

const VOLATILE_TOPIC_PATTERNS = [
  /\b(weather|forecast|temperature|news|headline|stock|share price|exchange rate|currency|crypto|score|fixture|schedule|timetable|flight|availability)\b/i,
  /(天氣|氣溫|新聞|頭條|股價|股市|匯率|貨幣|加密貨幣|比賽|賽程|比分|時刻表|班機|航班|票價|供應|庫存)/u,
  /\b(m[eé]t[eé]o|actualit[eé]s|bourse|taux de change|horaire|vol)\b/i,
  /(погода|новост|акци|курс валют|расписани|рейс)/i,
  /\b(tiempo|noticias|bolsa|tipo de cambio|horario|vuelo)\b/i
];

/**
 * Returns true only for explicit requests that require current external facts.
 * Ambiguous questions deliberately return false so automatic search never adds a
 * model request, cost, or data transfer.
 */
export function shouldAutoEnableWebSearch(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return RECENCY_PATTERNS.some(pattern => pattern.test(text))
    || VOLATILE_TOPIC_PATTERNS.some(pattern => pattern.test(text));
}
