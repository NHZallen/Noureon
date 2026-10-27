// The words of the OpenRouter usage ring (what is left of the spending limit of the key) in the app's five languages. {name} placeholders are filled by
// openrouterText. The words "stale" and "refresh" are those of the OpenCode ring (opencode-quota/quota-texts.js).

export const OPENROUTER_TEXTS = Object.freeze({
  'zh-TW': {
    title: 'OpenRouter 金鑰額度',
    left: '剩 {percent}%（上限 {limit}，剩 {remaining}）',
    daily: '每天重設',
    weekly: '每週重設',
    monthly: '每月重設',
    spent: '已花費：今天 {daily}、本週 {weekly}、本月 {monthly}',
    limitName: '額度',
    limitSub: '{remaining} / {limit}',
    spentName: '已花費',
    spentValue: '本月 {monthly}',
    spentSub: '今天 {daily} · 本週 {weekly}'
  },
  en: {
    title: 'OpenRouter key limit',
    left: '{percent}% left ({remaining} of {limit})',
    daily: 'resets daily',
    weekly: 'resets weekly',
    monthly: 'resets monthly',
    spent: 'Spent: today {daily}, this week {weekly}, this month {monthly}',
    limitName: 'Limit',
    limitSub: '{remaining} of {limit}',
    spentName: 'Spent',
    spentValue: 'month {monthly}',
    spentSub: 'today {daily} · week {weekly}'
  },
  fr: {
    title: 'Limite de la clé OpenRouter',
    left: '{percent} % restant ({remaining} sur {limit})',
    daily: 'se réinitialise chaque jour',
    weekly: 'se réinitialise chaque semaine',
    monthly: 'se réinitialise chaque mois',
    spent: 'Dépensé : aujourd’hui {daily}, cette semaine {weekly}, ce mois-ci {monthly}',
    limitName: 'Limite',
    limitSub: '{remaining} sur {limit}',
    spentName: 'Dépensé',
    spentValue: 'mois {monthly}',
    spentSub: 'aujourd’hui {daily} · semaine {weekly}'
  },
  ru: {
    title: 'Лимит ключа OpenRouter',
    left: 'осталось {percent}% ({remaining} из {limit})',
    daily: 'сбрасывается каждый день',
    weekly: 'сбрасывается каждую неделю',
    monthly: 'сбрасывается каждый месяц',
    spent: 'Потрачено: сегодня {daily}, за неделю {weekly}, за месяц {monthly}',
    limitName: 'Лимит',
    limitSub: '{remaining} из {limit}',
    spentName: 'Потрачено',
    spentValue: 'месяц {monthly}',
    spentSub: 'сегодня {daily} · неделя {weekly}'
  },
  es: {
    title: 'Límite de la clave de OpenRouter',
    left: 'queda {percent} % ({remaining} de {limit})',
    daily: 'se restablece cada día',
    weekly: 'se restablece cada semana',
    monthly: 'se restablece cada mes',
    spent: 'Gastado: hoy {daily}, esta semana {weekly}, este mes {monthly}',
    limitName: 'Límite',
    limitSub: '{remaining} de {limit}',
    spentName: 'Gastado',
    spentValue: 'mes {monthly}',
    spentSub: 'hoy {daily} · semana {weekly}'
  }
});

/** One text in a language (English when the language lacks it), with {name} placeholders filled. */
export function openrouterText(language, key, values = {}) {
  const table = OPENROUTER_TEXTS[language] || OPENROUTER_TEXTS.en;
  const template = table[key] ?? OPENROUTER_TEXTS.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])));
}
