// Words for voice input in the composer, in the five languages.

const TEXTS = Object.freeze({
  'zh-TW': { listening: '正在聽取語音', cancel: '取消語音輸入', confirm: '完成並轉成文字', finishing: '轉成文字中', tip: '語音輸入' },
  en: { listening: 'Listening', cancel: 'Cancel voice input', confirm: 'Finish and insert the text', finishing: 'Turning it into text', tip: 'Voice input' },
  fr: { listening: 'Écoute en cours', cancel: 'Annuler la saisie vocale', confirm: 'Terminer et insérer le texte', finishing: 'Transcription en cours', tip: 'Saisie vocale' },
  ru: { listening: 'Идёт запись голоса', cancel: 'Отменить голосовой ввод', confirm: 'Готово, вставить текст', finishing: 'Расшифровка', tip: 'Голосовой ввод' },
  es: { listening: 'Escuchando', cancel: 'Cancelar entrada de voz', confirm: 'Terminar e insertar el texto', finishing: 'Transcribiendo', tip: 'Entrada de voz' }
});

export const DICTATION_SHORTCUT = 'Ctrl+Shift+D';
export const DICTATION_LANGUAGES = Object.freeze(Object.keys(TEXTS));
export const DICTATION_TEXT_KEYS = Object.freeze(Object.keys(TEXTS['zh-TW']));

export const dictationText = (language, key) => (TEXTS[language] || TEXTS.en)[key] ?? TEXTS.en[key] ?? key;

/** The tooltip on the microphone: what it does and the key that starts it. */
export const dictationTip = (language) => `${dictationText(language, 'tip')}  ${DICTATION_SHORTCUT}`;
