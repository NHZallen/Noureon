# Generates password-changed.html and password-changed.subject.txt (the "password changed" email for Supabase).
# English only (Supabase has one template per email, and the owner chose English). The texts are in S below. Run: python3 docs/email-templates/build-password-changed.py
import os
HERE = os.path.dirname(os.path.abspath(__file__))
S = {
  "subject": "Your Noureon password was changed",
  "preheader": "If this wasn't you, reset your password right away.",
  "title": "Your login password was updated",
  "intro": "The login password for <strong>{{ .Email }}</strong> was just updated.",
  "fine": "<strong>If this was you</strong>, there is nothing to do. If you chose “sign out of all devices” when updating, every device, including the one you used, will need to sign in again with the new password.",
  "notyou": "<strong>If this wasn't you</strong>, reset your password right away:",
  "button": "Reset password",
  "after": "We send a verification code to this mailbox, so only you can finish the reset. Afterwards, open Settings → User, change the password once more and tick “sign out of all devices after updating” to end any sign-ins you do not recognize. If you use the same password on other services, change it there too.",
  "keys": "The login password and the “sync password” are two different passwords. Your API keys are encrypted with the sync password and unlocked only on your devices, so changing the login password does not affect them.",
  "open": "Open Noureon",
  "support": "Contact support",
  "footer": "This is an automated security notice. We never ask for your password, verification codes or API keys by email.",
}
def t(key):
    return S[key]
FONT="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',Roboto,Helvetica,Arial,sans-serif"
ACC='#5b4fcf'
TEMPLATE=f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{t('subject')}</title>
<style>
  @media (prefers-color-scheme: dark) {{
    .bg {{ background:#101015 !important; }}
    .card {{ background:#1a1a22 !important; border-color:#2c2c38 !important; }}
    .ink {{ color:#f2f2f7 !important; }}
    .tx {{ color:#d2d2dd !important; }}
    .muted {{ color:#8d8d9b !important; }}
    .rule {{ border-color:#2c2c38 !important; }}
    .lnk {{ color:#a59dff !important; }}
    .btn-a {{ background:#7468e8 !important; }}
  }}
  @media only screen and (max-width: 520px) {{
    .pad {{ padding-left:22px !important; padding-right:22px !important; }}
  }}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f4f4f8;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">{t('preheader')}</div>
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
      <tr><td class="pad ink" style="padding:28px 40px 0 40px;font-size:26px;line-height:1.3;font-weight:700;letter-spacing:-0.4px;color:#1a1a2e">{t('title')}</td></tr>
      <tr><td class="pad tx" style="padding:14px 40px 0 40px;font-size:15px;line-height:1.75;color:#3c3c4e">{t('intro')}</td></tr>
      <tr><td class="pad" style="padding:24px 40px 0 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="border-top:1px solid #ececf2;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
      <tr><td class="pad tx" style="padding:22px 40px 0 40px;font-size:15px;line-height:1.75;color:#3c3c4e">{t('fine')}</td></tr>
      <tr><td class="pad tx" style="padding:14px 40px 0 40px;font-size:15px;line-height:1.75;color:#3c3c4e">{t('notyou')}</td></tr>
      <tr><td class="pad" align="left" style="padding:18px 40px 0 40px"><a class="btn-a" href="{{{{ .SiteURL }}}}/forgot-password" style="display:inline-block;padding:13px 26px;background:{ACC};color:#ffffff;font-size:15px;font-weight:600;line-height:1.3;text-decoration:none;border-radius:8px">{t('button')}</a></td></tr>
      <tr><td class="pad tx" style="padding:24px 40px 0 40px;font-size:14px;line-height:1.75;color:#3c3c4e">{t('after')}</td></tr>
      <tr><td class="pad" style="padding:24px 40px 0 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="border-top:1px solid #ececf2;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
      <tr><td class="pad muted" style="padding:20px 40px 36px 40px;font-size:13px;line-height:1.75;color:#7a7a8c">{t('keys')}</td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:24px 12px 0 12px;font-size:13px;line-height:1.6"><a class="lnk" href="{{{{ .SiteURL }}}}" style="color:{ACC};text-decoration:none">{t('open')}</a><span class="muted" style="color:#b4b4c0">&nbsp;&nbsp;・&nbsp;&nbsp;</span><a class="lnk" href="mailto:support@noureon.com" style="color:{ACC};text-decoration:none">{t('support')}</a></td></tr>
  <tr><td align="center" class="muted" style="padding:14px 12px 0 12px;font-size:12px;line-height:1.7;color:#9a9aaa">{t('footer')}</td></tr>
</table>
</td></tr></table>
</body>
</html>
'''
open(os.path.join(HERE, 'password-changed.html'),'w').write(TEMPLATE)
subj=S['subject']
open(os.path.join(HERE, 'password-changed.subject.txt'),'w').write(subj)
print(len(TEMPLATE.encode()),'bytes')
