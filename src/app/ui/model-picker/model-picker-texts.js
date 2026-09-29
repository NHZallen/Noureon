// Words in the model picker (one panel for choosing a model or a council, and
// how deeply it thinks). Kept here, in the five languages, so the panel's
// wording sits beside its markup.

const TEXTS = Object.freeze({
  'zh-TW': {
    tabSingle: '單一模型', tabCouncil: '理事會', tabs: '選擇使用方式',
    searchModels: '搜尋模型', noResults: '找不到符合的模型',
    current: '目前使用', beta: '測試版模型', free: '免費',
    membersTitle: '成員', addModel: '加入模型', removeModel: '移除 {name}',
    combinedBy: '整合者', combinerHint: '把各模型的回答整合成一份',
    howTheyWork: '運作方式',
    consensusHint: '各自回答，再整合',
    deliberationHint: '先各自回答，互相討論後再整合',
    moreOptions: '更多選項', webSearch: '聯網搜尋',
    pickMembers: '選擇成員', pickCombiner: '選擇整合者', back: '返回', done: '完成',
    thinkingDepth: '思考程度', thinkingDepthOf: '思考程度：{level}',
    thinkingFaster: '較快', thinkingSmarter: '更聰明', thinkingDefault: '預設',
    recent: '最近使用', groupsTitle: '分組', groupsEdit: '編輯', groupSaveCurrent: '儲存目前設定', groupDefaultName: '分組 {n}',
    groupsPageTitle: '編輯分組', groupName: '分組名稱', groupEditMembers: '選成員', groupEditCombiner: '選整合者', groupApply: '套用',
    groupDelete: '刪除「{name}」', groupNew: '新增分組', groupLimit: '最多 {n} 個分組', groupNoMembers: '尚未選擇成員', groupNoCombiner: '尚未選擇整合者',
    groupCombinerIs: '整合者：{name}', groupsEmpty: '把常用的成員存成分組，之後一鍵套用。', groupPickMembers: '{name}：選擇成員', groupPickCombiner: '{name}：選擇整合者',
    modelPicker: '選擇模型', councilCount: '理事會 · {n}',
    vision: '視覺', documents: '文件', search: '搜尋', translatedDocuments: '文件轉譯',
    locked: '理事會執行中，暫時不能更改。',
    learningNote: '學習模式開啟時不能使用理事會。'
  },
  en: {
    tabSingle: 'Single model', tabCouncil: 'Council', tabs: 'How to answer',
    searchModels: 'Search models', noResults: 'No models found',
    current: 'In use', beta: 'Beta models', free: 'Free',
    membersTitle: 'Members', addModel: 'Add model', removeModel: 'Remove {name}',
    combinedBy: 'Combined by', combinerHint: 'Merges the models\' answers into one',
    howTheyWork: 'How they work',
    consensusHint: 'Each answers, then one merge',
    deliberationHint: 'Each answers, they discuss, then one merge',
    moreOptions: 'More options', webSearch: 'Web search',
    pickMembers: 'Choose members', pickCombiner: 'Choose the model that combines', back: 'Back', done: 'Done',
    thinkingDepth: 'Thinking', thinkingDepthOf: 'Thinking: {level}',
    thinkingFaster: 'Faster', thinkingSmarter: 'Smarter', thinkingDefault: 'Default',
    recent: 'Recent', groupsTitle: 'Groups', groupsEdit: 'Edit', groupSaveCurrent: 'Save current setup', groupDefaultName: 'Group {n}',
    groupsPageTitle: 'Edit groups', groupName: 'Group name', groupEditMembers: 'Members', groupEditCombiner: 'Combiner', groupApply: 'Apply',
    groupDelete: 'Delete "{name}"', groupNew: 'New group', groupLimit: 'Up to {n} groups', groupNoMembers: 'No members yet', groupNoCombiner: 'No combiner yet',
    groupCombinerIs: 'Combined by {name}', groupsEmpty: 'Save the members you use often as a group, then apply it in one tap.', groupPickMembers: '{name}: choose members', groupPickCombiner: '{name}: choose the combiner',
    modelPicker: 'Choose a model', councilCount: 'Council · {n}',
    vision: 'Vision', documents: 'Files', search: 'Search', translatedDocuments: 'Translated files',
    locked: 'The council is running. Changes wait until it finishes.',
    learningNote: 'The council is not available while Learning mode is on.'
  },
  fr: {
    tabSingle: 'Un modèle', tabCouncil: 'Conseil', tabs: 'Mode de réponse',
    searchModels: 'Rechercher des modèles', noResults: 'Aucun modèle trouvé',
    current: 'Utilisé', beta: 'Modèles bêta', free: 'Gratuit',
    membersTitle: 'Membres', addModel: 'Ajouter un modèle', removeModel: 'Retirer {name}',
    combinedBy: 'Synthèse par', combinerHint: 'Réunit les réponses des modèles en une seule',
    howTheyWork: 'Fonctionnement',
    consensusHint: 'Chacun répond, puis une synthèse',
    deliberationHint: 'Chacun répond, ils en discutent, puis une synthèse',
    moreOptions: 'Plus d’options', webSearch: 'Recherche web',
    pickMembers: 'Choisir les membres', pickCombiner: 'Choisir le modèle de synthèse', back: 'Retour', done: 'Terminé',
    thinkingDepth: 'Réflexion', thinkingDepthOf: 'Réflexion : {level}',
    thinkingFaster: 'Plus rapide', thinkingSmarter: 'Plus poussé', thinkingDefault: 'Par défaut',
    recent: 'Récents', groupsTitle: 'Groupes', groupsEdit: 'Modifier', groupSaveCurrent: 'Enregistrer la sélection', groupDefaultName: 'Groupe {n}',
    groupsPageTitle: 'Modifier les groupes', groupName: 'Nom du groupe', groupEditMembers: 'Membres', groupEditCombiner: 'Synthèse', groupApply: 'Appliquer',
    groupDelete: 'Supprimer « {name} »', groupNew: 'Nouveau groupe', groupLimit: '{n} groupes au maximum', groupNoMembers: 'Aucun membre', groupNoCombiner: 'Aucun modèle de synthèse',
    groupCombinerIs: 'Synthèse par {name}', groupsEmpty: 'Enregistrez vos membres habituels en groupe, puis appliquez-le en un geste.', groupPickMembers: '{name} : choisir les membres', groupPickCombiner: '{name} : choisir le modèle de synthèse',
    modelPicker: 'Choisir un modèle', councilCount: 'Conseil · {n}',
    vision: 'Vision', documents: 'Fichiers', search: 'Recherche', translatedDocuments: 'Fichiers traduits',
    locked: 'Le conseil est en cours. Les changements attendent la fin.',
    learningNote: 'Le conseil n’est pas disponible avec le mode Apprentissage.'
  },
  ru: {
    tabSingle: 'Одна модель', tabCouncil: 'Совет', tabs: 'Как отвечать',
    searchModels: 'Поиск моделей', noResults: 'Модели не найдены',
    current: 'Используется', beta: 'Бета-модели', free: 'Бесплатно',
    membersTitle: 'Участники', addModel: 'Добавить модель', removeModel: 'Убрать {name}',
    combinedBy: 'Сводит ответы', combinerHint: 'Объединяет ответы моделей в один',
    howTheyWork: 'Как работает',
    consensusHint: 'Каждая отвечает, затем общий ответ',
    deliberationHint: 'Каждая отвечает, обсуждают, затем общий ответ',
    moreOptions: 'Ещё параметры', webSearch: 'Поиск в интернете',
    pickMembers: 'Выберите участников', pickCombiner: 'Выберите модель для сведения', back: 'Назад', done: 'Готово',
    thinkingDepth: 'Размышление', thinkingDepthOf: 'Размышление: {level}',
    thinkingFaster: 'Быстрее', thinkingSmarter: 'Умнее', thinkingDefault: 'По умолчанию',
    recent: 'Недавние', groupsTitle: 'Группы', groupsEdit: 'Изменить', groupSaveCurrent: 'Сохранить текущий набор', groupDefaultName: 'Группа {n}',
    groupsPageTitle: 'Изменить группы', groupName: 'Название группы', groupEditMembers: 'Участники', groupEditCombiner: 'Сводит', groupApply: 'Применить',
    groupDelete: 'Удалить «{name}»', groupNew: 'Новая группа', groupLimit: 'Не более {n} групп', groupNoMembers: 'Участников пока нет', groupNoCombiner: 'Модель для сведения не выбрана',
    groupCombinerIs: 'Сводит: {name}', groupsEmpty: 'Сохраните привычных участников как группу и применяйте одним касанием.', groupPickMembers: '{name}: выбор участников', groupPickCombiner: '{name}: выбор модели для сведения',
    modelPicker: 'Выбрать модель', councilCount: 'Совет · {n}',
    vision: 'Зрение', documents: 'Файлы', search: 'Поиск', translatedDocuments: 'Переведённые файлы',
    locked: 'Совет работает. Изменения — после завершения.',
    learningNote: 'Совет недоступен при включённом режиме обучения.'
  },
  es: {
    tabSingle: 'Un modelo', tabCouncil: 'Consejo', tabs: 'Cómo responder',
    searchModels: 'Buscar modelos', noResults: 'No se encontraron modelos',
    current: 'En uso', beta: 'Modelos beta', free: 'Gratis',
    membersTitle: 'Miembros', addModel: 'Añadir modelo', removeModel: 'Quitar {name}',
    combinedBy: 'Síntesis por', combinerHint: 'Reúne las respuestas de los modelos en una',
    howTheyWork: 'Cómo funcionan',
    consensusHint: 'Cada uno responde y luego una síntesis',
    deliberationHint: 'Cada uno responde, debaten y luego una síntesis',
    moreOptions: 'Más opciones', webSearch: 'Búsqueda web',
    pickMembers: 'Elegir miembros', pickCombiner: 'Elegir el modelo de síntesis', back: 'Atrás', done: 'Listo',
    thinkingDepth: 'Razonamiento', thinkingDepthOf: 'Razonamiento: {level}',
    thinkingFaster: 'Más rápido', thinkingSmarter: 'Más inteligente', thinkingDefault: 'Predeterminado',
    recent: 'Recientes', groupsTitle: 'Grupos', groupsEdit: 'Editar', groupSaveCurrent: 'Guardar la selección', groupDefaultName: 'Grupo {n}',
    groupsPageTitle: 'Editar grupos', groupName: 'Nombre del grupo', groupEditMembers: 'Miembros', groupEditCombiner: 'Síntesis', groupApply: 'Aplicar',
    groupDelete: 'Eliminar «{name}»', groupNew: 'Nuevo grupo', groupLimit: 'Hasta {n} grupos', groupNoMembers: 'Aún no hay miembros', groupNoCombiner: 'Aún no hay modelo de síntesis',
    groupCombinerIs: 'Síntesis por {name}', groupsEmpty: 'Guarda los miembros que usas a menudo como grupo y aplícalo con un toque.', groupPickMembers: '{name}: elegir miembros', groupPickCombiner: '{name}: elegir el modelo de síntesis',
    modelPicker: 'Elegir un modelo', councilCount: 'Consejo · {n}',
    vision: 'Visión', documents: 'Archivos', search: 'Búsqueda', translatedDocuments: 'Archivos traducidos',
    locked: 'El consejo está en marcha. Los cambios esperan a que termine.',
    learningNote: 'El consejo no está disponible con el modo Aprendizaje.'
  }
});

export const MODEL_PICKER_LANGUAGES = Object.freeze(Object.keys(TEXTS));
export const MODEL_PICKER_TEXT_KEYS = Object.freeze(Object.keys(TEXTS['zh-TW']));

export function modelPickerText(language, key, values = {}) {
  const table = TEXTS[language] || TEXTS.en;
  const template = table[key] ?? TEXTS.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])));
}
