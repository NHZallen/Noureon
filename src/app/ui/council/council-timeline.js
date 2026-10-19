// The timeline of a council (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.3), after the step lists of Vercel's deployments and
// GitHub Actions: a thin line through the stages (the answers, the discussion, the synthesis), a dot on each (filled once done, in the person's
// accent while it runs, hollow before), real numbers on the right instead of spinners. The members are plain rows under the stage they are in:
// name, what they are doing, and what they did (searches, pages, characters). Drawn live while the council goes on (response-progress-renderers.js)
// and in the saved message, opened from its line "3 members discussed · 1m 20s" (sandbox-run-view.js).

import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';

const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** "32s", "1m 20s": the time of a stage or of the whole council, as a reply's line says it. */
export const formatCouncilTime = (ms) => {
  const seconds = Math.max(1, Math.round((Number(ms) || 0) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const formatNumber = (language, value) => {
  try {
    return new Intl.NumberFormat(language).format(value);
  } catch {
    return String(value);
  }
};

const STAGE_LABELS = { translation: 'councilStageTranslation', firstRound: 'councilStageAnswers', deliberation: 'councilStageDiscussion', synthesis: 'councilStageSynthesis' };
const STATUS_LABELS = { done: 'councilMemberDone', running: 'councilMemberWriting', pending: 'councilMemberWaiting', failed: 'councilMemberFailed', exited: 'councilMemberLeft', skipped: 'councilMemberSkipped' };
const MEMBER_STAGES = new Set(['firstRound', 'deliberation']);

/** The stages drawn: the attachments when they were read for the members, the answers, the discussion of a deliberation, the synthesis. */
export function councilStageKeys({ mode, stages = [] } = {}) {
  return [
    ...((Array.isArray(stages) ? stages : []).some((entry) => entry?.key === 'translation') ? ['translation'] : []),
    'firstRound',
    ...(mode === 'deliberation' ? ['deliberation'] : []),
    'synthesis'
  ];
}

/** What a member did, in a few numbers: "Searches 3 · Pages 2 · 1,240 chars". */
export function councilMemberNumbers(language, { counts = {}, chars = 0 } = {}) {
  const tools = (Number(counts.skill) || 0) + (Number(counts.connector) || 0);
  return [
    counts.search ? sandboxText(language, 'councilSearches', { n: formatNumber(language, counts.search) }) : '',
    counts.page ? sandboxText(language, 'councilPages', { n: formatNumber(language, counts.page) }) : '',
    tools ? sandboxText(language, 'councilTools', { n: formatNumber(language, tools) }) : '',
    chars ? sandboxText(language, 'councilChars', { n: formatNumber(language, chars) }) : ''
  ].filter(Boolean).join(' · ');
}

function memberStatus(language, member, live) {
  if (live && member.status === 'running') {
    if (member.chars) return sandboxText(language, 'councilMemberWriting');
    // Not writing yet: what it is doing (its newest search or page), else that it is waited for.
    const last = Array.isArray(member.steps) ? member.steps.at(-1) : null;
    return last?.label || sandboxText(language, 'councilMemberWaiting');
  }
  return sandboxText(language, STATUS_LABELS[member.status] || STATUS_LABELS.done);
}

function memberRow(language, member, { live, open, exitLabel }) {
  const steps = live && Array.isArray(member.steps) ? member.steps.filter((step) => step?.label) : [];
  const opened = steps.length > 0 && open.has(member.id);
  const inner = `<span class="council-tl-member-name">${escapeText(member.name)}</span><span class="council-tl-member-status">${escapeText(memberStatus(language, member, live))}</span><span class="council-tl-member-meta">${escapeText(councilMemberNumbers(language, member))}</span>`;
  // A member that searched or read can be opened to what it looked at (a button, so the panel keeps it open as it is drawn again).
  const head = steps.length
    ? `<button type="button" class="council-tl-member-head" data-council-member="${escapeText(member.id)}" aria-expanded="${opened}">${inner}</button>`
    : `<div class="council-tl-member-head">${inner}</div>`;
  const exit = live && member.canExit && exitLabel ? `<button type="button" class="council-tl-exit" data-council-exit="${escapeText(member.id)}">${escapeText(exitLabel)}</button>` : '';
  const list = opened ? `<ul class="council-tl-steps">${steps.map((step) => `<li><span class="council-tl-step">${escapeText(step.label)}</span></li>`).join('')}</ul>` : '';
  return `<li class="council-tl-member is-${escapeText(member.status || 'done')}${opened ? ' is-open' : ''}"><div class="council-tl-member-row">${head}${exit}</div>${list}</li>`;
}

/**
 * The timeline as markup. `council`: { mode, stage (the one going on, or 'completed'), elapsedMs (since the start), stages: [{ key, startMs, endMs | ms,
 * done, failed }], members: [{ id, name, status, chars, counts, steps, canExit }] }. `live`: drawn while the council goes on (the members of the stage that
 * runs, what each is doing, the way to let one leave); otherwise the saved view (the members under the answers, as they ended). `open`: the ids of the
 * members opened to their steps.
 */
export function councilTimelineHTML(council = {}, { language = 'zh-TW', live = false, open = new Set(), exitLabel = '' } = {}) {
  const keys = councilStageKeys(council);
  const stage = council.stage === 'completed' || !live ? null : (keys.includes(council.stage) ? council.stage : 'firstRound');
  const currentIndex = stage ? keys.indexOf(stage) : keys.length;
  const timeOf = (key) => (Array.isArray(council.stages) ? council.stages.filter((entry) => entry?.key === key).at(-1) : null);
  const members = Array.isArray(council.members) ? council.members : [];
  const items = keys.map((key, index) => {
    const state = index < currentIndex ? 'done' : index === currentIndex ? 'now' : 'todo';
    const time = timeOf(key);
    const showMembers = MEMBER_STAGES.has(key) && members.length > 0 && (live ? state === 'now' : key === 'firstRound');
    let meta = '';
    if (state === 'done' && time) {
      const ms = Number.isFinite(time.ms) ? time.ms : Number.isFinite(time.endMs) && Number.isFinite(time.startMs) ? time.endMs - time.startMs : null;
      // A stage of answers that is over says how it ended, when its members are not listed under it.
      const ended = MEMBER_STAGES.has(key) && !showMembers && Number.isFinite(time.done)
        ? [sandboxText(language, 'councilDoneCount', { n: time.done }), time.failed ? sandboxText(language, 'councilFailedCount', { n: time.failed }) : '']
        : [];
      meta = [...ended, ms !== null ? formatCouncilTime(ms) : ''].filter(Boolean).join(' · ');
    } else if (state === 'now' && Number.isFinite(time?.startMs) && Number.isFinite(council.elapsedMs)) {
      meta = formatCouncilTime(Math.max(0, council.elapsedMs - time.startMs));
    }
    const list = showMembers ? `<ul class="council-tl-members">${members.map((member) => memberRow(language, member, { live, open, exitLabel })).join('')}</ul>` : '';
    return `<li class="council-tl-stage is-${state}"><div class="council-tl-head"><span class="council-tl-node" aria-hidden="true"></span><span class="council-tl-name">${escapeText(sandboxText(language, STAGE_LABELS[key]))}</span><span class="council-tl-meta">${escapeText(meta)}</span></div>${list}</li>`;
  });
  return `<ol class="council-tl">${items.join('')}</ol>`;
}
