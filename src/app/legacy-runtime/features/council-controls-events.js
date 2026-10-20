// What the model picker's panel does when it is used (council-controls-lifecycle.js): its buttons and tabs, the checkboxes of members
// and the combining model, the saved groups, the search box, the depth slider and its keys, and Escape. `ui` is the panel's own state
// (its page, the search text, the open extra options, the group being edited), shared with the lifecycle that draws it.

import { GROUP_NAME_LIMIT } from '../../ui/model-picker/model-groups.js';
import { modelPickerText } from '../../ui/model-picker/model-picker-texts.js';

export function bindCouncilControlEvents(container, {
  DEPTH_KEYS, addGroup, applySearch, chooseModel, commitCouncil, commitDepth, councilMaxModels, document, fitPanel,
  getActiveConversation, getConfig, getCouncilTexts, getIsCouncilRunning, groupsOf, isDepthOpen, isPanelOpen, normalizeCouncilConfig,
  notifyLocked, offerSearch, paintDepth, renderCouncilControls, renderInputIndicators, saveAppData, saveGroups, seedCouncilParticipants,
  setPanelOpen, showNotification, ui, updateGroup
}) {
  document.defaultView?.addEventListener?.('resize', () => { if (isPanelOpen(container)) fitPanel(container); });
  container.addEventListener('click', async (event) => {
    const target = event.target.closest?.('button, [data-mp-tab]');
    if (!target || !container.contains(target)) return;
    // Clicks here redraw the panel, which removes the clicked button before the page's
    // "click outside closes popovers" handler looks for it inside the picker.
    event.stopPropagation();
    const conv = getActiveConversation();
    if (!conv) return;

    if (target.id === 'model-picker-btn') {
      event.preventDefault();
      if (target.disabled) return;
      setPanelOpen(container, 'model', !isPanelOpen(container));
      return;
    }
    if (target.id === 'model-depth-btn') {
      event.preventDefault();
      if (target.disabled) return;
      setPanelOpen(container, 'depth', !isDepthOpen(container));
      return;
    }
    if (target.dataset.mpTab) {
      const wantCouncil = target.dataset.mpTab === 'council';
      conv.council = normalizeCouncilConfig(conv.council);
      if (conv.council.enabled === wantCouncil) return;
      if (getIsCouncilRunning()) { notifyLocked(container); return; }
      conv.council.enabled = wantCouncil;
      if (wantCouncil) seedCouncilParticipants(conv);
      ui.view = 'main';
      ui.query = '';
      commitCouncil(conv);
      renderCouncilControls();
      if (wantCouncil && !conv.isWebSearchEnabled) offerSearch(conv);
      return;
    }
    if (target.dataset.mpModel) {
      if (await chooseModel(target.dataset.mpModel)) {
        container.querySelector('#model-picker-popover')?.classList.remove('visible');
        container.querySelector('#model-picker-btn')?.setAttribute('aria-expanded', 'false');
        renderCouncilControls({ open: false });
      }
      return;
    }
    if (target.dataset.mpGroupApply !== undefined) {
      const config = getConfig();
      const group = groupsOf(config).find((item) => item.id === target.dataset.mpGroupApply);
      if (!group || !group.participantModelIds.length) return;
      if (getIsCouncilRunning()) { notifyLocked(container); return; }
      conv.council = normalizeCouncilConfig(conv.council);
      conv.council.participantModelIds = group.participantModelIds.slice(0, councilMaxModels);
      if (group.synthesizerModelId) conv.council.synthesizerModelId = group.synthesizerModelId;
      if (ui.view === 'groups') ui.view = 'main';
      commitCouncil(conv);
      renderCouncilControls({ open: 'model' });
      return;
    }
    if (target.dataset.mpGroupSave !== undefined) {
      const council = normalizeCouncilConfig(conv.council);
      await addGroup(getConfig(), { participantModelIds: council.participantModelIds.slice(), synthesizerModelId: council.synthesizerModelId });
      renderCouncilControls({ open: 'model' });
      return;
    }
    if (target.dataset.mpGroupNew !== undefined) {
      const group = await addGroup(getConfig(), {});
      if (group) {
        ui.pickGroupId = group.id;
        ui.view = 'members';
        ui.query = '';
      }
      renderCouncilControls({ open: 'model' });
      return;
    }
    if (target.dataset.mpGroupEdit || target.dataset.mpGroupEditCombiner) {
      ui.pickGroupId = target.dataset.mpGroupEdit || target.dataset.mpGroupEditCombiner;
      ui.view = target.dataset.mpGroupEdit ? 'members' : 'combiner';
      ui.query = '';
      renderCouncilControls({ open: 'model' });
      return;
    }
    if (target.dataset.mpGroupDelete) {
      const config = getConfig();
      await saveGroups(config, groupsOf(config).filter((group) => group.id !== target.dataset.mpGroupDelete));
      renderCouncilControls({ open: 'model' });
      return;
    }
    if (target.dataset.mpOpen) {
      ui.pickGroupId = null;
      ui.view = target.dataset.mpOpen;
      ui.query = '';
      renderCouncilControls({ open: 'model' });
      return;
    }
    if ('mpBack' in target.dataset) {
      // Back from a group's own list goes to the groups page, otherwise to the council page.
      ui.view = ui.pickGroupId ? 'groups' : 'main';
      ui.pickGroupId = null;
      ui.query = '';
      renderCouncilControls({ open: 'model' });
      return;
    }
    if (target.dataset.mpRemove) {
      if (getIsCouncilRunning()) { notifyLocked(container); return; }
      conv.council.participantModelIds = conv.council.participantModelIds.filter((id) => id !== target.dataset.mpRemove);
      commitCouncil(conv);
      return;
    }
    if (target.dataset.mpMode) {
      if (getIsCouncilRunning()) { notifyLocked(container); return; }
      conv.council.mode = target.dataset.mpMode;
      commitCouncil(conv);
    }
  });

  container.addEventListener('change', async (event) => {
    const input = event.target;
    const conv = getActiveConversation();
    if (!conv || !input?.matches) return;
    conv.council = normalizeCouncilConfig(conv.council);
    const guarded = () => {
      if (!getIsCouncilRunning()) return false;
      notifyLocked(container);
      return true;
    };
    if (input.matches('[data-mp-group-name]')) {
      const config = getConfig();
      const groups = groupsOf(config);
      const index = groups.findIndex((group) => group.id === input.dataset.mpGroupName);
      if (index < 0) return;
      const name = input.value.trim().slice(0, GROUP_NAME_LIMIT)
      || modelPickerText(config.uiLanguage, 'groupDefaultName', { n: index + 1 });
      await updateGroup(config, input.dataset.mpGroupName, { name });
      renderCouncilControls({ open: 'model' });
    } else if (ui.pickGroupId && input.matches('[data-mp-member], [data-mp-combiner]')) {
      const config = getConfig();
      const group = groupsOf(config).find((item) => item.id === ui.pickGroupId);
      if (!group) return;
      if (input.matches('[data-mp-member]')) {
        const ids = new Set(group.participantModelIds);
        if (input.checked) {
          if (ids.size >= councilMaxModels) {
            showNotification(getCouncilTexts().tooMany, 'warning');
            renderCouncilControls({ open: 'model' });
            return;
          }
          ids.add(input.dataset.mpMember);
        } else {
          ids.delete(input.dataset.mpMember);
        }
        await updateGroup(config, group.id, { participantModelIds: [...ids] });
      } else if (input.checked) {
        await updateGroup(config, group.id, { synthesizerModelId: input.dataset.mpCombiner });
        ui.view = 'groups';
        ui.pickGroupId = null;
        ui.query = '';
      }
      renderCouncilControls({ open: 'model' });
    } else if (input.matches('[data-mp-member]')) {
      if (guarded()) return;
      const ids = new Set(conv.council.participantModelIds);
      if (input.checked) {
        if (ids.size >= councilMaxModels) {
          showNotification(getCouncilTexts().tooMany, 'warning');
          renderCouncilControls();
          return;
        }
        ids.add(input.dataset.mpMember);
      } else {
        ids.delete(input.dataset.mpMember);
      }
      conv.council.participantModelIds = [...ids];
      commitCouncil(conv);
    } else if (input.matches('[data-mp-combiner]')) {
      if (guarded() || !input.checked) return;
      conv.council.synthesizerModelId = input.dataset.mpCombiner;
      ui.view = 'main';
      ui.query = '';
      commitCouncil(conv);
      renderCouncilControls();
    } else if (input.matches('[data-mp-raw]')) {
      if (guarded()) return;
      conv.council.showRawResponses = input.checked;
      commitCouncil(conv);
    } else if (input.matches('[data-mp-comparison]')) {
      if (guarded()) return;
      conv.council.showComparisonTable = input.checked;
      commitCouncil(conv);
    } else if (input.matches('[data-mp-search-toggle]')) {
      if (guarded()) return;
      conv.isWebSearchEnabled = input.checked;
      await saveAppData();
      renderCouncilControls();
      renderInputIndicators();
    } else if (input.matches('[data-mp-depth-input]')) {
      // Let go: the thumb settles on the nearest dot and that level is kept.
      await commitDepth(container, input, Math.round(Number(input.value)));
    }
  });

  container.addEventListener('input', (event) => {
    const input = event.target;
    if (input?.matches?.('[data-mp-search]')) {
      ui.query = input.value;
      applySearch(container);
    } else if (input?.matches?.('[data-mp-depth-input]')) {
      // It goes to the nearest dot at once, with a tick where the hardware has one.
      paintDepth(input, Math.round(Number(input.value)), { tick: true });
    }
  });

  container.addEventListener('toggle', (event) => {
    if (event.target?.matches?.('.mp-more')) ui.moreOpen = Boolean(event.target.open);
  }, true);

  container.addEventListener('keydown', (event) => {
    if (event.target?.matches?.('[data-mp-depth-input]') && DEPTH_KEYS[event.key]) {
      event.preventDefault();
      const input = event.target;
      const last = Math.max(1, Number(input.max));
      const current = Math.round(Number(input.value));
      const step = DEPTH_KEYS[event.key];
      commitDepth(container, input, step === 'first' ? 0 : step === 'last' ? last : Math.min(last, Math.max(0, current + step)));
      return;
    }
    if (event.key === 'Escape' && (isPanelOpen(container) || isDepthOpen(container))) {
      if (event.target?.matches?.('[data-mp-search]') && event.target.value) {
        event.target.value = '';
        ui.query = '';
        applySearch(container);
      } else {
        const depth = isDepthOpen(container);
        setPanelOpen(container, depth ? 'depth' : 'model', false);
        container.querySelector(depth ? '#model-depth-btn' : '#model-picker-btn')?.focus();
      }
      event.stopPropagation();
    }
  });
}
