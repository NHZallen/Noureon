import assert from 'node:assert/strict';
import test from 'node:test';

import { addCli, canModelUseCli, cliIdsForReply, cliIdsOfParts, cliIndicatorId, enabledCliIds, isCliEnabled, removeCli, setCliModelUse, withCliSegments } from '../../src/app/runtime/cli/cli-state.js';

test('a tool is added with its version, removed with everything kept about it, and only tools that can be used are added', () => {
  const config = {};
  assert.equal(addCli(config, 'officecli'), true);
  assert.deepEqual(config.cliEnabledIds, ['officecli']);
  assert.deepEqual(config.cliVersions, { officecli: '1.0.153' });
  assert.equal(addCli(config, 'officecli'), false, 'not twice');
  assert.equal(addCli(config, 'pandoc'), false, 'a tool that is coming cannot be added yet');
  assert.equal(addCli(config, 'nothing'), false);
  addCli(config, 'ffmpeg');
  assert.equal(setCliModelUse(config, 'ffmpeg', true), true);
  assert.equal(canModelUseCli(config, 'ffmpeg'), true);
  assert.equal(setCliModelUse(config, 'yt-dlp', true), false, 'only a tool that is added');
  assert.equal(removeCli(config, 'ffmpeg'), true);
  assert.deepEqual([config.cliEnabledIds, config.cliModelUseIds, config.cliVersions], [['officecli'], [], { officecli: '1.0.153' }]);
  assert.equal(removeCli(config, 'ffmpeg'), false);
  assert.deepEqual(enabledCliIds({ cliEnabledIds: ['officecli', 'pandoc', 'gone'] }), ['officecli'], 'what cannot be used does not count');
});

test('the tools chosen with "@" are read from the chips of a message, and a reply gets those and the ones the model may use by itself', () => {
  const parts = [{ text: 'make a deck', displaySegments: [{ type: 'mode', indicatorId: cliIndicatorId('officecli'), label: 'OfficeCLI' }, { type: 'mode', indicatorId: 'search-indicator', label: 'Search' }, { type: 'mode', indicatorId: cliIndicatorId('gone'), label: 'x' }, { type: 'text', text: 'make a deck' }] }];
  assert.deepEqual(cliIdsOfParts(parts), ['officecli']);
  assert.deepEqual(cliIdsOfParts([{ text: 'plain' }]), []);
  const config = { cliEnabledIds: ['officecli', 'ffmpeg'], cliModelUseIds: ['ffmpeg'] };
  assert.deepEqual(cliIdsForReply(config, parts), { chosen: ['officecli'], ids: ['officecli', 'ffmpeg'] });
  assert.deepEqual(cliIdsForReply(config, [{ text: 'hi' }]), { chosen: [], ids: ['ffmpeg'] }, 'the model may use ffmpeg by itself');
  assert.deepEqual(cliIdsForReply({ cliEnabledIds: [] }, parts), { chosen: [], ids: [] }, 'a tool that was removed is not used');
  assert.deepEqual(cliIdsForReply({ cliEnabledIds: [] }, parts, { all: true }).chosen, ['officecli'], 'but it can be told that one was chosen');
});

test('chips that are not in the box (a phone) are put into the message before its words, and not twice', () => {
  const picked = [{ id: 'officecli', indicatorId: cliIndicatorId('officecli'), label: 'OfficeCLI' }];
  const plain = withCliSegments({ text: 'make a deck' }, picked);
  assert.deepEqual(plain.displaySegments, [{ type: 'mode', indicatorId: 'cli-indicator-officecli', label: 'OfficeCLI' }, { type: 'text', text: 'make a deck' }]);
  assert.equal(plain.displayText, 'OfficeCLI make a deck');
  const already = withCliSegments({ text: 'x', displaySegments: [{ type: 'mode', indicatorId: 'cli-indicator-officecli', label: 'OfficeCLI' }, { type: 'text', text: 'x' }], displayText: 'OfficeCLI x' }, picked);
  assert.equal(already.displaySegments.length, 2, 'the chip typed in the box is kept once');
  assert.deepEqual(withCliSegments({ text: 'a' }, []), { text: 'a' });
  assert.equal(isCliEnabled({ cliEnabledIds: ['ffmpeg'] }, 'ffmpeg'), true);
});

import { createCodeCard } from '../../src/app/ui/sandbox/run-code-card.js';
import { createSandboxRunElement } from '../../src/app/ui/sandbox/sandbox-run-view.js';
import { formatSandboxRunBlock, liftSandboxRunBlock, summarizeSandboxRun } from '../../src/app/ui/sandbox/sandbox-run-block.js';
import { Window } from 'happy-dom';

test('a step that is a command is kept as one, drawn as shell, and summed up without saying it was Python', () => {
  const run = { status: 'done', steps: [{ title: 'Make it', code: 'officecli create a.docx', command: true, stdout: 'ok', stderr: '', files: [{ name: 'a.docx', size: 3 }], elapsedMs: 40 }, { title: 'Calc', code: 'print(1)', stdout: '1', stderr: '', files: [], elapsedMs: 5 }] };
  const { run: kept } = liftSandboxRunBlock(formatSandboxRunBlock(run));
  assert.equal(kept.steps[0].command, true);
  assert.equal(kept.steps[1].command, undefined, 'Python steps stay as they were');
  assert.match(summarizeSandboxRun(kept), /Python or CLI commands/);
  assert.match(summarizeSandboxRun({ status: 'done', steps: [kept.steps[1]] }), /Python ran 1 time/, 'a reply with Python only reads as before');

  const window = new Window();
  const card = createCodeCard(window.document, 'ffmpeg -version', 'en', { shell: true });
  assert.equal(card.querySelector('.run-code-name').textContent, 'Shell');
  assert.ok(card.querySelector('code.language-bash'));
  assert.ok(createCodeCard(window.document, 'print(1)', 'en').querySelector('code.language-python'));
  const element = createSandboxRunElement(window.document, kept, { language: 'en' });
  const rows = [...element.querySelectorAll('.sandbox-run-row')];
  assert.equal(rows[0].querySelector('.run-code-name').textContent, 'Shell');
  assert.equal(rows[1].querySelector('.run-code-name').textContent, 'Python');
});
