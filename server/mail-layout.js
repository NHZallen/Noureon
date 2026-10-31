// The look of the mails the server sends (the report mail to the owner of the service, the mail to the owner of a share that was taken down): one white card on a light ground, the mark and the
// name of Noureon on top, black and white like the product, with buttons for what the person may do. Mail clients read only inline styles and tables, so that is all this uses. Everything that
// is text of a person (a title, what a reader wrote) goes through `escapeHtml`; an address in a button must be https.

const LOGO = 'https://noureon.com/icon-192.png';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans TC', sans-serif";

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeHref = (href) => (/^https:\/\/[^\s"'<>]+$/.test(String(href)) ? String(href) : '');

const paragraph = (text) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#3f3f46;">${escapeHtml(text)}</p>`;

/**
 * The HTML of a mail. `heading`: the title; `intro` and `outro`: paragraphs before and after; `quote`: { label, text } a box that sets a title (or any words) apart; `details`: [[label, value]] rows of a
 * small table; `list`: { label, items } a short list; `buttons`: [{ label, href, primary }]; `footer`: one small line; `preheader`: the line some mail apps show beside the subject.
 */
export function renderMail({ preheader = '', heading, intro = [], quote = null, details = [], list = null, buttons = [], outro = [], footer = '' }) {
  const parts = [];
  parts.push(`<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:700;color:#111111;">${escapeHtml(heading)}</h1>`);
  for (const text of intro) parts.push(paragraph(text));
  if (quote?.text) {
    parts.push(`<div style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #111111;background:#f4f4f5;border-radius:0 8px 8px 0;">${quote.label ? `<div style="margin:0 0 4px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#71717a;">${escapeHtml(quote.label)}</div>` : ''}<div style="font-size:16px;line-height:1.5;font-weight:600;color:#111111;overflow-wrap:anywhere;">${escapeHtml(quote.text)}</div></div>`);
  }
  if (details.length) {
    parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:collapse;">${details.map(([label, value]) => `<tr><td style="padding:9px 0;border-top:1px solid #e4e4e7;width:34%;vertical-align:top;font-size:13px;color:#71717a;">${escapeHtml(label)}</td><td style="padding:9px 0;border-top:1px solid #e4e4e7;vertical-align:top;font-size:14px;color:#111111;overflow-wrap:anywhere;">${escapeHtml(value)}</td></tr>`).join('')}<tr><td colspan="2" style="border-top:1px solid #e4e4e7;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>`);
  }
  if (list?.items?.length) {
    parts.push(`<div style="margin:0 0 20px;">${list.label ? `<div style="margin:0 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#71717a;">${escapeHtml(list.label)}</div>` : ''}${list.items.map((item) => `<div style="margin:0 0 6px;padding:8px 12px;background:#f4f4f5;border-radius:8px;font-size:14px;line-height:1.5;color:#27272a;overflow-wrap:anywhere;">${escapeHtml(item)}</div>`).join('')}</div>`);
  }
  const links = buttons.filter((button) => safeHref(button.href));
  if (links.length) {
    parts.push(`<div style="margin:4px 0 24px;">${links.map((button) => `<a href="${escapeHtml(safeHref(button.href))}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;${button.primary ? 'background:#111111;color:#ffffff;border:1px solid #111111;' : 'background:#ffffff;color:#111111;border:1px solid #d4d4d8;'}">${escapeHtml(button.label)}</a>`).join('')}</div>`);
  }
  for (const text of outro) parts.push(paragraph(text));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(heading)}</title></head>`
    + `<body style="margin:0;padding:0;background:#f4f4f5;">`
    + (preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f4f4f5;">${escapeHtml(preheader)}</div>` : '')
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};">`
    + `<tr><td style="padding:0 4px 16px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle;padding-right:10px;"><img src="${LOGO}" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;"></td><td style="vertical-align:middle;font-size:19px;font-weight:700;letter-spacing:-.01em;color:#111111;">Noureon</td></tr></table></td></tr>`
    + `<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;padding:32px 30px 14px;">${parts.join('')}</td></tr>`
    + (footer ? `<tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.6;color:#71717a;">${escapeHtml(footer)}</td></tr>` : '')
    + `</table></td></tr></table></body></html>`;
}
