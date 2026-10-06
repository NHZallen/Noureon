# Generates the Supabase auth emails of Noureon (English only), all in one design: password changed, confirm sign-up, reset password
# (an 8-digit code), sync-password reset link ("Magic Link") and sign-in method linked.
# Run: python3 docs/email-templates/build-emails.py   (writes <name>.html and <name>.subject.txt next to this file)
# Only the variables Supabase gives every template are used: {{ .Email }}, {{ .SiteURL }}, {{ .ConfirmationURL }}, {{ .Token }}.
import os
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',Roboto,Helvetica,Arial,sans-serif"
ACC = '#5b4fcf'
MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace"

FOOTERS = {
  'notice': 'This is an automated security notice. We never ask for your password, verification codes or API keys by email.',
  'code': 'This is an automated message. Never share your code: Noureon will never ask you for it.',
  'plain': 'This is an automated message. If you were not expecting it, you can safely ignore it.',
}

def rule():
    return '<tr><td class="pad" style="padding:24px 40px 0 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="border-top:1px solid #ececf2;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>'

KIND_STYLE = {
  'p': ('tx', '15px', '#3c3c4e'),
  'small': ('tx', '14px', '#3c3c4e'),
  'muted': ('muted', '13px', '#7a7a8c'),
}

def top_padding(prev, kind):
    if prev == 'title': return 14
    if prev == 'rule': return 20 if kind == 'muted' else 22
    if kind == 'button': return 18
    if prev == 'button': return 24
    if kind == 'code': return 22
    if prev == 'code': return 20
    return 14

def block_row(prev, kind, content, last):
    pt = top_padding(prev, kind)
    pb = '36px' if last else '0'
    if kind in KIND_STYLE:
        cls, size, color = KIND_STYLE[kind]
        extra = ';word-break:break-all' if kind == 'muted' and 'ConfirmationURL' in content and '<a' not in content else ''
        return f'<tr><td class="pad {cls}" style="padding:{pt}px 40px {pb} 40px;font-size:{size};line-height:1.75;color:{color}{extra}">{content}</td></tr>'
    if kind == 'button':
        label, href = content
        return f'<tr><td class="pad" align="left" style="padding:{pt}px 40px {pb} 40px"><a class="btn-a" href="{href}" style="display:inline-block;padding:13px 26px;background:{ACC};color:#ffffff;font-size:15px;font-weight:600;line-height:1.3;text-decoration:none;border-radius:8px">{label}</a></td></tr>'
    if kind == 'code':
        return f'<tr><td class="pad" style="padding:{pt}px 40px {pb} 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="codebox ink" align="center" style="padding:20px 12px;background:#f6f6fa;border:1px solid #e4e4ec;border-radius:10px;font-family:{MONO};font-size:34px;line-height:1.2;font-weight:700;letter-spacing:8px;color:#1a1a2e">{content}</td></tr></table></td></tr>'
    raise ValueError(kind)

def build(subject, preheader, title, blocks, footer):
    rows = []
    prev = 'title'
    for i, (kind, content) in enumerate(blocks):
        last = i == len(blocks) - 1
        rows.append(rule() if kind == 'rule' else block_row(prev, kind, content, last))
        prev = kind
    body = '\n      '.join(rows)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{subject}</title>
<style>
  @media (prefers-color-scheme: dark) {{
    .bg {{ background:#101015 !important; }}
    .card {{ background:#1a1a22 !important; border-color:#2c2c38 !important; }}
    .ink {{ color:#f2f2f7 !important; }}
    .tx {{ color:#d2d2dd !important; }}
    .muted {{ color:#8d8d9b !important; }}
    .rule {{ border-color:#2c2c38 !important; }}
    .codebox {{ background:#22222c !important; border-color:#34343f !important; }}
    .lnk {{ color:#a59dff !important; }}
    .btn-a {{ background:#7468e8 !important; }}
  }}
  @media only screen and (max-width: 520px) {{
    .pad {{ padding-left:22px !important; padding-right:22px !important; }}
  }}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f4f4f8;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">{preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#f4f4f8"><tr><td align="center" style="padding:32px 14px 40px 14px">
<table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:540px;font-family:{FONT};text-align:left">
  <tr><td class="card" style="background:#ffffff;border:1px solid #e4e4ec;border-radius:12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td class="pad" style="padding:34px 40px 0 40px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle"><img src="https://noureon.com/icon-192.png" width="34" height="34" alt="" style="display:block;border:0;border-radius:17px"></td>
          <td valign="middle" class="ink" style="padding-left:10px;font-size:19px;font-weight:700;letter-spacing:-0.2px;color:#1a1a2e">Noureon</td>
        </tr></table>
      </td></tr>
      <tr><td class="pad ink" style="padding:28px 40px 0 40px;font-size:26px;line-height:1.3;font-weight:700;letter-spacing:-0.4px;color:#1a1a2e">{title}</td></tr>
      {body}
    </table>
  </td></tr>
  <tr><td align="center" style="padding:24px 12px 0 12px;font-size:13px;line-height:1.6"><a class="lnk" href="{{{{ .SiteURL }}}}" style="color:{ACC};text-decoration:none">Open Noureon</a><span class="muted" style="color:#b4b4c0">&nbsp;&nbsp;・&nbsp;&nbsp;</span><a class="lnk" href="mailto:support@noureon.com" style="color:{ACC};text-decoration:none">Contact support</a></td></tr>
  <tr><td align="center" class="muted" style="padding:14px 12px 0 12px;font-size:12px;line-height:1.7;color:#9a9aaa">{FOOTERS[footer]}</td></tr>
</table>
</td></tr></table>
</body>
</html>
'''

EMAILS = {
 'password-changed': dict(
   subject='Your Noureon password was changed',
   preheader="If this wasn't you, reset your password right away.",
   title='Your login password was updated',
   footer='notice',
   blocks=[
     ('p', 'The login password for <strong>{{ .Email }}</strong> was just updated.'),
     ('rule', None),
     ('p', '<strong>If this was you</strong>, there is nothing to do. If you chose “sign out of all devices” when updating, every device, including the one you used, will need to sign in again with the new password.'),
     ('p', "<strong>If this wasn't you</strong>, reset your password right away:"),
     ('button', ('Reset password', '{{ .SiteURL }}/forgot-password')),
     ('small', 'We send a verification code to this mailbox, so only you can finish the reset. Afterwards, open Settings → User, change the password once more and tick “sign out of all devices after updating” to end any sign-ins you do not recognize. If you use the same password on other services, change it there too.'),
     ('rule', None),
     ('muted', 'The login password and the “sync password” are two different passwords. Your API keys are encrypted with the sync password and unlocked only on your devices, so changing the login password does not affect them.'),
   ]),
 'confirm-signup': dict(
   subject='Confirm your email for Noureon',
   preheader='Confirm your email address to finish creating your Noureon account.',
   title='Confirm your email',
   footer='plain',
   blocks=[
     ('p', 'Welcome to Noureon. Confirm that <strong>{{ .Email }}</strong> is your email address to finish creating your account.'),
     ('button', ('Confirm email', '{{ .ConfirmationURL }}')),
     ('small', 'Once your email is confirmed, you can sign in with it and use cloud sync with this account.'),
     ('rule', None),
     ('muted', 'Button not working? Copy this link into your browser:'),
     ('muted', '{{ .ConfirmationURL }}'),
     ('muted', 'If you did not sign up for Noureon, you can ignore this email.'),
   ]),
 'reset-password': dict(
   subject='Your Noureon password reset code',
   preheader='Your 8-digit code to reset your Noureon password.',
   title='Your password reset code',
   footer='code',
   blocks=[
     ('p', 'Enter this code on the Noureon password reset page to continue resetting the password for <strong>{{ .Email }}</strong>.'),
     ('code', '{{ .Token }}'),
     ('small', 'The code can be used once and expires after a short time.'),
     ('rule', None),
     ('muted', 'If you did not ask to reset your password, you can ignore this email. Your password stays the same.'),
   ]),
 'magic-link': dict(
   subject="Confirm it's you to reset your Noureon sync password",
   preheader='Use this link to choose a new sync password.',
   title="Confirm it's you",
   footer='plain',
   blocks=[
     ('p', 'Someone asked to reset the sync password for <strong>{{ .Email }}</strong>. Confirm it is you to continue.'),
     ('button', ('Continue', '{{ .ConfirmationURL }}')),
     ('small', 'Open the link in the same browser where you asked for the reset. It brings you back to Noureon, where you choose a new sync password. Your encrypted sync data is kept.'),
     ('rule', None),
     ('muted', 'Button not working? Copy this link into your browser:'),
     ('muted', '{{ .ConfirmationURL }}'),
     ('muted', 'If you did not ask for this, you can ignore this email. Nothing changes unless you open the link.'),
   ]),
 'identity-linked': dict(
   subject='A new sign-in method was added to your Noureon account',
   preheader="If this wasn't you, reset your password and contact support.",
   title='A sign-in method was added',
   footer='notice',
   blocks=[
     ('p', 'A new way to sign in, such as Google or an email and password, was just linked to <strong>{{ .Email }}</strong>.'),
     ('rule', None),
     ('p', '<strong>If this was you</strong>, there is nothing to do.'),
     ('p', "<strong>If this wasn't you</strong>, reset your password right away:"),
     ('button', ('Reset password', '{{ .SiteURL }}/forgot-password')),
     ('small', 'Then write to <a href="mailto:support@noureon.com" style="color:#5b4fcf;text-decoration:underline">support@noureon.com</a> so we can help you secure the account. Never include API keys or sync passwords in your message.'),
   ]),
}

if __name__ == '__main__':
    for name, e in EMAILS.items():
        html = build(e['subject'], e['preheader'], e['title'], e['blocks'], e['footer'])
        with open(os.path.join(HERE, name + '.html'), 'w') as f: f.write(html)
        with open(os.path.join(HERE, name + '.subject.txt'), 'w') as f: f.write(e['subject'])
        print(name, len(html.encode()), 'bytes')
