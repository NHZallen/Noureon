// Diagnostics for "where is my reply made, and is the server there?": run `await noureonDiagnose()` in the browser console. It checks the page, the
// account, the server (reachable, signed in, its Python sandbox), the settings and the open chat, then says for each kind of reply whether the
// server would take it and, when not, why; and lists what the page decided for the last replies. Read-only: nothing is started or changed.

import { replyDecisions } from './reply-decision-log.js';

// Why a reply is made on the device, in words (the reasons of server-reply.js LOCAL_REASONS, and the codes the server answers with).
export const REASONS = Object.freeze({
  setting: ['Settings → Privacy: "Where replies run" is set to this device.', 'Change it to "Server".'],
  'no-account': ['Not signed in to a cloud account (a local account has no server).', 'Sign in with the cloud account.'],
  'not-synced': ['This chat is temporary (or not kept in the cloud), so the server has nowhere to write the reply.', 'Use a normal chat.'],
  'packet-search': ['Python together with a web search made as a packet: the model has no search tool of its own to call next to Python.', 'Turn web search off for this reply, use a model that searches by itself (needs a search key in Settings), or use Gemini.'],
  'too-large': ['The request is larger than the server accepts.', 'Attach less, or start a new chat.'],
  'no-key': ['No API key for the model on this device (the server is sent the key with the request).', 'Enter the key in Settings → Models.'],
  'prepare-failed': ['The files of the message could not be prepared for the server.', 'Try again; check the files.'],
  unsupported_mode: ['The server refuses this kind of reply: its Python sandbox is not available.', 'Check /healthz ("sandbox") and the runner container on the VPS (sandbox-host/diagnose.sh).'],
  runs_unavailable: ['Replies on the server are switched off there (no service key or encryption key configured).', 'Set SUPABASE_SERVICE_KEY and KEY_ENCRYPTION_KEY on that server.'],
  protocol_unsupported: ['The page and the server speak different versions: one of them is not updated.', 'Reload the page; check the server was redeployed with the same release.'],
  conversation_not_found: ['The conversation was not in the cloud when the server looked for it (sync had not finished).', 'Wait for the sync, then send again.'],
  unauthorized: ['The server did not accept the sign-in.', 'Sign out and in again; check the server\'s SUPABASE_URL and key.'],
  unreachable: ['The server could not be reached from this page (network, CORS, the content security policy, or the server is down).', 'See the "server" lines above and the console for CORS or "Refused to" messages.'],
  too_many_runs: ['The server is already making the most replies it allows for this account.', 'Wait for the others to finish.'],
  rate_limited: ['Too many requests in a minute.', 'Wait a minute.']
});

export const explainReason = (reason) => {
  const [meaning, fix] = REASONS[reason] || [`Unknown reason "${reason}".`, ''];
  return { reason, meaning, fix };
};

// The kinds of reply the page can ask for, as the arguments of the plan.
export const SCENARIOS = Object.freeze([
  { name: 'plain reply', advanced: false, webSearchEnabled: false, researchByModel: false },
  { name: 'plain reply + web search by the model', advanced: false, webSearchEnabled: true, researchByModel: true },
  { name: 'plain reply + web search as a packet', advanced: false, webSearchEnabled: true, researchByModel: false },
  { name: 'Python (file or data task)', advanced: true, webSearchEnabled: false, researchByModel: false },
  { name: 'Python + web search by the model', advanced: true, webSearchEnabled: true, researchByModel: true },
  { name: 'Python + web search as a packet', advanced: true, webSearchEnabled: true, researchByModel: false }
]);

const timed = async (fn) => {
  const began = Date.now();
  try {
    return { ...(await fn()), ms: Date.now() - began };
  } catch (error) {
    return { ok: false, error: String(error?.message || error).slice(0, 160), ms: Date.now() - began };
  }
};

/**
 * Runs every check and returns the report (nothing is printed here). `deps`: serverReply (plan, request, hasAccount), baseUrl, version, getConfig,
 * getConversation, resolveModel (conversation → model), hasKey (provider → boolean), canResearch (model → boolean), fetchImpl, online.
 */
export async function runDiagnostics(deps) {
  const { serverReply, baseUrl, version = '', getConfig, getConversation, resolveModel, hasKey, canResearch, fetchImpl = (...args) => globalThis.fetch(...args), online = () => globalThis.navigator?.onLine } = deps;
  const config = getConfig() || {};
  const open = getConversation() || null;
  // A new empty chat is flagged `isTemporary` until its first message is sent (then it is kept, like any chat); only `retentionMode: 'ephemeral'`
  // is a temporary chat. The plan is made when the message is sent, so a draft is planned as the chat it is about to become.
  const isDraft = Boolean(open?.isTemporary) && !(open?.messages?.length > 0);
  const conversation = open && isDraft ? { ...open, isTemporary: false } : open;
  const model = conversation ? resolveModel(conversation) : null;
  const report = { at: new Date().toISOString(), problems: [], notes: [] };
  const problem = (text) => report.problems.push(text);

  report.page = { version, origin: globalThis.location?.origin || '', online: online() !== false, language: config.uiLanguage || '' };
  if (!report.page.online) problem('The browser reports it is offline.');

  // The server takes a reply only while the conversation sync is enabled; a sync that failed to start ('retry') leaves the page in local mode, which looks the same as no account.
  const sync = serverReply.syncStatus?.() || null;
  report.account = { signedInToCloud: Boolean(serverReply.hasAccount()) };
  report.sync = sync ? { state: sync.state, enabled: Boolean(sync.enabled), error: sync.error, code: sync.code, details: sync.details === undefined ? undefined : JSON.stringify(sync.details).slice(0, 600), lastErrorAt: sync.lastErrorAt } : null;
  if (!report.account.signedInToCloud) {
    problem(sync?.error
      ? `The cloud sync is not active (${sync.state}${sync.code ? `, ${sync.code}` : ''}: ${sync.error}). Until it recovers every reply is made on this device.`
      : 'Not signed in to a cloud account (or the sync has not started): every reply is made on this device.');
  }

  report.settings = { replyRunLocation: config.replyRunLocation || 'server', searchProvider: config.searchProvider || '', hasSearchKey: Boolean(hasKey('tavily') || hasKey('tinyfish')) };
  if (report.settings.replyRunLocation === 'local') problem('Settings → Privacy: replies are set to run on this device.');

  report.server = { baseUrl };
  const health = await timed(async () => {
    const response = await fetchImpl(`${baseUrl}/healthz`);
    const data = await response.json().catch(() => null);
    return { ok: response.ok && data?.ok === true, status: response.status, data };
  });
  Object.assign(report.server, { reachable: Boolean(health.ok), status: health.status ?? 0, ms: health.ms, error: health.error });
  if (!health.ok) {
    problem(`The server did not answer /healthz (${health.error || `status ${health.status}`}): ${explainReason('unreachable').meaning}`);
  } else {
    const { data } = health;
    Object.assign(report.server, { build: data.build, protocol: data.protocol, runsEnabled: Boolean(data.runs), sandbox: data.sandbox, uptimeSeconds: data.uptimeSeconds });
    if (!data.runs) problem(explainReason('runs_unavailable').meaning);
    if (data.sandbox === 'down') problem('The server\'s Python sandbox is down: Python replies are made on this device.');
    if (data.sandbox === 'off') report.notes.push('The server has no Python sandbox configured.');
    if (data.uptimeSeconds < 120) report.notes.push('The server started less than two minutes ago (a redeploy): replies running on it were cut.');
  }

  if (report.account.signedInToCloud && health.ok) {
    const who = await timed(async () => {
      const result = await serverReply.request('GET', '/v1/whoami', { timeoutMs: 10_000 });
      return { ok: result.ok, status: result.status, code: result.code };
    });
    report.server.signIn = { accepted: Boolean(who.ok), status: who.status, code: who.code || null };
    if (!who.ok) problem(`The server did not accept this sign-in (${who.code || who.status}): ${explainReason(who.code === 'unauthorized' ? 'unauthorized' : 'unreachable').fix}`);
  }

  report.chat = conversation ? {
    draft: isDraft,
    temporary: Boolean(conversation.isTemporary || conversation.retentionMode === 'ephemeral'),
    model: model?.id || conversation.model || '',
    provider: model?.provider || '',
    hasKeyForModel: model ? Boolean(hasKey(model.provider)) : false,
    webSearchOn: Boolean(conversation.isWebSearchEnabled),
    modelSearchesByItself: model ? Boolean(canResearch(model)) : false
  } : null;
  if (!conversation) report.notes.push('No chat is open: the plan below is for a new chat.');
  if (isDraft) report.notes.push('This is a new empty chat: it is kept (and can go to the server) once the first message is sent. The plan below is for that.');
  if (report.chat?.temporary) problem(explainReason('not-synced').meaning);
  if (report.chat && !report.chat.hasKeyForModel) problem(`${explainReason('no-key').meaning} (provider: ${report.chat.provider || 'unknown'})`);
  if (report.chat?.webSearchOn && !report.chat.modelSearchesByItself) report.notes.push('Web search is on but this model does not search by itself (no search key, or the model does not call tools): the server searches first and puts the result in front of the request; with Python that cannot be done on the server.');

  report.plan = SCENARIOS.map((scenario) => {
    const result = serverReply.plan({ conversation, advanced: scenario.advanced, webSearchEnabled: scenario.webSearchEnabled, researchByModel: scenario.researchByModel, provider: model?.provider || '', diagnostic: true });
    return { scenario: scenario.name, runsOn: result.ok ? 'server' : 'this device', ...(result.ok ? { webSearch: result.webSearch } : explainReason(result.reason)) };
  });
  report.decisions = replyDecisions().map((entry) => ({ ...entry, ...(entry.reason ? { meaning: explainReason(entry.reason).meaning } : {}) }));
  return report;
}

const VERDICTS = Object.freeze({ server: '✅', device: '⚠️' });

/** The report as plain text (what is copied for a bug report). */
export function formatReport(report) {
  const lines = [`Noureon diagnostics ${report.at}`, `page: version ${report.page.version}, ${report.page.origin}, ${report.page.online ? 'online' : 'OFFLINE'}`];
  lines.push(`account: ${report.account.signedInToCloud ? 'signed in to the cloud' : 'NOT signed in to the cloud'}`);
  if (report.sync) lines.push(`sync: ${report.sync.state}${report.sync.enabled ? ' (enabled)' : ' (NOT enabled)'}${report.sync.error ? `, error: ${report.sync.error}` : ''}${report.sync.code ? ` [${report.sync.code}]` : ''}${report.sync.details ? `, details: ${report.sync.details}` : ''}`);
  lines.push(`settings: replies run on "${report.settings.replyRunLocation}", search provider ${report.settings.searchProvider || '-'}, search key ${report.settings.hasSearchKey ? 'yes' : 'no'}`);
  const server = report.server;
  lines.push(`server: ${server.baseUrl} — ${server.reachable ? `reachable in ${server.ms} ms, build ${server.build}, protocol ${server.protocol}, replies ${server.runsEnabled ? 'on' : 'OFF'}, sandbox ${server.sandbox}, up ${Math.round(server.uptimeSeconds / 60)} min` : `NOT reachable (${server.error || `status ${server.status}`})`}`);
  if (server.signIn) lines.push(`sign-in at the server: ${server.signIn.accepted ? 'accepted' : `REFUSED (${server.signIn.code || server.signIn.status})`}`);
  if (report.chat) lines.push(`chat: ${report.chat.temporary ? 'TEMPORARY' : report.chat.draft ? 'new (empty)' : 'kept'}, model ${report.chat.model} (${report.chat.provider}), key ${report.chat.hasKeyForModel ? 'yes' : 'NO'}, web search ${report.chat.webSearchOn ? 'on' : 'off'}, model searches itself ${report.chat.modelSearchesByItself ? 'yes' : 'no'}`);
  lines.push('', 'Where each kind of reply would be made:');
  for (const row of report.plan) lines.push(`  ${row.runsOn === 'server' ? VERDICTS.server : VERDICTS.device} ${row.scenario}: ${row.runsOn}${row.meaning ? ` — ${row.meaning} ${row.fix}` : ''}`);
  lines.push('', 'The last decisions of this page (newest last):');
  if (!report.decisions.length) lines.push('  none since the page was loaded');
  for (const entry of report.decisions) lines.push(`  ${entry.at} ${entry.kind}: ${entry.ok ? `server${entry.webSearch ? ` (${entry.webSearch})` : ''}${entry.advanced ? ' + Python' : ''}` : `device — ${entry.reason}${entry.meaning ? `: ${entry.meaning}` : ''}`}`);
  lines.push('', report.problems.length ? 'Problems:' : 'No problem found.');
  for (const text of report.problems) lines.push(`  - ${text}`);
  for (const text of report.notes) lines.push(`  note: ${text}`);
  return lines.join('\n');
}

/** Puts `noureonDiagnose()` on the page: prints the report, copies the text when the browser lets it, and returns the report. */
export function installReplyDiagnostics(deps, { target = globalThis, log = console } = {}) {
  const diagnose = async () => {
    const report = await runDiagnostics(deps);
    const text = formatReport(report);
    log.log(text);
    if (log.table) {
      log.table(report.plan.map((row) => ({ reply: row.scenario, 'runs on': row.runsOn, why: row.meaning || row.webSearch || '' })));
    }
    try {
      await target.navigator?.clipboard?.writeText?.(text);
      log.log('(The report is copied to the clipboard.)');
    } catch {
      // The browser did not allow it: the text above can be selected.
    }
    return report;
  };
  target.noureonDiagnose = diagnose;
  return diagnose;
}
