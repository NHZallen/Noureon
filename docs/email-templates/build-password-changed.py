# Generates password-changed.html and password-changed.subject.txt (the "password changed" email for Supabase).
# The texts of the five languages are in S below; each one becomes a Go-template conditional on the user's `language` metadata
# (zh-TW when it is missing or unknown). Run: python3 docs/email-templates/build-password-changed.py
import os
HERE = os.path.dirname(os.path.abspath(__file__))
S = {
'subject': dict(zh='你的 Noureon 登入密碼已更新', en='Your Noureon password was changed', fr='Votre mot de passe Noureon a été modifié', ru='Пароль Noureon изменён', es='Tu contraseña de Noureon ha cambiado'),
'preheader': dict(zh='如果不是你本人操作，請立即重設密碼。', en="If this wasn't you, reset your password right away.", fr="Si ce n'est pas vous, réinitialisez votre mot de passe immédiatement.", ru='Если это были не вы, сразу сбросьте пароль.', es='Si no fuiste tú, restablece tu contraseña de inmediato.'),
'title': dict(zh='你的登入密碼已更新', en='Your login password was updated', fr='Votre mot de passe de connexion a été mis à jour', ru='Пароль для входа обновлён', es='Tu contraseña de inicio de sesión se actualizó'),
'intro': dict(zh='帳號 <strong>{{ .Email }}</strong> 的登入密碼剛剛被更新。', en='The login password for <strong>{{ .Email }}</strong> was just updated.', fr='Le mot de passe de connexion de <strong>{{ .Email }}</strong> vient d\'être mis à jour.', ru='Пароль для входа в аккаунт <strong>{{ .Email }}</strong> только что обновлён.', es='La contraseña de inicio de sesión de <strong>{{ .Email }}</strong> se acaba de actualizar.'),
'fine': dict(zh='<strong>如果是你本人操作</strong>，不需要做任何事。如果你更新時勾選了「登出所有裝置」，所有裝置（包含你正在用的這台）都需要用新密碼重新登入。', en='<strong>If this was you</strong>, there is nothing to do. If you chose “sign out of all devices” when updating, every device, including the one you used, will need to sign in again with the new password.', fr='<strong>Si c\'était vous</strong>, vous n\'avez rien à faire. Si vous avez choisi « Se déconnecter de tous les appareils » lors de la mise à jour, chaque appareil, y compris celui que vous avez utilisé, devra se reconnecter avec le nouveau mot de passe.', ru='<strong>Если это были вы</strong>, ничего делать не нужно. Если при обновлении вы выбрали «Выйти на всех устройствах», на каждом устройстве, включая то, с которого вы меняли пароль, придётся войти заново с новым паролем.', es='<strong>Si fuiste tú</strong>, no tienes que hacer nada. Si al actualizar elegiste «Cerrar sesión en todos los dispositivos», cada dispositivo, incluido el que usaste, tendrá que iniciar sesión de nuevo con la nueva contraseña.'),
'notyou': dict(zh='<strong>如果不是你本人操作</strong>，請立即重設密碼：', en='<strong>If this wasn\'t you</strong>, reset your password right away:', fr='<strong>Si ce n\'était pas vous</strong>, réinitialisez votre mot de passe immédiatement :', ru='<strong>Если это были не вы</strong>, немедленно сбросьте пароль:', es='<strong>Si no fuiste tú</strong>, restablece tu contraseña de inmediato:'),
'button': dict(zh='重設密碼', en='Reset password', fr='Réinitialiser le mot de passe', ru='Сбросить пароль', es='Restablecer contraseña'),
'after': dict(zh='重設時會寄一組驗證碼到這個信箱，只有你收得到。重設後，請到「設定 → 使用者」再改一次登入密碼，並勾選「更新後登出所有裝置」，把不明的登入全部登出。如果你在其他服務也用同一組密碼，也請一併更換。', en='We send a verification code to this mailbox, so only you can finish the reset. Afterwards, open Settings → User, change the password once more and tick “sign out of all devices after updating” to end any sign-ins you do not recognize. If you use the same password on other services, change it there too.', fr='Un code de vérification est envoyé à cette boîte mail : vous seul pouvez terminer la réinitialisation. Ensuite, ouvrez Paramètres → Utilisateur, modifiez à nouveau le mot de passe et cochez « Se déconnecter de tous les appareils après la mise à jour » pour fermer toute connexion inconnue. Si vous utilisez le même mot de passe ailleurs, changez-le aussi.', ru='Код подтверждения придёт на эту почту, поэтому завершить сброс сможете только вы. Затем откройте «Настройки → Пользователь», смените пароль ещё раз и отметьте «После обновления выйти на всех устройствах», чтобы завершить все незнакомые сеансы. Если вы используете этот же пароль в других сервисах, смените его и там.', es='Enviamos un código de verificación a este correo, así que solo tú puedes completar el restablecimiento. Después, ve a Configuración → Usuario, cambia la contraseña otra vez y marca «Cerrar sesión en todos los dispositivos tras actualizar» para cerrar cualquier sesión que no reconozcas. Si usas la misma contraseña en otros servicios, cámbiala también allí.'),
'keys': dict(zh='登入密碼和「同步密碼」是兩組不同的密碼。你的 API 金鑰由同步密碼加密、只在你的裝置上解開，更改登入密碼不會動到它。', en='The login password and the “sync password” are two different passwords. Your API keys are encrypted with the sync password and unlocked only on your devices, so changing the login password does not affect them.', fr='Le mot de passe de connexion et le « mot de passe de synchronisation » sont deux mots de passe différents. Vos clés API sont chiffrées avec le mot de passe de synchronisation et ne sont déverrouillées que sur vos appareils : changer le mot de passe de connexion ne les touche pas.', ru='Пароль для входа и «пароль синхронизации» — два разных пароля. Ваши ключи API зашифрованы паролем синхронизации и расшифровываются только на ваших устройствах, поэтому смена пароля для входа их не затрагивает.', es='La contraseña de inicio de sesión y la «contraseña de sincronización» son dos contraseñas distintas. Tus claves de API se cifran con la contraseña de sincronización y solo se descifran en tus dispositivos, así que cambiar la de inicio de sesión no las afecta.'),
'open': dict(zh='開啟 Noureon', en='Open Noureon', fr='Ouvrir Noureon', ru='Открыть Noureon', es='Abrir Noureon'),
'support': dict(zh='聯絡支援', en='Contact support', fr='Contacter le support', ru='Связаться с поддержкой', es='Contactar con soporte'),
'footer': dict(zh='這是自動寄出的安全通知。我們不會在信中要求你提供密碼、驗證碼或 API 金鑰。', en='This is an automated security notice. We never ask for your password, verification codes or API keys by email.', fr='Ceci est une alerte de sécurité automatique. Nous ne vous demandons jamais votre mot de passe, vos codes de vérification ni vos clés API par e-mail.', ru='Это автоматическое уведомление безопасности. Мы никогда не просим по почте пароль, коды подтверждения или ключи API.', es='Este es un aviso de seguridad automático. Nunca te pedimos por correo tu contraseña, códigos de verificación ni claves de API.'),
}
def t(key):
    d=S[key]
    return '{{ if eq $lang "en" }}'+d['en']+'{{ else if eq $lang "fr" }}'+d['fr']+'{{ else if eq $lang "ru" }}'+d['ru']+'{{ else if eq $lang "es" }}'+d['es']+'{{ else }}'+d['zh']+'{{ end }}'
FONT="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Noto Sans TC','Microsoft JhengHei',Roboto,Helvetica,Arial,sans-serif"
ACC='#5b4fcf'
TEMPLATE=f'''{{{{ $lang := printf "%v" .Data.language }}}}<!doctype html>
<html lang="{{{{ if eq $lang "en" }}}}en{{{{ else if eq $lang "fr" }}}}fr{{{{ else if eq $lang "ru" }}}}ru{{{{ else if eq $lang "es" }}}}es{{{{ else }}}}zh-Hant{{{{ end }}}}">
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
subj='{{ $lang := printf "%v" .Data.language }}{{ if eq $lang "en" }}'+S['subject']['en']+'{{ else if eq $lang "fr" }}'+S['subject']['fr']+'{{ else if eq $lang "ru" }}'+S['subject']['ru']+'{{ else if eq $lang "es" }}'+S['subject']['es']+'{{ else }}'+S['subject']['zh']+'{{ end }}'
open(os.path.join(HERE, 'password-changed.subject.txt'),'w').write(subj)
print(len(TEMPLATE.encode()),'bytes')
