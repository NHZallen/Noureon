// The words of the usage rings (OpenCode Go: what is left of the 5 hour, weekly and monthly limits) in the app's five languages. {name}
// placeholders are filled by quotaText.

export const QUOTA_TEXTS = Object.freeze({
  'zh-TW': {
    title: 'OpenCode Go 用量',
    rolling: '5 小時',
    weekly: '本週',
    monthly: '本月',
    left: '剩 {percent}%',
    resets: '{when}重設',
    stale: '可能不是最新的數字',
    refresh: '點一下重新整理'
  },
  en: {
    title: 'OpenCode Go usage',
    rolling: '5 hours',
    weekly: 'This week',
    monthly: 'This month',
    left: '{percent}% left',
    resets: 'resets {when}',
    stale: 'these numbers may be out of date',
    refresh: 'Tap to refresh'
  },
  fr: {
    title: 'Utilisation d’OpenCode Go',
    rolling: '5 heures',
    weekly: 'Cette semaine',
    monthly: 'Ce mois-ci',
    left: '{percent} % restant',
    resets: 'se réinitialise {when}',
    stale: 'ces chiffres ne sont peut-être pas à jour',
    refresh: 'Touchez pour actualiser'
  },
  ru: {
    title: 'Использование OpenCode Go',
    rolling: '5 часов',
    weekly: 'Неделя',
    monthly: 'Месяц',
    left: 'осталось {percent}%',
    resets: 'сброс {when}',
    stale: 'цифры могут быть устаревшими',
    refresh: 'Нажмите, чтобы обновить'
  },
  es: {
    title: 'Uso de OpenCode Go',
    rolling: '5 horas',
    weekly: 'Esta semana',
    monthly: 'Este mes',
    left: 'queda {percent} %',
    resets: 'se restablece {when}',
    stale: 'estas cifras pueden no estar al día',
    refresh: 'Toca para actualizar'
  }
});

/** One text in a language (English when the language lacks it), with {name} placeholders filled. */
export function quotaText(language, key, values = {}) {
  const table = QUOTA_TEXTS[language] || QUOTA_TEXTS.en;
  const template = table[key] ?? QUOTA_TEXTS.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])));
}
