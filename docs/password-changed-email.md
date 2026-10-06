# 「登入密碼已變更」通知信（貼到 Supabase）

用途：使用者改登入密碼後，Supabase 會寄這封信到他的 Email（改密碼是不是由本人做的都會寄）。信裡的連結指向 `{{ .SiteURL }}/forgot-password`（現成的重設頁：輸入 Email、過驗證、收驗證碼），所以信裡不帶任何可以直接重設密碼的憑證。

設定位置：Supabase 後台 → Authentication → Emails，找「Password changed」（密碼已變更）的通知範本，開啟後貼上下面的主旨與內容。確認「Site URL」是 `https://noureon.com`。

主旨：

```
Noureon 登入密碼已變更 · Your Noureon password was changed
```

內容（HTML，五種語言放在同一封）：

```html
<div style="font-family:-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;color:#111;line-height:1.6">
  <h2 style="margin:0 0 8px">你的 Noureon 登入密碼已變更</h2>
  <p>帳號 {{ .Email }} 的登入密碼剛剛被更新。如果是你本人操作，不需要做任何事。</p>
  <p>如果不是你，請立即 <a href="{{ .SiteURL }}/forgot-password">重設密碼</a>。</p>
  <hr style="border:0;border-top:1px solid #e5e5e5;margin:20px 0">
  <h3 style="margin:0 0 6px">Your Noureon password was changed</h3>
  <p>The login password for {{ .Email }} was just updated. If this was you, no action is needed.</p>
  <p>If it was not you, <a href="{{ .SiteURL }}/forgot-password">reset your password</a> right away.</p>
  <hr style="border:0;border-top:1px solid #e5e5e5;margin:20px 0">
  <h3 style="margin:0 0 6px">Votre mot de passe Noureon a été modifié</h3>
  <p>Le mot de passe de connexion de {{ .Email }} vient d'être mis à jour. Si c'est vous, vous n'avez rien à faire.</p>
  <p>Sinon, <a href="{{ .SiteURL }}/forgot-password">réinitialisez votre mot de passe</a> immédiatement.</p>
  <hr style="border:0;border-top:1px solid #e5e5e5;margin:20px 0">
  <h3 style="margin:0 0 6px">Пароль Noureon изменён</h3>
  <p>Пароль для входа в аккаунт {{ .Email }} только что обновлён. Если это были вы, ничего делать не нужно.</p>
  <p>Если это были не вы, немедленно <a href="{{ .SiteURL }}/forgot-password">сбросьте пароль</a>.</p>
  <hr style="border:0;border-top:1px solid #e5e5e5;margin:20px 0">
  <h3 style="margin:0 0 6px">Tu contraseña de Noureon ha cambiado</h3>
  <p>La contraseña de inicio de sesión de {{ .Email }} se acaba de actualizar. Si fuiste tú, no tienes que hacer nada.</p>
  <p>Si no fuiste tú, <a href="{{ .SiteURL }}/forgot-password">restablece tu contraseña</a> de inmediato.</p>
</div>
```
