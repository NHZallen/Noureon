// The look of the mails the server sends (the report mail to the owner of the service, the mail to the owner of a share that was taken down): exactly the look of the mails of Noureon that the owner
// already receives (the auth mails made by docs/email-templates/build-emails.py): the card, the round mark and the name, a title, plain paragraphs, one purple button, a thin line, smaller grey words, and
// under the card "Open Noureon ・ Contact support" and one grey line, with the dark scheme of the mail app. Nothing else is drawn (no boxes, no tables of facts). Mail clients read only inline
// styles and tables, so that is all this uses. Whatever a person wrote (a title, what a reader said) goes through `escapeHtml`; an address in a button or a link must be https.

const SITE = 'https://noureon.com';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',Roboto,Helvetica,Arial,sans-serif";
const ACC = '#5b4fcf';

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeHref = (href) => (/^https:\/\/[^\s"'<>]+$/.test(String(href)) ? String(href) : '');

const FOOTER = 'This is an automated message. If you were not expecting it, you can safely ignore it.';
const KIND_STYLE = { p: ['tx', '15px', '#3c3c4e'], small: ['tx', '14px', '#3c3c4e'], muted: ['muted', '13px', '#7a7a8c'] };

/** The words of a paragraph: a string, or an array of strings, { b: 'bold' } and { a: 'https://…', text: 'link words' }. */
const inline = (parts) => [].concat(parts).map((part) => {
  if (typeof part === 'string') return escapeHtml(part);
  if (part.b !== undefined) return `<strong>${escapeHtml(part.b)}</strong>`;
  if (part.a !== undefined && safeHref(part.a)) return `<a href="${escapeHtml(safeHref(part.a))}" style="color:${ACC};text-decoration:underline">${escapeHtml(part.text ?? part.a)}</a>`;
  return escapeHtml(part.text ?? '');
}).join('');

const topPadding = (previous, kind) => {
  if (previous === 'title') return 14;
  if (previous === 'rule') return kind === 'muted' ? 20 : 22;
  if (kind === 'button') return 18;
  if (previous === 'button') return 24;
  return 14;
};

/**
 * The HTML of a mail. `blocks`: [{ kind: 'p' | 'small' | 'muted', parts }, { kind: 'rule' }, { kind: 'button', label, href }] in the order they are read; `title`: the heading;
 * `preheader`: the line some mail apps show beside the subject.
 */
export function renderMail({ subject = '', preheader = '', title, blocks = [] }) {
  let previous = 'title';
  const rows = blocks.map((block, index) => {
    const last = index === blocks.length - 1;
    const top = topPadding(previous, block.kind);
    const bottom = last ? '36px' : '0';
    previous = block.kind;
    if (block.kind === 'rule') return '<tr><td class="pad" style="padding:24px 40px 0 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="border-top:1px solid #ececf2;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>';
    if (block.kind === 'button') {
      const href = safeHref(block.href);
      return href ? `<tr><td class="pad" align="left" style="padding:${top}px 40px ${bottom} 40px"><a class="btn-a" href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;background:${ACC};color:#ffffff;font-size:15px;font-weight:600;line-height:1.3;text-decoration:none;border-radius:8px">${escapeHtml(block.label)}</a></td></tr>` : '';
    }
    const [className, size, color] = KIND_STYLE[block.kind];
    return `<tr><td class="pad ${className}" style="padding:${top}px 40px ${bottom} 40px;font-size:${size};line-height:1.75;color:${color};overflow-wrap:anywhere">${inline(block.parts)}</td></tr>`;
  }).join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject || title)}</title>
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
      <tr><td class="pad ink" style="padding:28px 40px 0 40px;font-size:26px;line-height:1.3;font-weight:700;letter-spacing:-0.4px;color:#1a1a2e">${escapeHtml(title)}</td></tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td align="center" style="padding:24px 12px 0 12px;font-size:13px;line-height:1.6"><a class="lnk" href="${SITE}" style="color:${ACC};text-decoration:none">Open Noureon</a><span class="muted" style="color:#b4b4c0">&nbsp;&nbsp;・&nbsp;&nbsp;</span><a class="lnk" href="mailto:support@noureon.com" style="color:${ACC};text-decoration:none">Contact support</a></td></tr>
  <tr><td align="center" class="muted" style="padding:14px 12px 0 12px;font-size:12px;line-height:1.7;color:#9a9aaa">${FOOTER}</td></tr>
</table>
</td></tr></table>
</body>
</html>
`;
}
