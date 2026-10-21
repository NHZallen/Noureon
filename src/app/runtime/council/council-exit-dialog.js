// The question put to the person before a model leaves the council they are watching (loaded when the question is first asked).

const TEXTS = {
  'zh-TW': { title: '讓這個模型退出？', message: '「{name}」會退出這場會議，它已經給的回答也不會算，這個動作無法復原。', cancel: '取消', leave: '退出' },
  en: { title: 'Let this model leave?', message: '"{name}" will leave this council and its answers will not count. This cannot be undone.', cancel: 'Cancel', leave: 'Leave' },
  fr: { title: 'Faire quitter ce modèle ?', message: '« {name} » quittera ce conseil et ses réponses ne seront pas prises en compte. Cette action est irréversible.', cancel: 'Annuler', leave: 'Quitter' },
  ru: { title: 'Убрать эту модель?', message: '«{name}» покинет этот совет, и её ответы не будут учитываться. Это нельзя отменить.', cancel: 'Отмена', leave: 'Выйти' },
  es: { title: '¿Quitar este modelo?', message: '«{name}» saldrá de este consejo y sus respuestas no se tendrán en cuenta. Esta acción no se puede deshacer.', cancel: 'Cancelar', leave: 'Salir' }
};

export const councilExitTexts = (language) => TEXTS[language] || TEXTS['zh-TW'];

/** Asks with the page's dialog; resolves true when the person says the model may leave. */
export function confirmCouncilExit({ showCustomDialog, language, modelName }) {
  const texts = councilExitTexts(language);
  return showCustomDialog({
    title: texts.title,
    message: texts.message.replace('{name}', modelName),
    buttons: [
      { text: texts.cancel, class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => false },
      { text: texts.leave, class: 'px-4 py-2 rounded-md btn-primary', value: () => true }
    ]
  });
}
