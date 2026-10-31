import assert from 'node:assert/strict';
import test from 'node:test';

import { createShareReportMailer, reportMailFor } from '../../server/share-reports.js';
import { createShares } from '../../server/shares.js';

const row = (extra = {}) => ({ share_id: 's1', code: 'A'.repeat(32), title: 'Strawberry cake', mode: 'continue', status: 'active', owner_id: 'u', readers: 1, new_reports: 1, reasons: ['it is rude'], ...extra });

test('the mail says which share, what state it is in, what was written, and where to look and to act', () => {
  const mail = reportMailFor(row(), { appUrl: 'https://noureon.com' });
  assert.equal(mail.subject, '[Noureon] 分享被檢舉：Strawberry cake');
  assert.match(mail.text, /權限：可接著聊/);
  assert.match(mail.text, /狀態：仍有效/);
  assert.match(mail.text, /- it is rude/);
  assert.match(mail.text, new RegExp(`https://noureon.com/s/${'A'.repeat(32)}\\?review=1`));
  assert.match(mail.text, /https:\/\/noureon.com\/admin\/shares/);
  const paused = reportMailFor(row({ status: 'suspended', readers: 3 }), { appUrl: 'https://noureon.com' });
  assert.match(paused.subject, /已暫停/);
  assert.match(paused.text, /已暫停（3 位不同讀者檢舉/);
  const gone = reportMailFor(row({ code: null, status: null, title: null, mode: null }), { appUrl: 'https://noureon.com' });
  assert.match(gone.text, /已經不在了/);
  assert.doesNotMatch(gone.text, /admin\/shares/);
});

test('what a reader or an owner wrote cannot break the subject or run on', () => {
  const mail = reportMailFor(row({ title: 'a\r\nBcc: x@y.z\n'.repeat(30), reasons: ['x'.repeat(2000), 'line\nbreak'] }), { appUrl: 'https://noureon.com' });
  assert.doesNotMatch(mail.subject, /[\r\n]/);
  assert.ok(mail.subject.length <= 120);
  assert.ok(mail.text.split('\n').every((line) => line.length < 700));
});

const mailerOf = (outcomes = []) => {
  const sent = [];
  return { sent, configured: true, send: async (mail) => { if (outcomes.shift() === 'fail') throw Object.assign(new Error('x'), { code: 'refused', status: 500 }); sent.push(mail); } };
};

test('each share with new reports gets one mail to the address of the settings', async () => {
  const mailer = mailerOf();
  const calls = [];
  const db = { rpc: async (name, params) => { calls.push([name, params]); return name === 'server_take_share_reports_to_mail' ? [row(), row({ share_id: 's2', title: 'Other' })] : 0; } };
  const sent = await createShareReportMailer({ db, mailer, to: 'me@example.test', appUrl: 'https://noureon.com' }).mailOnce();
  assert.equal(sent, 2);
  assert.deepEqual(mailer.sent.map((mail) => mail.to), ['me@example.test', 'me@example.test']);
  assert.deepEqual(calls.map((call) => call[0]), ['server_take_share_reports_to_mail', 'server_take_removed_shares_to_mail']);
});

test('a mail that cannot be sent puts its reports back, and nothing is asked when mail is not set up', async () => {
  const mailer = mailerOf(['ok', 'fail']);
  const calls = [];
  const db = { rpc: async (name, params) => { calls.push([name, params]); return name === 'server_take_share_reports_to_mail' ? [row(), row({ share_id: 's2' })] : 0; } };
  const sent = await createShareReportMailer({ db, mailer, to: 'me@example.test', appUrl: 'https://noureon.com', now: () => 1_000_000 }).mailOnce();
  assert.equal(sent, 1);
  const requeue = calls.find((call) => call[0] === 'server_requeue_share_reports');
  assert.deepEqual(requeue[1].p_share_ids, ['s2']);
  const idle = [];
  assert.equal(await createShareReportMailer({ db: { rpc: async (...args) => { idle.push(args); } }, mailer: { configured: false }, to: 'me@example.test', appUrl: 'x' }).mailOnce(), 0);
  assert.equal(idle.length, 0);
});

test('a failing database does not stop the sweep of the shares', async () => {
  const logs = [];
  const shares = createShares({
    db: { rpc: async (name) => { if (name === 'server_take_share_reports_to_mail') throw new Error('down'); return name === 'orphan_shared_assets' ? [] : 0; } },
    store: { list: async () => [], removeAll: async () => 0 }, log: (event) => logs.push(event),
    reportMail: createShareReportMailer({ db: { rpc: async () => { throw new Error('down'); } }, mailer: { configured: true }, to: 'me@example.test', appUrl: 'x', log: (event) => logs.push(event) })
  });
  await shares.sweepOnce();
  assert.ok(logs.includes('share_report_take_failed'));
});

test('the owner of a share that was taken down is told once, at the address of their account, in English, and a failed mail goes back', async () => {
  const mailer = mailerOf(['ok', 'fail']);
  const calls = [];
  const rows = [{ share_id: 's1', owner_email: 'ada@example.test', title: 'Strawberry\ncake' }, { share_id: 's2', owner_email: 'bob@example.test', title: 'Other' }, { share_id: 's3', owner_email: null, title: 'No address' }];
  const db = { rpc: async (name, params) => { calls.push([name, params]); return name === 'server_take_removed_shares_to_mail' ? rows : []; } };
  const sent = await createShareReportMailer({ db, mailer, to: 'me@example.test', appUrl: 'https://noureon.com' }).mailRemovalsOnce();
  assert.equal(sent, 1);
  assert.equal(mailer.sent[0].to, 'ada@example.test');
  assert.equal(mailer.sent[0].replyTo, 'me@example.test');
  assert.doesNotMatch(mailer.sent[0].subject, /[\r\n]/);
  assert.match(mailer.sent[0].subject, /taken down/);
  assert.match(mailer.sent[0].text, /"Strawberry cake", was taken down by Noureon after review/);
  assert.doesNotMatch(mailer.sent[0].text, /[\u4e00-\u9fff]/, 'English only');
  assert.deepEqual(calls.find((call) => call[0] === 'server_requeue_removed_shares')[1], { p_share_ids: ['s2'] });
});

test('a failing take of the reports does not stop the mails about removals', async () => {
  const mailer = mailerOf();
  const db = { rpc: async (name) => { if (name === 'server_take_share_reports_to_mail') throw new Error('down'); return name === 'server_take_removed_shares_to_mail' ? [{ share_id: 's1', owner_email: 'ada@example.test', title: 'T' }] : []; } };
  const sent = await createShareReportMailer({ db, mailer, to: 'me@example.test', appUrl: 'https://noureon.com' }).mailOnce();
  assert.equal(sent, 1);
});

test('the mails come with an HTML version that has the mark, the words and the buttons, and whatever a person wrote is text in it', async () => {
  const { removedMailFor: removed } = await import('../../server/share-reports.js');
  const evil = '<img src=x onerror=alert(1)> & "quotes"';
  const mail = reportMailFor(row({ title: evil, reasons: [evil, '<script>x</script>'], status: 'suspended', readers: 3 }), { appUrl: 'https://noureon.com' });
  assert.match(mail.html, /^<!doctype html>/);
  assert.match(mail.html, /https:\/\/noureon\.com\/icon-192\.png/);
  assert.match(mail.html, /#5b4fcf/, 'the purple of the other mails of Noureon');
  assert.match(mail.html, /prefers-color-scheme: dark/);
  assert.match(mail.html, /Contact support/);
  assert.doesNotMatch(mail.html, /<img src=x|<script>/, 'what a person wrote is not markup');
  assert.match(mail.html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;quotes&quot;/);
  assert.match(mail.html, new RegExp(`href="https://noureon.com/s/${'A'.repeat(32)}\\?review=1"`));
  assert.match(mail.html, /href="https:\/\/noureon.com\/admin\/shares"/);
  assert.ok(mail.text.length > 20, 'the text version stays');
  const gone = reportMailFor(row({ code: null, status: null }), { appUrl: 'https://noureon.com' });
  assert.doesNotMatch(gone.html, /\/s\/|admin\/shares/, 'nothing to open for a share that is gone');
  const taken = removed({ title: 'Strawberry <b>cake</b>' });
  assert.match(taken.html, /Strawberry &lt;b&gt;cake&lt;\/b&gt;/);
  assert.match(taken.html, /Your shared conversation was taken down/);
  assert.match(taken.text, /"Strawberry <b>cake<\/b>", was taken down/);
  const untitled = removed({ title: '' });
  assert.doesNotMatch(untitled.text, /"—"/);
  assert.match(untitled.text, /^A conversation you shared was taken down by Noureon after review\./);
});

test('the mailer sends the HTML too when it is given, and never a link that is not https', async () => {
  const { createMailer } = await import('../../server/mailer.js');
  const { renderMail } = await import('../../server/mail-layout.js');
  const seen = [];
  const mailer = createMailer({ apiKey: 'k', from: 'Noureon <noreply@noureon.com>', fetchImpl: async (url, init) => { seen.push(JSON.parse(init.body)); return { ok: true, body: { cancel: async () => {} } }; } });
  await mailer.send({ to: 'a@example.test', subject: 's', text: 'plain', html: '<p>hi</p>' });
  await mailer.send({ to: 'a@example.test', subject: 's', text: 'plain' });
  assert.equal(seen[0].html, '<p>hi</p>');
  assert.equal('html' in seen[1], false);
  const html = renderMail({ heading: 'H', buttons: [{ label: 'bad', href: 'javascript:alert(1)' }, { label: 'ok', href: 'https://noureon.com/x' }] });
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /href="https:\/\/noureon.com\/x"/);
});
