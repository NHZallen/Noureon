// The mail about a reported share (docs/superpowers/specs/2026-10-31-conversation-share-design.md, §11): once in a while the server takes the reports it has not told of, and writes one mail
// for each share to the owner of the service (REPORT_TO). What the readers wrote is plain text in a plain mail. A mail that cannot be sent puts its reports back, to be told of next time.

const LABELS = { view: '唯讀', continue: '可接著聊' };
const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The subject and the text of the mail for one share (a row of `server_take_share_reports_to_mail`). */
export function reportMailFor(row, { appUrl }) {
  const paused = row.status === 'suspended';
  const gone = !row.code;
  const title = oneLine(row.title, 60) || '（沒有名稱）';
  const readers = Number(row.readers) || 0;
  const lines = [
    '有人檢舉了一個分享。',
    '',
    `對話名稱：${title}`,
    `權限：${LABELS[row.mode] || row.mode || '不明'}`,
    gone ? '狀態：這個分享已經不在了' : paused ? `狀態：已暫停（${readers} 位不同讀者檢舉，連結已失效）` : row.status === 'removed' ? '狀態：已下架' : row.status === 'conversation_deleted' ? '狀態：對話已刪除，連結已失效' : '狀態：仍有效',
    `這次新增 ${Number(row.new_reports) || 0} 筆，共 ${readers} 位不同讀者。`
  ];
  const reasons = (Array.isArray(row.reasons) ? row.reasons : []).map((reason) => oneLine(reason, 500)).filter(Boolean).slice(0, 10);
  if (reasons.length) lines.push('', '讀者寫的原因：', ...reasons.map((reason) => `- ${reason}`));
  if (!gone) lines.push('', `看內容：${appUrl}/s/${row.code}?review=1`, `處理：${appUrl}/admin/shares`);
  return { subject: oneLine(`[Noureon] 分享被檢舉${paused ? '，已暫停' : ''}：${title}`, 120), text: lines.join('\n') };
}

const REMOVED_TEXT = {
  'zh-TW': (title) => `你分享的對話「${title}」經 Noureon 審查後已下架，連結不再有效，這段對話也不能再被分享。對話本身還在你的帳號裡，沒有被刪除。`,
  en: (title) => `The conversation you shared, "${title}", was taken down by Noureon after review. Its link no longer works and this conversation can no longer be shared. The conversation itself is still in your account; nothing was deleted.`,
  fr: (title) => `La conversation que vous avez partagée, « ${title} », a été retirée par Noureon après examen. Son lien ne fonctionne plus et cette conversation ne peut plus être partagée. La conversation elle-même est toujours dans votre compte ; rien n’a été supprimé.`,
  ru: (title) => `Беседа «${title}», которой вы поделились, удалена Noureon после проверки. Ссылка больше не работает, и этой беседой нельзя поделиться снова. Сама беседа осталась в вашей учётной записи, ничего не удалено.`,
  es: (title) => `La conversación que compartiste, «${title}», fue retirada por Noureon tras revisarla. Su enlace ya no funciona y esta conversación ya no se puede compartir. La conversación sigue en tu cuenta; no se eliminó nada.`
};
const REMOVED_REPLY = { 'zh-TW': '有疑問請直接回覆這封信。', en: 'If you have questions, just reply to this mail.', fr: 'Pour toute question, répondez simplement à ce message.', ru: 'Если есть вопросы, просто ответьте на это письмо.', es: 'Si tienes preguntas, responde a este correo.' };

/** The mail to the owner of a share that was taken down (a row of `server_take_removed_shares_to_mail`): one mail in the five languages, since the server does not know which one the person reads. */
export function removedMailFor(row) {
  const title = oneLine(row.title, 60) || '—';
  const languages = ['zh-TW', 'en', 'fr', 'ru', 'es'];
  return {
    subject: '[Noureon] 你分享的對話已被下架 · Your shared conversation was taken down',
    text: languages.map((language) => `${REMOVED_TEXT[language](title)} ${REMOVED_REPLY[language]}`).join('\n\n')
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
      return mailRemovalsOnce();
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
    return sent + await mailRemovalsOnce();
  }

  /** The owners of the shares that were taken down are told once; the address is the one of their own account. */
  async function mailRemovalsOnce() {
    let rows;
    try {
      rows = await db.rpc('server_take_removed_shares_to_mail', { p_limit: 20 });
    } catch (error) {
      log('share_removed_take_failed', { name: error?.name || 'Error', status: error?.status || 0 });
      return 0;
    }
    let sent = 0;
    const failed = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      // An account without an address (or one that cannot be mailed) is not tried again.
      if (!row.owner_email) continue;
      try {
        await mailer.send({ to: row.owner_email, replyTo: to, ...removedMailFor(row) });
        sent += 1;
      } catch (error) {
        failed.push(row.share_id);
        log('share_removed_mail_failed', { code: error?.code || 'error', status: error?.status || 0 });
      }
    }
    if (failed.length) {
      try { await db.rpc('server_requeue_removed_shares', { p_share_ids: failed }); } catch { /* the owner sees it in the list of shared items */ }
    }
    if (sent) log('share_removed_mail', { sent });
    return sent;
  }
  return { mailOnce, mailRemovalsOnce };
}
