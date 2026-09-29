// HTML for the model picker: the button in the composer and the one panel
// behind it. The panel has two ways to answer (a single model, or a council of
// models whose answers one of them combines) and a slider for how deeply the
// model thinks. Plain functions from a prepared state to strings; the events
// live in model-picker-lifecycle.js.

const ICONS = Object.freeze({
  chevron: '<svg class="mp-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"></polyline></svg>',
  council: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-8 0v2"></path><circle cx="12" cy="11" r="4"></circle><path d="M5 8a3 3 0 1 0-2 5.24"></path><path d="M19 8a3 3 0 1 1 2 5.24"></path></svg>',
  search: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>',
  check: '<svg class="mp-check" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  x: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  next: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"></polyline></svg>',
  trash: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
  back: '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18"></polyline></svg>'
});

/** A row's ability line: who makes it and what it can take. */
const metaLine = (model, escape) => [model.providerLabel, ...model.abilities].filter(Boolean).map(escape).join(' · ');

function renderRowBody(model, { t, escape }) {
  const tag = model.free ? `<span class="mp-tag">${escape(t('free'))}</span>` : '';
  const retire = model.retirement ? `<span class="mp-retire">${escape(model.retirement)}</span>` : '';
  return `<span class="mp-row-main"><span class="mp-row-name">${escape(model.name)}${tag}${retire}</span><span class="mp-row-meta">${metaLine(model, escape)}</span></span>`;
}

const rowTitle = (model, escape) => escape([model.name, model.description].filter(Boolean).join('\n'));

const searchText = (model) => `${model.name} ${model.providerLabel} ${model.company} ${model.apiId} ${model.description}`.toLowerCase();

/** The list rows for one way of choosing: pick a model, tick members, or pick the one that combines. */
function renderGroups(groups, kind, ctx) {
  const { t, escape } = ctx;
  return groups.map((group) => `
    <section class="mp-group" data-mp-group>
      <h4 class="mp-group-title">${escape(group.label)}</h4>
      ${group.models.map((model) => {
    const text = escape(searchText(model));
    if (kind === 'single') {
      return `<button type="button" class="mp-row${model.selected ? ' is-selected' : ''}" data-mp-model="${escape(model.id)}" data-mp-search-text="${text}" title="${rowTitle(model, escape)}" ${model.disabled ? 'disabled' : ''}>${renderRowBody(model, ctx)}${model.selected ? ICONS.check : ''}</button>`;
    }
    const attribute = kind === 'members' ? `data-mp-member="${escape(model.id)}"` : `data-mp-combiner="${escape(model.id)}"`;
    return `<label class="mp-row mp-pick${model.selected ? ' is-selected' : ''}${model.disabled ? ' is-disabled' : ''}" data-mp-search-text="${text}" title="${rowTitle(model, escape)}"><input type="${kind === 'members' ? 'checkbox' : 'radio'}" ${kind === 'combiner' ? 'name="mp-combiner"' : ''} ${attribute} ${model.selected ? 'checked' : ''} ${model.disabled ? 'disabled' : ''}><span class="mp-mark" aria-hidden="true">${ICONS.check}</span>${renderRowBody(model, ctx)}</label>`;
  }).join('')}
    </section>`).join('') + `<p class="mp-empty" data-mp-empty hidden>${escape(t('noResults'))}</p>`;
}

function renderSearch(query, ctx) {
  return `<label class="mp-search">${ICONS.search}<input type="search" data-mp-search value="${ctx.escape(query)}" placeholder="${ctx.escape(ctx.t('searchModels'))}" aria-label="${ctx.escape(ctx.t('searchModels'))}" autocomplete="off"></label>`;
}

/**
 * How deeply it thinks: a track with a dot for each of the model's own levels,
 * a white thumb taller than the track that jumps from dot to dot as the finger
 * moves, and the level named above it (the way ChatGPT and Claude do it). The
 * range input on top is invisible; it gives pointer and keyboard handling.
 */
function renderDepth(depth, ctx) {
  if (!depth) return '';
  const { t, escape } = ctx;
  const last = Math.max(1, depth.levels.length - 1);
  const dots = depth.levels.map((level, index) => `<span class="mp-dot${index === depth.defaultIndex ? ' is-default' : ''}"${index === depth.defaultIndex ? ` title="${escape(t('thinkingDefault'))}"` : ''}></span>`).join('');
  return `
    <div class="mp-depth" data-mp-depth data-mp-labels="${escape(JSON.stringify(depth.levels.map((level) => level.label)))}">
      <div class="mp-depth-head"><span class="mp-depth-title">${escape(t('thinkingDepth'))}</span><output class="mp-depth-value" data-mp-depth-value>${escape(depth.levels[depth.index].label)}</output></div>
      <div class="mp-slider-wrap" data-mp-slider data-mp-level="${depth.index}" style="--mp-p:${(depth.index / last).toFixed(4)}">
        <div class="mp-slider-track"><span class="mp-slider-fill"></span><span class="mp-dots">${dots}</span></div>
        <span class="mp-thumb" aria-hidden="true"></span>
        <input type="range" class="mp-slider" data-mp-depth-input min="0" max="${depth.levels.length - 1}" step="1" value="${depth.index}" aria-label="${escape(t('thinkingDepth'))}" aria-valuetext="${escape(t('thinkingDepthOf', { level: depth.levels[depth.index].label }))}" ${depth.disabled ? 'disabled' : ''}>
      </div>
      <div class="mp-depth-ends" aria-hidden="true"><span>${escape(t('thinkingFaster'))}</span><span>${escape(t('thinkingSmarter'))}</span></div>
    </div>`;
}

function renderSingle(state, ctx) {
  return `
    ${renderSearch(state.query, ctx)}
    <div class="mp-scroll" data-mp-scroll>${renderGroups(state.groups, 'single', ctx)}</div>`;
}

function renderCouncil(state, ctx) {
  const { t, escape } = ctx;
  const council = state.council;
  const chips = council.members.map((member) => `
    <span class="mp-chip"><span class="mp-chip-name">${escape(member.name)}</span><button type="button" class="mp-chip-x" data-mp-remove="${escape(member.id)}" aria-label="${escape(t('removeModel', { name: member.name }))}" ${state.locked ? 'disabled' : ''}>${ICONS.x}</button></span>`).join('');
  const add = council.canAdd
    ? `<button type="button" class="mp-chip is-add" data-mp-open="members" ${state.locked ? 'disabled' : ''}>${ICONS.plus}<span>${escape(t('addModel'))}</span></button>`
    : '';
  const mode = (value, label, hint) => `<button type="button" role="radio" class="mp-mode${council.mode === value ? ' is-active' : ''}" aria-checked="${council.mode === value}" data-mp-mode="${value}" ${state.locked ? 'disabled' : ''}><span class="mp-mode-name">${escape(label)}</span><span class="mp-mode-hint">${escape(hint)}</span></button>`;
  const searchRow = council.searchAvailable
    ? `<label class="mp-switch-row"><span>${escape(t('webSearch'))}</span><input type="checkbox" class="mp-switch" data-mp-search-toggle ${council.searchOn ? 'checked' : ''} ${state.locked ? 'disabled' : ''}></label>`
    : '';
  const groupChips = council.groups.map((group) => `<button type="button" class="mp-chip is-group${group.active ? ' is-active' : ''}" data-mp-group-apply="${escape(group.id)}" aria-pressed="${group.active}" title="${escape(group.summary)}" ${state.locked ? 'disabled' : ''}><span class="mp-chip-name">${escape(group.label)}</span></button>`).join('');
  const groupSave = council.canSaveGroup
    ? `<button type="button" class="mp-chip is-add" data-mp-group-save ${state.locked ? 'disabled' : ''}>${ICONS.plus}<span>${escape(t('groupSaveCurrent'))}</span></button>`
    : '';
  return `
    <div class="mp-scroll" data-mp-scroll>
      <div class="mp-section">
        <div class="mp-section-head"><span>${escape(t('groupsTitle'))}</span><span class="mp-head-tools"><span class="mp-count">${council.groups.length}/${council.groupLimit}</span><button type="button" class="mp-text-btn" data-mp-open="groups">${escape(t('groupsEdit'))}</button></span></div>
        <div class="mp-chips">${groupChips}${groupSave}${!groupChips && !groupSave ? `<span class="mp-hint">${escape(t('groupsEmpty'))}</span>` : ''}</div>
      </div>
      <div class="mp-section">
        <div class="mp-section-head"><span>${escape(t('membersTitle'))}</span><span class="mp-count">${council.members.length}/${council.max}</span></div>
        <div class="mp-chips">${chips}${add}</div>
      </div>
      <button type="button" class="mp-line" data-mp-open="combiner" ${state.locked ? 'disabled' : ''}>
        <span class="mp-line-label">${escape(t('combinedBy'))}</span>
        <span class="mp-line-value">${escape(council.combinerName || council.combinerPlaceholder)}${ICONS.next}</span>
      </button>
      <div class="mp-section">
        <div class="mp-section-head"><span>${escape(t('howTheyWork'))}</span></div>
        <div class="mp-modes" role="radiogroup" aria-label="${escape(t('howTheyWork'))}">
          ${mode('consensus', council.labels.consensus, t('consensusHint'))}
          ${mode('deliberation', council.labels.deliberation, t('deliberationHint'))}
        </div>
      </div>
      <details class="mp-more"${council.moreOpen ? ' open' : ''}>
        <summary>${escape(t('moreOptions'))}</summary>
        <label class="mp-switch-row"><span>${escape(council.labels.rawNotes)}</span><input type="checkbox" class="mp-switch" data-mp-raw ${council.showRaw ? 'checked' : ''} ${state.locked ? 'disabled' : ''}></label>
        <label class="mp-switch-row"><span>${escape(council.labels.comparison)}</span><input type="checkbox" class="mp-switch" data-mp-comparison ${council.showComparison ? 'checked' : ''} ${state.locked ? 'disabled' : ''}></label>
        ${searchRow}
      </details>
      <p class="mp-status${council.ok ? '' : ' is-warning'}">${escape(state.locked ? t('locked') : council.message)}</p>
    </div>`;
}

/** The saved groups, each with its name to edit, who is in it, and what can be done with it. */
function renderGroupsView(state, ctx) {
  const { t, escape } = ctx;
  const groups = state.groupsPage.groups.map((group) => `
    <div class="mp-group-card">
      <div class="mp-group-card-head">
        <input type="text" class="mp-group-name" data-mp-group-name="${escape(group.id)}" value="${escape(group.name)}" maxlength="${state.groupsPage.nameLimit}" placeholder="${escape(group.label)}" aria-label="${escape(t('groupName'))}" autocomplete="off">
        <button type="button" class="mp-icon-btn" data-mp-group-delete="${escape(group.id)}" aria-label="${escape(t('groupDelete', { name: group.label }))}" title="${escape(t('groupDelete', { name: group.label }))}">${ICONS.trash}</button>
      </div>
      <p class="mp-group-summary">${escape(group.summary)}</p>
      <div class="mp-group-actions">
        <button type="button" class="mp-small-btn" data-mp-group-edit="${escape(group.id)}">${escape(t('groupEditMembers'))}</button>
        <button type="button" class="mp-small-btn" data-mp-group-edit-combiner="${escape(group.id)}">${escape(t('groupEditCombiner'))}</button>
        <button type="button" class="mp-small-btn is-primary" data-mp-group-apply="${escape(group.id)}" ${state.locked || !group.canApply ? 'disabled' : ''}>${escape(t('groupApply'))}</button>
      </div>
    </div>`).join('');
  return `
    <div class="mp-pick-head">
      <button type="button" class="mp-back" data-mp-back aria-label="${escape(t('back'))}">${ICONS.back}<span>${escape(t('back'))}</span></button>
      <span class="mp-pick-title">${escape(t('groupsPageTitle'))} ${state.groupsPage.groups.length}/${state.groupsPage.limit}</span>
      <button type="button" class="mp-done" data-mp-back>${escape(t('done'))}</button>
    </div>
    <div class="mp-scroll" data-mp-scroll>
      ${groups || `<p class="mp-hint mp-hint-block">${escape(t('groupsEmpty'))}</p>`}
      <button type="button" class="mp-line mp-line-add" data-mp-group-new ${state.groupsPage.canAdd ? '' : 'disabled'}>${ICONS.plus}<span>${escape(state.groupsPage.canAdd ? t('groupNew') : t('groupLimit', { n: state.groupsPage.limit }))}</span></button>
    </div>`;
}

function renderPick(state, ctx) {
  const { t, escape } = ctx;
  const members = state.view === 'members';
  const title = state.pickTitle;
  return `
    <div class="mp-pick-head">
      <button type="button" class="mp-back" data-mp-back aria-label="${escape(t('back'))}">${ICONS.back}<span>${escape(t('back'))}</span></button>
      <span class="mp-pick-title">${escape(title)}</span>
      <button type="button" class="mp-done" data-mp-back>${escape(t('done'))}</button>
    </div>
    ${renderSearch(state.query, ctx)}
    <div class="mp-scroll" data-mp-scroll>${renderGroups(state.pickGroups, members ? 'members' : 'combiner', ctx)}</div>`;
}

/** The button in the composer that names what will answer. */
export function renderPickerTrigger(state, ctx) {
  const { escape } = ctx;
  const label = state.council ? ctx.t('councilCount', { n: state.council.count }) : state.modelName;
  const dot = state.council && !state.council.ok ? '<span class="mp-trigger-dot" aria-hidden="true"></span>' : '';
  return `<button type="button" id="model-picker-btn" class="mp-trigger${state.council ? ' is-council' : ''}" aria-haspopup="dialog" aria-expanded="${state.open ? 'true' : 'false'}" title="${escape(state.title)}" ${state.disabled ? 'disabled' : ''}>${state.council ? ICONS.council : ''}<span class="mp-trigger-name">${escape(label)}</span>${dot}${ICONS.chevron}</button>`;
}

/** How deeply it thinks: its own small button next to the model's, shown only where the model has levels. */
export function renderDepthTrigger(state, ctx) {
  const { t, escape } = ctx;
  const label = state.depth.levels[state.depth.index].label;
  return `<button type="button" id="model-depth-btn" class="mp-trigger mp-depth-trigger" aria-haspopup="dialog" aria-expanded="${state.depthOpen ? 'true' : 'false'}" title="${escape(t('thinkingDepthOf', { level: label }))}" aria-label="${escape(t('thinkingDepthOf', { level: label }))}" ${state.disabled ? 'disabled' : ''}><span class="mp-depth-trigger-value">${escape(label)}</span>${ICONS.chevron}</button>`;
}

/** The small panel behind it: the level named, the slider, and what each end means. */
export function renderDepthPanel(state, ctx) {
  const { t, escape } = ctx;
  return `<div id="model-depth-popover" class="popover mp-panel mp-depth-panel${state.depthOpen ? ' visible' : ''}" role="dialog" aria-label="${escape(t('thinkingDepth'))}">${renderDepth(state.depth, ctx)}</div>`;
}

/** The panel: how to answer (single model or council), then that choice's controls. */
export function renderPickerPanel(state, ctx) {
  const { t, escape } = ctx;
  const pick = state.view !== 'main';
  const tabs = state.showTabs && !pick
    ? `<div class="mp-tabs" role="tablist" aria-label="${escape(t('tabs'))}">
        <button type="button" role="tab" class="mp-tab${state.council ? '' : ' is-active'}" aria-selected="${!state.council}" data-mp-tab="single" ${state.locked ? 'disabled' : ''}>${escape(t('tabSingle'))}</button>
        <button type="button" role="tab" class="mp-tab${state.council ? ' is-active' : ''}" aria-selected="${Boolean(state.council)}" data-mp-tab="council" ${state.locked || state.councilBlocked ? 'disabled' : ''}>${escape(t('tabCouncil'))}</button>
      </div>`
    : '';
  const body = state.view === 'groups'
    ? renderGroupsView(state, ctx)
    : (pick ? renderPick(state, ctx) : (state.council ? renderCouncil(state, ctx) : renderSingle(state, ctx)));
  return `<div id="model-picker-popover" class="popover mp-panel${state.open ? ' visible' : ''}" role="dialog" aria-label="${escape(t('modelPicker'))}">${tabs}<div class="mp-view" data-mp-view="${state.view}">${body}</div></div>`;
}
