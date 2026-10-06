// "Sync now" in the cloud sync settings, shown once the vault is unlocked: a button that sends what is waiting and fetches what
// the cloud has (cloud-workspace-sync.js syncNow), and a list that says, for the settings, the API keys and the sync password,
// whether each is up to date, waiting or failed. Conversations are not part of it. Sync itself is automatic; this is the way
// to see that it worked.

const KINDS = Object.freeze([
  ['config', 'syncNowKindConfig', '設定'],
  ['sensitive', 'syncNowKindKeys', 'API 金鑰'],
  ['vault', 'syncNowKindPassword', '同步密碼']
]);

const STATE_TEXTS = Object.freeze({
  synced: ['syncNowStateDone', '已是最新'],
  pending: ['syncNowStatePending', '等待上傳'],
  waiting: ['syncNowStateWaiting', '等待中（需先解鎖保險庫）'],
  failed: ['syncNowStateFailed', '失敗']
});

export const syncNowMarkup = () => `
            <div id="sync-now-panel" class="space-y-3 pb-4 border-b border-[var(--border-color)]">
              <div class="flex flex-wrap items-center gap-3">
                <button id="sync-now-btn" type="button" class="us-btn is-primary" data-lang-key="syncNow">立即同步</button>
                <span id="sync-now-summary" class="text-sm text-[var(--text-secondary)]" role="status" aria-live="polite"></span>
              </div>
              <ul id="sync-now-details" class="text-sm space-y-1"></ul>
            </div>`;

const pad = (value) => String(value).padStart(2, '0');
const clock = (stamp) => {
  const date = new Date(stamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function createSyncNowControls({ document, getSync = () => globalThis.__astraCloudWorkspaceSync, getText = (_key, fallback) => fallback }) {
  const text = (key, fallback) => getText(key, fallback) || fallback;
  let running = false;

  const render = (status, { offline = false } = {}) => {
    const summary = document.getElementById('sync-now-summary');
    const details = document.getElementById('sync-now-details');
    if (!summary || !details) return;
    details.replaceChildren(...KINDS.map(([kind, key, fallback]) => {
      const entry = status?.kinds?.[kind] || { state: 'pending' };
      const [stateKey, stateFallback] = STATE_TEXTS[entry.state] || STATE_TEXTS.pending;
      const item = document.createElement('li');
      item.dataset.syncKind = kind;
      item.dataset.syncState = entry.state;
      item.className = entry.state === 'failed' ? 'text-red-600' : entry.state === 'synced' ? 'text-[var(--text-secondary)]' : '';
      const reason = entry.state === 'failed' && entry.reason ? `：${entry.reason}` : '';
      item.textContent = `${text(key, fallback)}：${text(stateKey, stateFallback)}${reason}`;
      return item;
    }));
    summary.textContent = offline
      ? text('syncNowOffline', '目前離線，連線後會自動同步')
      : status?.lastSyncedAt
        ? text('syncNowLast', '上次同步：{time}').replace('{time}', clock(status.lastSyncedAt))
        : text('syncNowNever', '尚未同步');
  };

  /** Shows how things stand now, without syncing. */
  const refresh = () => {
    const sync = getSync();
    if (typeof sync?.getStatus !== 'function') {
      const summary = document.getElementById('sync-now-summary');
      if (summary) summary.textContent = text('syncNowNotReady', '雲端同步還在準備中，請稍後再試');
      document.getElementById('sync-now-details')?.replaceChildren();
      return;
    }
    render(sync.getStatus(), { offline: sync.getStatus().online === false });
  };

  const run = async () => {
    const button = document.getElementById('sync-now-btn');
    const sync = getSync();
    if (running) return;
    if (typeof sync?.syncNow !== 'function') {
      refresh();
      return;
    }
    running = true;
    if (button) {
      button.disabled = true;
      button.textContent = text('syncNowRunning', '同步中…');
    }
    try {
      const result = await sync.syncNow();
      render(result.status, { offline: result.reason === 'offline' });
    } catch (error) {
      render(sync.getStatus?.() || null);
      const summary = document.getElementById('sync-now-summary');
      if (summary) summary.textContent = `${text('syncNowStateFailed', '失敗')}：${error?.message || error}`;
    } finally {
      running = false;
      if (button) {
        button.disabled = false;
        button.textContent = text('syncNow', '立即同步');
      }
    }
  };

  const bind = () => {
    const button = document.getElementById('sync-now-btn');
    if (!button || button.dataset.syncNowBound === 'true') return;
    button.dataset.syncNowBound = 'true';
    button.addEventListener('click', run);
  };

  return { bind, refresh, run };
}
