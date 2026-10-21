import assert from 'node:assert/strict';
import test from 'node:test';

import { councilMemberNumbers, councilStageKeys, councilTimelineHTML, formatCouncilTime } from '../src/app/ui/council/council-timeline.js';
import { withCouncilRecord } from '../src/app/ui/council/council-record.js';
import { liftSandboxRunBlock, normalizeCouncilRecord } from '../src/app/ui/sandbox/sandbox-run-block.js';
import { sandboxText } from '../src/app/runtime/sandbox/sandbox-texts.js';

const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];
const KEYS = ['councilMemberSearching', 'councilMemberReading', 'councilMemberUsing', 'councilDiscussed', 'councilStageTranslation', 'councilStageAnswers', 'councilStageDiscussion', 'councilStageSynthesis', 'councilMemberDone', 'councilMemberWriting', 'councilMemberWaiting', 'councilMemberFailed', 'councilMemberLeft', 'councilMemberSkipped', 'councilSearches', 'councilPages', 'councilTools', 'councilChars', 'councilDoneCount', 'councilFailedCount'];

test('every word of the timeline is there in the five languages', () => {
  for (const language of LANGUAGES) {
    for (const key of KEYS) {
      const text = sandboxText(language, key, { n: 3 });
      assert.ok(text && text !== key, `${language}: ${key}`);
    }
  }
  assert.equal(sandboxText('zh-TW', 'councilDiscussed', { n: 3 }), '3 位成員討論');
});

test('the stages: the attachments only when they were read, the discussion only in a deliberation, then the synthesis', () => {
  assert.deepEqual(councilStageKeys({ mode: 'consensus' }), ['firstRound', 'synthesis']);
  assert.deepEqual(councilStageKeys({ mode: 'deliberation', stages: [{ key: 'translation' }] }), ['translation', 'firstRound', 'deliberation', 'synthesis']);
  assert.equal(formatCouncilTime(32_000), '32s');
  assert.equal(formatCouncilTime(80_000), '1m 20s');
  assert.equal(councilMemberNumbers('en', { counts: { search: 3, page: 2, skill: 1 }, chars: 1240 }), 'Searches 3 · Pages 2 · Tools 1 · 1,240 chars');
  assert.equal(councilMemberNumbers('zh-TW', { counts: { search: 1 } }), '搜尋 1 次');
});

test('live: the stage that runs has the accent dot and its members (what each is doing, a link to let one leave); the stages before say how they ended', () => {
  const council = {
    mode: 'deliberation',
    stage: 'deliberation',
    elapsedMs: 90_000,
    stages: [{ key: 'firstRound', startMs: 0, endMs: 58_000, done: 2, failed: 1 }, { key: 'deliberation', startMs: 58_000 }],
    members: [
      { id: 'a', name: 'Opus <5>', status: 'running', chars: 412, counts: { search: 2 }, steps: [{ kind: 'search', label: 'Searching: plans' }], canExit: true },
      { id: 'b', name: 'GPT', status: 'running', steps: [{ kind: 'page', label: 'Reading page: vercel.com' }] },
      { id: 'c', name: 'Gemini', status: 'pending' },
      { id: 'd', name: 'Kimi', status: 'failed' }
    ]
  };
  const html = councilTimelineHTML(council, { language: 'en', live: true, exitLabel: 'Leave' });
  assert.match(html, /<li class="council-tl-stage is-done">[^]*?Answering separately<\/span><span class="council-tl-meta">2 done · 1 no answer · 58s<\/span>/);
  assert.match(html, /<li class="council-tl-stage is-now">[^]*?Discussion<\/span><span class="council-tl-meta">32s<\/span>/);
  assert.match(html, /<li class="council-tl-stage is-todo">[^]*?Final answer<\/span><span class="council-tl-meta"><\/span>/);
  assert.match(html, /Opus &lt;5&gt;/, 'names are escaped');
  assert.match(html, /<span class="council-tl-member-status">Writing<\/span><span class="council-tl-member-meta">Searches 2 · 412 chars<\/span>/);
  assert.match(html, /<span class="council-tl-member-status">Reading pages<\/span>/, 'a member that is not writing yet says in a word what it does (the pages are under its name, opened)');
  assert.match(html, /<span class="council-tl-member-status">Waiting<\/span>/);
  assert.match(html, /council-tl-member is-failed[^]*?No answer/);
  assert.equal((html.match(/data-council-exit=/g) || []).length, 1);
  assert.doesNotMatch(html, /council-tl-steps/, 'closed until opened');
  const opened = councilTimelineHTML(council, { language: 'en', live: true, open: new Set(['a']) });
  assert.match(opened, /data-council-member="a" aria-expanded="true"/);
  assert.match(opened, /<ul class="council-tl-steps"><li><span class="council-tl-step">Searching: plans<\/span><\/li><\/ul>/);
  assert.match(opened, /data-council-member="b" aria-expanded="false"/);
  assert.doesNotMatch(opened, /data-council-member="c"/, 'a member with nothing to show is not a button');
});

test('saved: every stage done with its time, the members under the answers as they ended', () => {
  const html = councilTimelineHTML({ mode: 'consensus', stages: [{ key: 'firstRound', ms: 58_000, done: 2, failed: 1 }, { key: 'synthesis', ms: 8_000 }], members: [{ name: 'Opus', status: 'done', chars: 1240, counts: { search: 3 } }, { name: 'Gemini', status: 'failed' }] }, { language: 'zh-TW' });
  assert.equal((html.match(/is-done/g) || []).length, 3, 'two stages and one member done');
  assert.match(html, /各自作答<\/span><span class="council-tl-meta">58s<\/span><\/div><ul class="council-tl-members">/);
  assert.match(html, /整合答案<\/span><span class="council-tl-meta">8s<\/span>/);
  assert.match(html, /<span class="council-tl-member-status">完成<\/span><span class="council-tl-member-meta">搜尋 3 次 · 1,240 字<\/span>/);
  assert.match(html, /沒有回應/);
  assert.doesNotMatch(html, /data-council-exit|data-council-member/);
});

test('the record of a council goes into the record at the head of the message (made when there is none), and is kept within bounds', () => {
  const council = { mode: 'deliberation', members: [{ name: 'Opus', status: 'done', chars: 10, counts: { search: 2, page: 0, junk: 4 } }, { name: '', status: 'done' }, { name: 'X', status: 'weird' }], stages: [{ key: 'firstRound', ms: 5, done: 1, failed: 0 }, { key: 'nonsense', ms: 1 }] };
  const plain = liftSandboxRunBlock(withCouncilRecord('Answer', council, { elapsedMs: 80_000, madeHere: true }));
  assert.equal(plain.text, 'Answer');
  assert.deepEqual(plain.run.council, { mode: 'deliberation', members: [{ name: 'Opus', status: 'done', chars: 10, counts: { search: 2 } }, { name: 'X', status: 'done' }], stages: [{ key: 'firstRound', ms: 5, done: 1, failed: 0 }] });
  assert.equal(plain.run.elapsedMs, 80_000);
  assert.equal(plain.run.madeHere, true);
  const withRun = liftSandboxRunBlock(withCouncilRecord('```noureon-run\n{"v":1,"status":"done","steps":[],"sources":[{"title":"A","url":"https://a.example/","n":1}],"connectors":["Linear"]}\n```\n\nAnswer', council));
  assert.deepEqual(withRun.run.connectors, ['Linear'], 'what the synthesis recorded stays');
  assert.equal(withRun.run.sources[0].n, 1);
  assert.ok(withRun.run.council);
  assert.equal(withCouncilRecord('Answer', null), 'Answer');
  assert.equal(normalizeCouncilRecord({ members: [] }), null);
});

test('the saved message of a council: one line "3 members discussed · 1m 20s", opening to the timeline, then what the synthesizer did', async () => {
  const { Window } = await import('happy-dom');
  const { createSandboxRunElement } = await import('../src/app/ui/sandbox/sandbox-run-view.js');
  const { document } = new Window({ url: 'https://example.test/' });
  const council = { mode: 'consensus', members: [{ name: 'Opus', status: 'done' }, { name: 'GPT', status: 'done' }, { name: 'Gemini', status: 'failed' }], stages: [{ key: 'firstRound', ms: 58_000 }, { key: 'synthesis', ms: 22_000 }] };
  const text = withCouncilRecord('```noureon-run\n{"v":1,"status":"done","steps":[],"sources":[{"title":"A","url":"https://a.example/","n":1}],"connectors":["Linear"]}\n```\n\nAnswer', council, { elapsedMs: 80_000 });
  const view = createSandboxRunElement(document, liftSandboxRunBlock(text).run, { language: 'zh-TW' });
  assert.equal(view.querySelector('.sandbox-run-summary').textContent, '3 位成員討論 · 1m 20s');
  assert.equal(view.querySelectorAll('.council-tl-saved .council-tl-stage').length, 2);
  assert.equal(view.querySelectorAll('.council-tl-member').length, 3);
  assert.ok(view.querySelector('.sandbox-run-row[data-kind="search"]'), 'the pages the members met');
  assert.ok(view.querySelector('.sandbox-run-row[data-kind="connector"]'), 'what the synthesizer used');
  const here = createSandboxRunElement(document, liftSandboxRunBlock(withCouncilRecord('Answer', council, { elapsedMs: 5000, madeHere: true })).run, { language: 'en' });
  assert.equal(here.querySelector('.sandbox-run-summary').textContent, '3 members discussed · 5s · Made on this device');
});

test('the panel is drawn as the timeline, a member is opened by a tap and stays open, and the timeline stays above the reply that writes the synthesis', async () => {
  const { Window } = await import('happy-dom');
  const { createResponseProgressRenderers } = await import('../src/app/runtime/reply/response-progress-renderers.js');
  const { runCouncilResponseRenderLifecycle } = await import('../src/app/runtime/council/council-response-render-lifecycle.js');
  const { getCouncilRuntimeTexts } = await import('../src/app/runtime/shell/council-runtime-texts.js');
  const window = new Window({ url: 'https://example.test/' });
  const { document } = window;
  const message = document.createElement('div');
  const contentDiv = document.createElement('div');
  message.append(contentDiv);
  document.body.append(message);
  const { renderCouncilProgress } = createResponseProgressRenderers({ escapeHTML: (value) => String(value), getUiLanguage: () => 'en', getCouncilRuntimeTexts: () => getCouncilRuntimeTexts('en') });
  const progress = { stage: 'firstRound', mode: 'consensus', startedAt: Date.now(), elapsedMs: 3000, stages: [{ key: 'firstRound', startMs: 0 }], modelStates: [{ modelId: 'a', modelName: 'Opus', status: 'running', steps: [{ kind: 'search', label: 'Searching: plans' }], counts: { search: 1 } }, { modelId: 'b', modelName: 'GPT', status: 'done', chars: 900 }] };
  let seenAboveReply = null;
  const result = await runCouncilResponseRenderLifecycle({
    contentDiv,
    userParts: [{ text: 'Q' }],
    signal: new AbortController().signal,
    getOutputMode: () => 'realtime',
    runModelCouncil: async (parts, signal, onProgress, onFinalChunk, handOver) => {
      onProgress(progress);
      assert.ok(contentDiv.querySelector('.council-tl-panel .council-tl-stage.is-now'));
      contentDiv.querySelector('[data-council-member="a"]').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(contentDiv.querySelector('.council-tl-steps li')?.textContent, 'Searching: plans', 'opened');
      onProgress({ ...progress, elapsedMs: 4000 });
      assert.ok(contentDiv.querySelector('.council-tl-steps'), 'still open after it was drawn again');
      onProgress({ ...progress, stage: 'synthesis', stages: [{ key: 'firstRound', startMs: 0, endMs: 5000, done: 2, failed: 0 }, { key: 'synthesis', startMs: 5000 }] });
      const made = await handOver.synthesize({ parts: [{ text: 'request' }], instruction: 'x', sources: [], synthesizer: { id: 's' } });
      return { text: made.text, synthesis: made, sources: [], record: { mode: 'consensus', members: [{ name: 'Opus', status: 'done' }, { name: 'GPT', status: 'done' }], stages: [] }, madeHere: true, metadata: {} };
    },
    renderCouncilProgress,
    createStreamingMarkdownRenderer: () => ({ appendText() {}, finish() {} }),
    appendRendererTextGradually: async () => {},
    startProgressTicker: () => 'ticker',
    stopProgressTicker: () => {},
    setCouncilRunning: () => {},
    renderCouncilControls: () => {},
    renderInputIndicators: () => {},
    requestFrame: (callback) => callback(),
    continueWithReply: async ({ targetElement }) => {
      const held = message.querySelector('.council-tl-hold');
      seenAboveReply = held ? { next: held.nextElementSibling === targetElement, now: held.querySelector('.council-tl-stage.is-now .council-tl-name')?.textContent, exits: held.querySelectorAll('[data-council-exit]').length } : null;
      return { fullResponse: 'The answer', extraParts: [] };
    }
  });
  assert.deepEqual(seenAboveReply, { next: true, now: 'Final answer', exits: 0 });
  assert.equal(message.querySelector('.council-tl-hold'), null, 'gone once the reply is written');
  const { run, text } = liftSandboxRunBlock(result.fullResponse);
  assert.equal(text, 'The answer');
  assert.equal(run.council.members.length, 2);
  assert.equal(run.madeHere, true, 'held here because the server was not reached: the line says so');
});
