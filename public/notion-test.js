// The test entry of Notion's own login (server/notion/oauth.js): it reads the signed-in person's token from the app's storage (the same site), asks the server for the address of
// Notion's page that asks for access, and goes there. Everything shown is put in as text. It never sees the access token of Notion: only the server has it.
(function () {
  'use strict';
  var API = 'https://api.noureon.com';
  var el = function (id) { return document.getElementById(id); };
  var message = el('message');
  var stateLine = el('state');
  var detail = el('detail');
  var connect = el('connect');
  var whoami = el('whoami');
  var disconnect = el('disconnect');

  var accessToken = function () {
    try {
      var names = Object.keys(window.localStorage);
      for (var i = 0; i < names.length; i += 1) {
        if (/^sb-.*-auth-token$/.test(names[i])) {
          var parsed = JSON.parse(window.localStorage.getItem(names[i]));
          if (parsed && typeof parsed.access_token === 'string') return parsed.access_token;
        }
      }
    } catch (error) { /* no storage, or not signed in */ }
    return '';
  };
  var call = function (method, path) {
    var token = accessToken();
    if (!token) return Promise.resolve({ ok: false, status: 0, data: null, signedOut: true });
    return window.fetch(API + path, { method: method, headers: { Authorization: 'Bearer ' + token } }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) { return { ok: response.ok, status: response.status, data: data }; });
    }).catch(function () { return { ok: false, status: 0, data: null }; });
  };
  var say = function (text, bad) { message.textContent = (bad && text ? '× ' : (text ? '✓ ' : '')) + text; };
  var show = function (value) { detail.hidden = !value; detail.textContent = value || ''; };

  var ERRORS = {
    denied: '你在 Notion 的授權頁取消了授權。',
    expired: '授權逾時（超過 10 分鐘），請再試一次。',
    bad_state: '這個授權連結已失效，請從這裡重新開始。',
    failed: '授權失敗：伺服器沒有換到 Token。請檢查 NOTION_CLIENT_ID、NOTION_CLIENT_SECRET 與回呼網址。',
    busy: '現在連線的人太多，請稍後再試。'
  };

  var refresh = function () {
    return call('GET', '/v1/notion/status').then(function (result) {
      connect.disabled = false;
      connect.textContent = '開始授權';
      if (result.signedOut) { stateLine.textContent = '還沒有登入：請先到 noureon.com 登入，再回到這個頁面。'; connect.disabled = true; whoami.hidden = disconnect.hidden = true; return; }
      if (result.status === 401) { stateLine.textContent = '登入已過期：請先回到 noureon.com 重新整理（會自動更新登入），再回來。'; connect.disabled = true; whoami.hidden = disconnect.hidden = true; return; }
      if (result.status === 503) { stateLine.textContent = '伺服器還沒有設定 Notion（缺 NOTION_CLIENT_ID 或 NOTION_CLIENT_SECRET）。'; connect.disabled = true; whoami.hidden = disconnect.hidden = true; return; }
      if (!result.ok) { stateLine.textContent = '現在讀不到狀態，請稍後再試。'; return; }
      var data = result.data || {};
      if (data.connected) {
        stateLine.textContent = '已連接：' + (data.workspaceName || '（工作空間名稱未知）');
        connect.textContent = '重新授權';
        whoami.hidden = disconnect.hidden = false;
      } else {
        stateLine.textContent = data.needsLogin ? '連接已失效，需要重新授權。' : '尚未連接。';
        whoami.hidden = disconnect.hidden = true;
      }
    });
  };

  connect.addEventListener('click', function () {
    connect.disabled = true;
    connect.textContent = '正在前往 Notion……';
    say('');
    call('POST', '/v1/notion/connect').then(function (result) {
      if (result.ok && result.data && typeof result.data.url === 'string' && /^https:\/\/api\.notion\.com\//.test(result.data.url)) {
        window.location.assign(result.data.url);
        return;
      }
      connect.disabled = false;
      connect.textContent = '開始授權';
      say(result.status === 429 ? '操作太頻繁，請稍後再試。' : '無法開始授權，請稍後再試。', true);
    });
  });
  whoami.addEventListener('click', function () {
    whoami.disabled = true;
    say('');
    call('GET', '/v1/notion/whoami').then(function (result) {
      whoami.disabled = false;
      var data = result.data || {};
      if (result.ok && data.ok) { say('Token 可用。', false); show('機器人：' + (data.botName || '（無名稱）') + '\n工作空間：' + (data.workspaceName || '（未知）')); }
      else { say(data.reason === 'unauthorized' ? 'Notion 不再接受這個 Token，請重新授權。' : 'Token 驗證失敗。', true); show(''); refresh(); }
    });
  });
  disconnect.addEventListener('click', function () {
    disconnect.disabled = true;
    call('POST', '/v1/notion/disconnect').then(function (result) {
      disconnect.disabled = false;
      show('');
      say(result.ok ? (result.data && result.data.revoked ? '已解除連接，Token 也已在 Notion 撤銷。' : '已解除連接（Notion 沒有確認撤銷，也可以到 Notion 的「我的連接」自行移除）。') : '解除失敗，請稍後再試。', !result.ok);
      refresh();
    });
  });
  // Coming back with the browser's Back button shows the page as it was left (a button that cannot be pressed): put it back.
  window.addEventListener('pageshow', function (event) { if (event.persisted) refresh(); });

  // Back from Notion: /notion-test?notion=connected, or ?notion_error=<kind>. The address is cleaned.
  var params = new URLSearchParams(window.location.search);
  if (params.get('notion') === 'connected') say('授權完成。', false);
  else if (params.get('notion_error')) say(ERRORS[params.get('notion_error')] || ERRORS.failed, true);
  if (params.has('notion') || params.has('notion_error')) { try { window.history.replaceState(null, '', '/notion-test'); } catch (error) { /* stays */ } }
  refresh();
}());
