// The look of the mails the server sends (the report mail to the owner of the service, the mail to the owner of a share that was taken down). It follows the notification mails of the services Noureon's
// owner uses (Vercel, Linear): a plain white page, no card and no boxes, the small mark at the top left, a title, ordinary paragraphs, one black button, a thin line and a few grey words at the end,
// and the dark scheme of the mail app (black ground, light text, a light button). Mail clients read only inline styles and tables, so that is all this uses. Whatever a person wrote (a title, what a
// reader said) goes through `escapeHtml`; an address in a button must be https.

const SITE = 'https://noureon.com';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',Roboto,'Helvetica Neue',Arial,sans-serif";

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeHref = (href) => (/^https:\/\/[^\s"'<>]+$/.test(String(href)) ? String(href) : '');

/** A paragraph is a string, or an array of strings and { b: 'bold words' }. */
const inline = (parts) => [].concat(parts).map((part) => (typeof part === 'string' ? escapeHtml(part) : `<strong style="color:#171717;font-weight:600">${escapeHtml(part.b)}</strong>`)).join('');
const P = 'margin:0 0 16px 0;font-size:16px;line-height:1.5;color:#171717;overflow-wrap:anywhere';

/**
 * The HTML of a mail. `heading`: the title; `intro` and `outro`: paragraphs before and after; `details`: [[label, value]] lines ("Label: value"); `list`: { label, items } a short bulleted list;
 * `buttons`: [{ label, href }] (the first one is black, the others have an outline); `footer`: grey lines at the end; `preheader`: the line some mail apps show beside the subject.
 */
export function renderMail({ subject = '', preheader = '', heading, intro = [], details = [], list = null, buttons = [], outro = [], footer = [], contact = true }) {
  const parts = [];
  for (const text of intro) parts.push(`<p class="p" style="${P}">${inline(text)}</p>`);
  for (const [label, value] of details) parts.push(`<p class="p" style="margin:0 0 8px 0;font-size:16px;line-height:1.5;color:#171717;overflow-wrap:anywhere">${inline({ b: label })} ${escapeHtml(value)}</p>`);
  if (details.length) parts.push('<div style="height:8px;line-height:8px;font-size:0">&nbsp;</div>');
  if (list?.items?.length) {
    if (list.label) parts.push(`<p class="p" style="${P};margin-bottom:8px">${inline({ b: list.label })}</p>`);
    parts.push(`<ul style="margin:0 0 16px 0;padding-left:20px">${list.items.map((item) => `<li class="p" style="margin:0 0 4px 0;font-size:16px;line-height:1.6;color:#171717;overflow-wrap:anywhere">${escapeHtml(item)}</li>`).join('')}</ul>`);
  }
  const links = buttons.filter((button) => safeHref(button.href));
  if (links.length) {
    parts.push(`<div style="margin:32px 0">${links.map((button, index) => (index === 0
      ? `<a class="btn" href="${escapeHtml(safeHref(button.href))}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;background:#000000;color:#ffffff;border:1px solid #000000;border-radius:8px;font-size:16px;font-weight:500;line-height:1em;text-decoration:none;text-align:center">${escapeHtml(button.label)}</a>`
      : `<a class="btn-o" href="${escapeHtml(safeHref(button.href))}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;background:#ffffff;color:#171717;border:1px solid #e6e6e6;border-radius:8px;font-size:16px;font-weight:500;line-height:1em;text-decoration:none;text-align:center">${escapeHtml(button.label)}</a>`)).join('')}</div>`);
  }
  for (const text of outro) parts.push(`<p class="p" style="${P}">${inline(text)}</p>`);
  const footerLines = [...footer.map((line) => escapeHtml(line)), ...(contact ? [`Questions? Reply to this mail or write to <a class="fl" href="mailto:support@noureon.com" style="color:#7d7d7d;text-decoration:underline">support@noureon.com</a>.`] : []), `<a class="fl" href="${SITE}" style="color:#7d7d7d;text-decoration:underline">noureon.com</a>`];

  return `<!doctype html>
<html lang="en" style="color-scheme:light dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject || heading)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg, .bg td { background:#111111 !important; }
    .p, .p td, li.p { color:#ededed !important; }
    .h { color:#ffffff !important; }
    strong { color:#ffffff !important; }
    a.lk { color:#4da3ff !important; }
    .btn { background:#ededed !important; color:#0a0a0a !important; border-color:#ededed !important; }
    .btn-o { background:#111111 !important; color:#ededed !important; border-color:#333333 !important; }
    .hr { border-top-color:#333333 !important; }
    .fl, .ft { color:#7d7d7d !important; }
  }
  @media only screen and (max-width: 620px) { .outer { padding:32px 16px !important; } }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(preheader)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#ffffff"><tr><td class="outer" align="center" style="padding:32px 16px;background:#ffffff">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%"><tr><td style="font-family:${FONT};text-align:left;background:#ffffff" class="bg">
  <div style="margin-bottom:48px"><img src="${SITE}/icon-192.png" width="28" height="28" alt="Noureon" style="display:block;border:0"></div>
  <h1 class="h" style="margin:0 0 24px 0;padding:0;font-size:24px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;color:#171717">${escapeHtml(heading)}</h1>
  ${parts.join('\n  ')}
  <hr class="hr" style="margin:44px 0 32px 0;width:100%;border:none;border-top:1px solid #e6e6e6">
  ${footerLines.map((line) => `<p class="ft" style="margin:0 0 8px 0;font-size:14px;line-height:1.5;color:#7d7d7d;overflow-wrap:anywhere">${line}</p>`).join('\n  ')}
</td></tr></table>
</td></tr></table>
</body>
</html>
`;
}
