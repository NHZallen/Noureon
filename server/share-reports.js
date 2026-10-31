// The mail about a reported share (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §11): once in a while the server takes the reports it has not told of, and writes one mail
// for each share to the owner of the service (REPORT_TO). What the readers wrote is plain text in a plain mail. A mail that cannot be sent puts its reports back, to be told of next time.

import { renderMail } from './mail-layout.js';

const LABELS = { view: '唯讀', continue: '可接著聊' };
const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The subject, the text and the HTML of the mail for one share (a row of `server_take_share_reports_to_mail`). */
export function reportMailFor(row, { appUrl }) {
  const paused = row.status === 'suspended';
  const gone = !row.code;
  const title = oneLine(row.title, 60) || '（沒有名稱）';
  const readers = Number(row.readers) || 0;
  const mode = LABELS[row.mode] || row.mode || '不明';
  const state = gone ? '這個分享已經不在了' : paused ? `已暫停（${readers} 位不同讀者檢舉，連結已失效）` : row.status === 'removed' ? '已下架' : row.status === 'conversation_deleted' ? '對話已刪除，連結已失效' : '仍有效';
  const counts = `這次新增 ${Number(row.new_reports) || 0} 筆，共 ${readers} 位不同讀者`;
  const reasons = (Array.isArray(row.reasons) ? row.reasons : []).map((reason) => oneLine(reason, 500)).filter(Boolean).slice(0, 10);
  const review = gone ? '' : `${appUrl}/s/${row.code}?review=1`;
  const admin = gone ? '' : `${appUrl}/admin/shares`;
  const lines = ['有人檢舉了一個分享。', '', `對話名稱：${title}`, `權限：${mode}`, `狀態：${state}`, `${counts}。`];
  if (reasons.length) lines.push('', '讀者寫的原因：', ...reasons.map((reason) => `- ${reason}`));
  if (!gone) lines.push('', `看內容：${review}`, `處理：${admin}`);
  const blocks = [
    { kind: 'p', parts: [paused ? '同一個分享被三位不同的讀者檢舉，連結已經先暫停，等你看過再決定。' : '有讀者檢舉了下面這個分享，目前連結仍然有效。'] },
    { kind: 'p', parts: [{ b: '對話名稱：' }, title] },
    { kind: 'small', parts: [{ b: '權限：' }, mode, '　', { b: '狀態：' }, state] },
    { kind: 'small', parts: [{ b: '檢舉：' }, counts] }
  ];
  if (!gone) blocks.push({ kind: 'button', label: '看內容', href: review });
  if (reasons.length) {
    blocks.push({ kind: 'rule' });
    blocks.push({ kind: 'small', parts: [{ b: '讀者寫的原因：' }] });
    for (const reason of reasons) blocks.push({ kind: 'small', parts: ['・', reason] });
  }
  if (!gone) {
    blocks.push({ kind: 'rule' });
    blocks.push({ kind: 'muted', parts: ['處理（暫停、恢復、清除檢舉、下架）：', { a: admin, text: admin }] });
  }
  const html = renderMail({ preheader: `${title}：${state}`, title: paused ? '有分享被檢舉，已暫停' : '有人檢舉了一個分享', blocks });
  return { subject: oneLine(`[Noureon] 分享被檢舉${paused ? '，已暫停' : ''}：${title}`, 120), text: lines.join('\n'), html };
}

/** The mail to the owner of a share that was taken down (a row of `server_take_removed_shares_to_mail`). It is in English: the server does not know which language the person reads. */
export function removedMailFor(row) {
  const title = oneLine(row.title, 60);
  const first = title ? `The conversation you shared, "${title}", was taken down by Noureon after review.` : 'A conversation you shared was taken down by Noureon after review.';
  const second = 'Its link no longer works and this conversation can no longer be shared. The conversation itself is still in your account; nothing was deleted.';
  const third = 'If you have questions, just reply to this mail.';
  return {
    subject: '[Noureon] Your shared conversation was taken down',
    text: [first, second, third].join('\n\n'),
    html: renderMail({
      preheader: 'Its link no longer works and it can no longer be shared. Nothing was deleted from your account.',
      title: 'Your shared conversation was taken down',
      blocks: [
        { kind: 'p', parts: title ? ['Noureon took down the share of ', { b: title }, ' after a review.'] : [first] },
        { kind: 'small', parts: [second] },
        { kind: 'rule' },
        { kind: 'muted', parts: [third] }
      ]
    })
  };
}

/** The mail to the owner of a share whose takedown was taken back (a row of `server_take_restored_shares_to_mail`). English, like the one about the takedown. */
export function restoredMailFor(row) {
  const title = oneLine(row.title, 60);
  const first = title ? `Noureon looked at the share of "${title}" again and took the takedown back.` : 'Noureon looked at a conversation you shared again and took the takedown back.';
  const second = 'Its link works again, and you can share this conversation again. Nothing else changed.';
  const third = 'If you have questions, just reply to this mail.';
  return {
    subject: '[Noureon] Your shared conversation is back',
    text: [first, second, third].join('\n\n'),
    html: renderMail({
      preheader: 'Its link works again, and you can share this conversation again.',
      title: 'Your shared conversation is back',
      blocks: [
        { kind: 'p', parts: title ? ['Noureon looked at the share of ', { b: title }, ' again and took the takedown back.'] : [first] },
        { kind: 'small', parts: [second] },
        { kind: 'rule' },
        { kind: 'muted', parts: [third] }
      ]
    })
  };
}

export function createShareReportMailer({ db, mailer, to, appUrl, log = () => {}, now = Date.now }) {
  /** One pass; resolves how many mails were sent. Never throws. */
  async function mailOnce() {
    if (!mailer?.configured || !to) return 0;
    const startedAt = new Date(now() - 1000).toISOString();
    let rows;
    try {
      rows = await db.rpc('server_take_share_reports_to_mail', { p_limit: 50 });
    } catch (error) {
      log('share_report_take_failed', { name: error?.name || 'Error', status: error?.status || 0 });
      return mailOwnersOnce();
    }
    let sent = 0;
    const failed = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      try {
        await mailer.send({ to, ...reportMailFor(row, { appUrl }) });
        sent += 1;
      } catch (error) {
        failed.push(row.share_id);
        log('share_report_mail_failed', { code: error?.code || 'error', status: error?.status || 0 });
      }
    }
    if (failed.length) {
      try { await db.rpc('server_requeue_share_reports', { p_share_ids: failed, p_since: startedAt }); } catch { /* the reports stay marked; the admin page still lists them */ }
    }
    if (sent) log('share_report_mail', { sent });
    return sent + await mailOwnersOnce();
  }

  const mailOwnersOnce = async () => await mailRemovalsOnce() + await mailRestoredOnce();

  /** The owners of a share that was taken down, or whose takedown was taken back, are told once; the address is the one of their own account. */
  async function mailOwners({ take, requeue, build, name }) {
    let rows;
    try {
      rows = await db.rpc(take, { p_limit: 20 });
    } catch (error) {
      log(`${name}_take_failed`, { name: error?.name || 'Error', status: error?.status || 0 });
      return 0;
    }
    let sent = 0;
    const failed = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      // An account without an address (or one that cannot be mailed) is not tried again.
      if (!row.owner_email) continue;
      try {
        await mailer.send({ to: row.owner_email, replyTo: to, ...build(row) });
        sent += 1;
      } catch (error) {
        failed.push(row.share_id);
        log(`${name}_mail_failed`, { code: error?.code || 'error', status: error?.status || 0 });
      }
    }
    if (failed.length) {
      try { await db.rpc(requeue, { p_share_ids: failed }); } catch { /* the owner sees it in the list of shared items */ }
    }
    if (sent) log(`${name}_mail`, { sent });
    return sent;
  }
  const mailRemovalsOnce = () => mailOwners({ take: 'server_take_removed_shares_to_mail', requeue: 'server_requeue_removed_shares', build: removedMailFor, name: 'share_removed' });
  const mailRestoredOnce = () => mailOwners({ take: 'server_take_restored_shares_to_mail', requeue: 'server_requeue_restored_shares', build: restoredMailFor, name: 'share_restored' });
  return { mailOnce, mailRemovalsOnce, mailRestoredOnce };
}
