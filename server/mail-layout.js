// The look of the mails the server sends (the report mail to the owner of the service, the mail to the owner of a share that was taken down). It is the look of the auth mails of Noureon that
// docs/email-templates/build-emails.py makes (the card, the round mark, the title, the purple button, the rule, the footer with the two links, and the dark scheme of the mail app), so that every
// mail of Noureon looks like one. Mail clients read only inline styles and tables, so that is all this uses. Whatever a person wrote (a title, what a reader said) goes through `escapeHtml`; an address
// in a button must be https.

const SITE = 'https://noureon.com';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',Roboto,Helvetica,Arial,sans-serif";
const ACC = '#5b4fcf';

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeHref = (href) => (/^https:\/\/[^\s"'<>]+$/.test(String(href)) ? String(href) : '');

const FOOTERS = {
  plain: 'This is an automated message. If you were not expecting it, you can safely ignore it.',
  notice: 'This is an automated notice from Noureon.'
};

const rowOf = (paddingTop, paddingBottom, className, style, content, align = '') => `<tr><td class="pad ${className}"${align ? ` align="${align}"` : ''} style="padding:${paddingTop}px 40px ${paddingBottom} 40px;${style}">${content}</td></tr>`;
const TEXT = { p: ['tx', 'font-size:15px;line-height:1.75;color:#3c3c4e'], small: ['tx', 'font-size:14px;line-height:1.75;color:#3c3c4e'], muted: ['muted', 'font-size:13px;line-height:1.75;color:#7a7a8c'] };
const RULE = '<tr><td class="pad" style="padding:24px 40px 0 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="border-top:1px solid #ececf2;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>';

/**
 * The HTML of a mail. `heading`: the title; `intro` and `outro`: paragraphs before and after; `quote`: { label, text } a box that sets a title apart; `details`: [[label, value]] rows;
 * `list`: { label, items } a short list; `buttons`: [{ label, href }] side by side; `muted`: smaller words at the end; `footer`: 'plain' or 'notice'; `preheader`: the line some mail apps show beside the subject.
 */
export function renderMail({ subject = '', preheader = '', heading, intro = [], quote = null, details = [], list = null, buttons = [], outro = [], muted = [], footer = 'plain' }) {
  const blocks = [];
  const add = (kind, html) => blocks.push({ kind, html });
  for (const text of intro) add('p', ['p', text]);
  if (quote?.text) add('box', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="codebox ink" style="padding:16px 18px;background:#f6f6fa;border:1px solid #e4e4ec;border-radius:10px;font-size:17px;line-height:1.5;font-weight:700;color:#1a1a2e;overflow-wrap:anywhere">${quote.label ? `<div class="muted" style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:#7a7a8c">${escapeHtml(quote.label)}</div>` : ''}${escapeHtml(quote.text)}</td></tr></table>`);
  if (details.length) {
    add('details', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${details.map(([label, value]) => `<tr><td class="rule muted" width="32%" valign="top" style="padding:10px 12px 10px 0;border-top:1px solid #ececf2;font-size:13px;line-height:1.6;color:#7a7a8c">${escapeHtml(label)}</td><td class="rule tx" valign="top" style="padding:10px 0;border-top:1px solid #ececf2;font-size:14px;line-height:1.6;color:#3c3c4e;overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join('')}</table>`);
  }
  if (list?.items?.length) {
    add('list', `${list.label ? `<div class="muted" style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:.4px;text-transform:uppercase;color:#7a7a8c">${escapeHtml(list.label)}</div>` : ''}${list.items.map((item) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px"><tr><td class="codebox tx" style="padding:10px 14px;background:#f6f6fa;border:1px solid #e4e4ec;border-radius:10px;font-size:14px;line-height:1.6;color:#3c3c4e;overflow-wrap:anywhere">${escapeHtml(item)}</td></tr></table>`).join('')}`);
  }
  const links = buttons.filter((button) => safeHref(button.href));
  if (links.length) {
    add('button', links.map((button, index) => `<a class="btn-a" href="${escapeHtml(safeHref(button.href))}" style="display:inline-block;margin:0 ${index < links.length - 1 ? 10 : 0}px 8px 0;padding:13px 26px;background:${ACC};color:#ffffff;font-size:15px;font-weight:600;line-height:1.3;text-decoration:none;border-radius:8px">${escapeHtml(button.label)}</a>`).join(''));
  }
  if (outro.length || muted.length) add('rule', null);
  for (const text of outro) add('small', ['small', text]);
  for (const text of muted) add('muted', ['muted', text]);

  let previous = 'title';
  const rows = blocks.map((block, index) => {
    const last = index === blocks.length - 1;
    const bottom = last ? '36px' : '0';
    let top = 14;
    if (previous === 'rule') top = block.kind === 'muted' ? 20 : 22;
    else if (block.kind === 'button' || block.kind === 'box' || block.kind === 'details' || block.kind === 'list') top = 18;
    else if (previous === 'button') top = 24;
    previous = block.kind;
    if (block.kind === 'rule') return RULE;
    if (Array.isArray(block.html)) { const [kind, text] = block.html; const [className, style] = TEXT[kind]; return rowOf(top, bottom, className, style, escapeHtml(text)); }
    return rowOf(top, bottom, '', '', block.html, block.kind === 'button' ? 'left' : '');
  }).join('\n      ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject || heading)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg { background:#101015 !important; }
    .card { background:#1a1a22 !important; border-color:#2c2c38 !important; }
    .ink { color:#f2f2f7 !important; }
    .tx { color:#d2d2dd !important; }
    .muted { color:#8d8d9b !important; }
    .rule { border-color:#2c2c38 !important; }
    .codebox { background:#22222c !important; border-color:#34343f !important; }
    .lnk { color:#a59dff !important; }
    .btn-a { background:#7468e8 !important; }
  }
  @media only screen and (max-width: 520px) {
    .pad { padding-left:22px !important; padding-right:22px !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f4f4f8;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#f4f4f8"><tr><td align="center" style="padding:32px 14px 40px 14px">
<table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:540px;font-family:${FONT};text-align:left">
  <tr><td class="card" style="background:#ffffff;border:1px solid #e4e4ec;border-radius:12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="pad" style="padding:34px 40px 0 40px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle"><img src="${SITE}/icon-192.png" width="34" height="34" alt="" style="display:block;border:0;border-radius:17px"></td>
          <td valign="middle" class="ink" style="padding-left:10px;font-size:19px;font-weight:700;letter-spacing:-0.2px;color:#1a1a2e">Noureon</td>
        </tr></table>
      </td></tr>
      <tr><td class="pad ink" style="padding:28px 40px 0 40px;font-size:26px;line-height:1.3;font-weight:700;letter-spacing:-0.4px;color:#1a1a2e">${escapeHtml(heading)}</td></tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td align="center" style="padding:24px 12px 0 12px;font-size:13px;line-height:1.6"><a class="lnk" href="${SITE}" style="color:${ACC};text-decoration:none">Open Noureon</a><span class="muted" style="color:#b4b4c0">&nbsp;&nbsp;・&nbsp;&nbsp;</span><a class="lnk" href="mailto:support@noureon.com" style="color:${ACC};text-decoration:none">Contact support</a></td></tr>
  <tr><td align="center" class="muted" style="padding:14px 12px 0 12px;font-size:12px;line-height:1.7;color:#9a9aaa">${FOOTERS[footer] || FOOTERS.plain}</td></tr>
</table>
</td></tr></table>
</body>
</html>
`;
}
