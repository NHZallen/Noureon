const COPY = Object.freeze({
  'zh-TW': {
    title: '記憶摘要',
    description: '完整記憶會自動整合對話並保持最新；這裡只顯示給你看的精簡摘要，不是完整聊天紀錄。',
    open: '查看與編輯', close: '收起', updated: '更新於', empty: '目前還沒有可顯示的記憶摘要。開始聊天後會自動建立。',
    input: '新增或更新', save: '加入完整記憶', edit: '編輯', refresh: '更新摘要',
    modelTitle: '記憶模型', modelDescription: '負責記憶擷取、摘要、歷史查詢解析與附件描述。圖片生成模型不能選用。',
    saved: '已更新完整記憶；顯示摘要可在需要時再更新。', modelSaved: '已更新記憶模型。之後的背景工作會使用它。', refreshing: '正在更新顯示摘要。',
    pending: '正在更新', stale: '完整記憶已有更新。按「更新摘要」以更新這份顯示摘要。', failed: '更新失敗', manualTitle: '使用者更新', editPrompt: '修改後會更新完整記憶；顯示摘要需要時再按更新：',
    modelKeyRequired: '需要 API 金鑰', introTitle: '關於記憶摘要', intro: 'Noureon 會自動記住你對話中的脈絡並保持最新。這裡只呈現由完整記憶產生的精簡概述，不是完整記憶清單或聊天紀錄；有新內容時，由你決定何時更新這份概述。', confirm: '知道了', cancel: '取消'
  },
  en: {
    title: 'Memory summary', description: 'Noureon automatically combines your conversation context and keeps it fresh. This is an overview, not a full chat history.',
    open: 'View and edit', close: 'Collapse', updated: 'Updated', empty: 'There is no visible memory summary yet. It will be created automatically after you chat.',
    input: 'Add or update', save: 'Add to complete memory', edit: 'Edit', refresh: 'Update overview',
    modelTitle: 'Memory model', modelDescription: 'Handles memory capture, summaries, ambiguous-history resolution, and attachment descriptions. Image-generation models cannot be selected.',
    saved: 'Complete memory updated. You can refresh the visible overview when needed.', modelSaved: 'Memory model updated. Future background work will use it.', refreshing: 'Updating the visible overview.',
    pending: 'Updating', stale: 'Complete memory has changed. Update this visible overview when you are ready.', failed: 'Update failed', manualTitle: 'User update', editPrompt: 'This updates complete memory. Refresh the visible overview separately when needed:',
    modelKeyRequired: 'API key required', introTitle: 'About memory summary', intro: 'Noureon automatically remembers useful conversation context and keeps complete memory fresh. This page is a concise overview of that memory, not a complete list or chat history; you choose when to refresh this overview.', confirm: 'Got it', cancel: 'Cancel'
  },
  fr: {
    title: 'Résumé de mémoire', description: 'Noureon regroupe automatiquement le contexte de vos conversations et le garde à jour. Ceci est un aperçu, pas l’historique complet.',
    open: 'Voir et modifier', close: 'Réduire', updated: 'Mis à jour', empty: 'Aucun résumé visible pour le moment. Il sera créé automatiquement après vos échanges.',
    input: 'Ajouter ou mettre à jour', save: 'Ajouter à la mémoire complète', edit: 'Modifier', refresh: 'Mettre à jour l’aperçu',
    modelTitle: 'Modèle de mémoire', modelDescription: 'Gère la capture, les résumés, la résolution des recherches ambiguës et les descriptions de pièces jointes. Les modèles de génération d’images ne sont pas disponibles.',
    saved: 'Mémoire complète mise à jour. Vous pourrez actualiser l’aperçu visible si nécessaire.', modelSaved: 'Modèle de mémoire mis à jour. Les prochains travaux en arrière-plan l’utiliseront.', refreshing: 'Mise à jour de l’aperçu visible.',
    pending: 'Mise à jour', stale: 'La mémoire complète a changé. Actualisez cet aperçu visible lorsque vous le souhaitez.', failed: 'Échec de mise à jour', manualTitle: 'Mise à jour utilisateur', editPrompt: 'Cette modification met à jour la mémoire complète. Actualisez l’aperçu visible séparément si nécessaire :',
    modelKeyRequired: 'Clé API requise', introTitle: 'À propos du résumé de mémoire', intro: 'Noureon mémorise automatiquement le contexte utile et garde la mémoire complète à jour. Cette page est un aperçu concis de cette mémoire, pas une liste complète ni l’historique des chats ; vous décidez quand actualiser cet aperçu.', confirm: 'Compris', cancel: 'Annuler'
  },
  ru: {
    title: 'Сводка памяти', description: 'Noureon автоматически объединяет контекст разговоров и поддерживает его в актуальном состоянии. Это обзор, а не полная история чатов.',
    open: 'Открыть и изменить', close: 'Свернуть', updated: 'Обновлено', empty: 'Пока нет видимой сводки памяти. Она будет создана автоматически после общения.',
    input: 'Добавить или обновить', save: 'Добавить в полную память', edit: 'Изменить', refresh: 'Обновить обзор',
    modelTitle: 'Модель памяти', modelDescription: 'Обрабатывает захват памяти, сводки, неоднозначные запросы к истории и описания вложений. Модели генерации изображений выбрать нельзя.',
    saved: 'Полная память обновлена. Видимый обзор можно обновить при необходимости.', modelSaved: 'Модель памяти обновлена. Будущие фоновые задачи будут использовать её.', refreshing: 'Обновление видимого обзора.',
    pending: 'Обновление', stale: 'Полная память изменилась. Обновите этот видимый обзор, когда будете готовы.', failed: 'Ошибка обновления', manualTitle: 'Обновление пользователя', editPrompt: 'Это обновит полную память. При необходимости обновите видимый обзор отдельно:',
    modelKeyRequired: 'Нужен API-ключ', introTitle: 'О сводке памяти', intro: 'Noureon автоматически запоминает полезный контекст и поддерживает полную память в актуальном состоянии. Эта страница — краткий обзор этой памяти, а не полный список или история чатов; вы решаете, когда обновлять обзор.', confirm: 'Понятно', cancel: 'Отмена'
  },
  es: {
    title: 'Resumen de memoria', description: 'Noureon combina automáticamente el contexto de tus conversaciones y lo mantiene actualizado. Es un resumen, no el historial completo.',
    open: 'Ver y editar', close: 'Contraer', updated: 'Actualizado', empty: 'Aún no hay un resumen de memoria visible. Se creará automáticamente después de conversar.',
    input: 'Añadir o actualizar', save: 'Añadir a la memoria completa', edit: 'Editar', refresh: 'Actualizar resumen',
    modelTitle: 'Modelo de memoria', modelDescription: 'Gestiona la captura de memoria, los resúmenes, las consultas ambiguas al historial y las descripciones de adjuntos. Los modelos de generación de imágenes no se pueden elegir.',
    saved: 'Memoria completa actualizada. Puedes actualizar el resumen visible cuando lo necesites.', modelSaved: 'Modelo de memoria actualizado. El trabajo en segundo plano futuro lo utilizará.', refreshing: 'Actualizando el resumen visible.',
    pending: 'Actualizando', stale: 'La memoria completa ha cambiado. Actualiza este resumen visible cuando quieras.', failed: 'Error al actualizar', manualTitle: 'Actualización del usuario', editPrompt: 'Esto actualiza la memoria completa. Actualiza el resumen visible por separado cuando lo necesites:',
    modelKeyRequired: 'Se requiere clave API', introTitle: 'Sobre el resumen de memoria', intro: 'Noureon recuerda automáticamente el contexto útil y mantiene actualizada la memoria completa. Esta página es un resumen conciso de esa memoria, no una lista completa ni el historial de chats; tú decides cuándo actualizarlo.', confirm: 'Entendido', cancel: 'Cancelar'
  }
});

const getCopy = language => COPY[language] || COPY['zh-TW'];
const asArray = value => Array.isArray(value) ? value : [];
const asText = value => String(value || '').trim();

const relativeTime = (value, language) => {
  const time = Date.parse(value || '');
  if (!Number.isFinite(time)) return '';
  const seconds = Math.round((time - Date.now()) / 1000);
  const units = Math.abs(seconds) < 60 ? ['second', seconds]
    : Math.abs(seconds) < 3600 ? ['minute', Math.round(seconds / 60)]
      : Math.abs(seconds) < 86400 ? ['hour', Math.round(seconds / 3600)]
        : ['day', Math.round(seconds / 86400)];
  return new Intl.RelativeTimeFormat(language === 'zh-TW' ? 'zh-TW' : language, { numeric: 'auto' })
    .format(units[1], units[0]);
};

export function createSettingsMemorySummaryControls({
  document,
  models = [],
  getConfig,
  getMemoryState,
  legacyRuntimeContext,
  saveConfig,
  isModelReady = () => true,
  showNotification = () => {},
  showCustomPrompt = async () => null,
  showCustomDialog = async () => true
} = {}) {
  if (!document || typeof getConfig !== 'function' || typeof getMemoryState !== 'function') {
    throw new TypeError('Memory summary settings controls require document, config, and memory state access.');
  }

  const getLanguage = () => getConfig().uiLanguage || 'zh-TW';
  const selectableModels = () => asArray(models).filter(model => (
    model && model.category !== 'image_generation' && model.outputModality !== 'image'
  ));
  let memoryModelControlRefs = null;

  // Keep the lazy runtime contract explicit here. Besides documenting the
  // settings-facing operations, this means a binding remains resolved only at
  // the moment the user opens or acts on this settings area.
  const canResolveMemoryBinding = typeof legacyRuntimeContext?.resolveOptionalBinding === 'function';
  const memoryBindings = {
    getOverview: () => canResolveMemoryBinding ? legacyRuntimeContext.resolveOptionalBinding('memory.getOverview') : null,
    updateSummary: () => canResolveMemoryBinding ? legacyRuntimeContext.resolveOptionalBinding('memory.updateSummary') : null,
    refreshOverview: () => canResolveMemoryBinding ? legacyRuntimeContext.resolveOptionalBinding('memory.refreshOverview') : null,
    getWorkStatus: () => canResolveMemoryBinding ? legacyRuntimeContext.resolveOptionalBinding('memory.getWorkStatus') : null
  };

  const render = () => {
    const language = getLanguage();
    const text = getCopy(language);
    const overview = memoryBindings.getOverview()?.() || getMemoryState()?.memoryOverview || null;
    const editor = document.getElementById('memory-summary-editor');
    const timestamp = document.getElementById('memory-summary-updated-at');
    const list = document.getElementById('memory-summary-sections');
    const state = document.getElementById('memory-summary-state');
    if (!editor || !timestamp || !list || !state) return;

    timestamp.textContent = overview?.updatedAt
      ? `${text.updated} ${relativeTime(overview.updatedAt, language)}`
      : '';
    state.textContent = overview?.status === 'pending' ? text.pending
      : overview?.status === 'failed' ? `${text.failed}${overview.lastError ? `: ${overview.lastError}` : ''}`
        : overview?.needsRefresh ? text.stale
        : '';
    if (typeof state.classList?.toggle === 'function') {
      state.classList.toggle('hidden', !state.textContent);
    }
    const refresh = document.getElementById('memory-overview-refresh-btn');
    if (refresh) {
      refresh.textContent = text.refresh;
      refresh.disabled = overview?.status === 'pending';
      if (typeof refresh.classList?.toggle === 'function') {
        refresh.classList.toggle('hidden', !(overview?.needsRefresh || overview?.status === 'failed'));
      }
    }
    if (typeof list.replaceChildren === 'function') {
      list.replaceChildren();
    } else {
      list.textContent = '';
    }
    if (overview?.overview) {
      const overviewText = document.createElement('p');
      overviewText.className = 'text-sm leading-6 text-[var(--text-secondary)]';
      overviewText.textContent = overview.overview;
      list.appendChild(overviewText);
    }
    if (asArray(overview?.sections).length === 0 && !overview?.overview) {
      const empty = document.createElement('p');
      empty.className = 'text-sm text-[var(--text-secondary)]';
      empty.textContent = text.empty;
      list.appendChild(empty);
    }
    asArray(overview?.sections).forEach(section => {
      const item = document.createElement('article');
      item.className = 'rounded-xl border border-[var(--border-color)] bg-[var(--hover-bg)] p-3 space-y-2';
      const header = document.createElement('div');
      header.className = 'flex items-center justify-between gap-3';
      const title = document.createElement('h4');
      title.className = 'font-medium';
      title.textContent = section.title;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'memory-action-button px-2 py-1 rounded-md text-sm';
      edit.textContent = text.edit;
      edit.addEventListener('click', async () => {
        const content = await showCustomDialog({
          title: text.edit,
          message: text.editPrompt,
          input: { type: 'text', value: section.content },
          buttons: [
            { text: text.cancel, class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md', value: () => null },
            { text: text.confirm, class: 'px-4 py-2 rounded-md btn-primary', value: value => value }
          ]
        });
        if (!asText(content)) return;
        const update = memoryBindings.updateSummary();
        if (typeof update !== 'function') return;
        await update({ sectionId: section.id, key: section.key, title: section.title, content });
        render();
        showNotification(text.saved, 'success');
      });
      header.append(title, edit);
      const content = document.createElement('p');
      content.className = 'text-sm leading-6';
      content.textContent = section.content;
      item.append(header, content);
      list.appendChild(item);
    });
  };

  const ensureMemoryModelControl = () => {
    const target = document.getElementById('model-management-section');
    if (!target) return;
    let control = document.getElementById('memory-model-setting');
    if (!control) {
      control = document.createElement('div');
      control.id = 'memory-model-setting';
      control.className = 'mt-6 pt-5 border-t border-[var(--border-color)]';
      const title = document.createElement('h3');
      title.id = 'memory-model-title';
      title.className = 'text-lg font-semibold mb-2';
      const description = document.createElement('p');
      description.id = 'memory-model-description';
      description.className = 'text-sm text-[var(--text-secondary)] mb-3';
      const select = document.createElement('select');
      select.id = 'memory-model-select';
      select.className = 'w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]';
      select.addEventListener('change', async () => {
        getConfig().memoryModelId = select.value;
        await saveConfig();
        showNotification(getCopy(getLanguage()).modelSaved, 'success');
      });
      control.append(title, description, select);
      target.appendChild(control);
      memoryModelControlRefs = { control, title, description, select };
    }
    const text = getCopy(getLanguage());
    const refs = memoryModelControlRefs || {
      control,
      title: control.querySelector?.('#memory-model-title'),
      description: control.querySelector?.('#memory-model-description'),
      select: control.querySelector?.('#memory-model-select')
    };
    if (!refs.title || !refs.description || !refs.select) return;
    refs.title.textContent = text.modelTitle;
    refs.description.textContent = text.modelDescription;
    const select = refs.select;
    const previous = getConfig().memoryModelId || 'gemini-3.5-flash-lite';
    select.replaceChildren();
    selectableModels().forEach(model => {
      const option = document.createElement('option');
      const ready = isModelReady(model);
      option.value = model.id;
      option.textContent = ready ? model.name : `${model.name} — ${text.modelKeyRequired}`;
      option.selected = model.id === previous;
      select.appendChild(option);
    });
    if (!select.value && select.options.length) select.value = select.options[0].value;
  };

  const ensureControls = () => {
    const section = document.getElementById('memory-section');
    if (!section) return;
    if (!document.getElementById('memory-summary-settings')) {
      section.replaceChildren();
      const root = document.createElement('div');
      root.id = 'memory-summary-settings';
      root.className = 'space-y-4';
      const titleRow = document.createElement('div');
      titleRow.className = 'flex items-start justify-between gap-4';
      const heading = document.createElement('h3');
      heading.id = 'memory-summary-title';
      heading.className = 'text-lg font-semibold';
      const updated = document.createElement('span');
      updated.id = 'memory-summary-updated-at';
      updated.className = 'text-xs text-[var(--text-secondary)] shrink-0';
      titleRow.append(heading, updated);
      const description = document.createElement('p');
      description.id = 'memory-summary-description';
      description.className = 'text-sm leading-6 text-[var(--text-secondary)]';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.id = 'open-memory-summary-btn';
      toggle.className = 'px-4 py-2 rounded-md btn-primary';
      const editor = document.createElement('div');
      editor.id = 'memory-summary-editor';
      editor.className = 'hidden space-y-4 pt-2';
      const status = document.createElement('p');
      status.id = 'memory-summary-state';
      status.className = 'hidden text-sm text-[var(--text-secondary)]';
      const sections = document.createElement('div');
      sections.id = 'memory-summary-sections';
      sections.className = 'space-y-3 max-h-[52vh] overflow-y-auto pr-1';
      const inputRow = document.createElement('div');
      inputRow.className = 'flex gap-2 pt-2 sticky bottom-0 bg-[var(--modal-bg)]';
      const input = document.createElement('input');
      input.id = 'memory-summary-input';
      input.type = 'text';
      input.className = 'min-w-0 flex-1 p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]';
      const add = document.createElement('button');
      add.type = 'button';
      add.id = 'memory-summary-add-btn';
      add.className = 'px-4 py-2 rounded-md btn-primary';
      inputRow.append(input, add);
      const refresh = document.createElement('button');
      refresh.type = 'button';
      refresh.id = 'memory-overview-refresh-btn';
      refresh.className = 'hidden w-full px-4 py-2 rounded-md btn-outline-white text-sm';
      editor.append(status, sections, inputRow, refresh);
      root.append(titleRow, description, toggle, editor);
      section.appendChild(root);

      toggle.addEventListener('click', async () => {
        const config = getConfig();
        if (config.memorySummaryIntroAcknowledged !== true) {
          await showCustomDialog({
            title: getCopy(getLanguage()).introTitle,
            message: getCopy(getLanguage()).intro,
            buttons: [{ text: getCopy(getLanguage()).confirm, class: 'px-4 py-2 rounded-md btn-primary', value: () => true }]
          });
          config.memorySummaryIntroAcknowledged = true;
          await saveConfig();
        }
        editor.classList.toggle('hidden');
        const text = getCopy(getLanguage());
        toggle.textContent = editor.classList.contains('hidden') ? text.open : text.close;
        if (!editor.classList.contains('hidden')) render();
      });
      add.addEventListener('click', async () => {
        if (!asText(input.value)) return;
        const update = memoryBindings.updateSummary();
        if (typeof update !== 'function') return;
        await update({ title: getCopy(getLanguage()).manualTitle, content: input.value });
        input.value = '';
        render();
        showNotification(getCopy(getLanguage()).saved, 'success');
      });
      refresh.addEventListener('click', async () => {
        const refreshOverview = memoryBindings.refreshOverview();
        if (typeof refreshOverview !== 'function') return;
        showNotification(getCopy(getLanguage()).refreshing, 'info');
        render();
        try {
          await refreshOverview();
        } catch {
          // The runtime records the error in the overview state for rendering.
        }
        render();
      });
    }
    const text = getCopy(getLanguage());
    document.getElementById('memory-summary-title').textContent = text.title;
    document.getElementById('memory-summary-description').textContent = text.description;
    document.getElementById('open-memory-summary-btn').textContent = document.getElementById('memory-summary-editor').classList.contains('hidden')
      ? text.open
      : text.close;
    document.getElementById('memory-summary-input').placeholder = text.input;
    document.getElementById('memory-summary-add-btn').textContent = text.save;
    ensureMemoryModelControl();
    render();
  };

  return { ensureControls, render };
}
