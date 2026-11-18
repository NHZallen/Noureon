// The tripwire of the browser agent (design doc §5): besides the model asking for a confirmation itself, the server asks before a click that looks like paying, deleting, or changing an
// account, whatever the model thought. It looks at the name of the thing that is clicked (from the snapshot the model works from) and at the page; it would rather miss a case than stop
// an ordinary click, so only buttons and links whose name is plainly one of these words count. The words are in the five languages of the product.

const PAY = [
  /\b(pay|pay now|payment|purchase|buy now|place (your |my )?order|complete (your |my )?(order|purchase)|confirm (your |my )?(order|purchase|payment)|checkout|subscribe|donate)\b/i,
  /(付款|支付|購買|立即購買|下單|結帳|結賬|確認訂單|確認付款|訂閱|捐款)/,
  /\b(payer|acheter|commander|valider (la |votre )?commande|confirmer (la |votre )?commande|s'abonner|faire un don)\b/i,
  /(оплатить|купить|заказать|оформить заказ|подтвердить заказ|подписаться|пожертвовать)/i,
  /\b(pagar|comprar|realizar (el )?pedido|confirmar (el )?(pedido|pago|compra)|suscribirse|donar)\b/i
];
const DELETE = [
  /\b(delete|remove account|close account|deactivate|terminate (my )?account|erase)\b/i,
  /(刪除|移除帳號|關閉帳號|停用帳號|註銷|註銷帳號)/,
  /\b(supprimer|désactiver|fermer (le )?compte)\b/i,
  /(удалить|закрыть аккаунт|деактивировать|удалить аккаунт)/i,
  /\b(eliminar|borrar|cerrar (la )?cuenta|desactivar)\b/i
];
const CHANGE = [
  /\b(change|reset|update) (your |my )?(password|email)\b/i,
  /(變更密碼|修改密碼|更改密碼|重設密碼|變更信箱|更改電子郵件|修改電子郵件)/,
  /\b(changer|modifier|réinitialiser) (le |votre )?(mot de passe|e-?mail)\b/i,
  /(сменить пароль|изменить пароль|сбросить пароль|изменить почту)/i,
  /\b(cambiar|restablecer|actualizar) (la |tu )?(contraseña|correo)\b/i
];
// A card number, a security code: the page takes a card.
const CARD_FIELD = /(card number|cardnumber|credit card|cvc|cvv|security code|卡號|信用卡|安全碼|numéro de carte|номер карты|número de tarjeta)/i;
// On a page that takes a card, a button that sends the form counts as paying, whatever it says.
const SEND = [/\b(submit|continue|complete|confirm|place|send)\b/i, /(送出|提交|完成|確認|繼續)/, /\b(envoyer|valider|continuer|confirmer)\b/i, /(отправить|подтвердить|продолжить|завершить)/i, /\b(enviar|continuar|confirmar|completar)\b/i];

// A button with a general name (Submit, OK, 送出) is what the page around it is about: on a page about deleting or paying it is that, whatever it says. Looked at only for such names.
const GENERIC_NAME = /^(submit|send|confirm|ok|okay|yes|continue|proceed|apply|done|go|送出|提交|確認|確定|好|是|繼續|完成|送信|envoyer|valider|confirmer|continuer|oui|отправить|подтвердить|продолжить|да|enviar|confirmar|continuar|aceptar|sí|si)[\s.!。！]*$/i;
const ABOUT_DELETE = [
  /\b(delete|erase|deactivate|close|terminate|cancel)(s|ing)? (your |my |the |this )?(account|order|subscription|membership|booking|reservation|profile|data)\b/i,
  /\b(permanently deleted?|cannot be undone|can(not|'t) be undone)\b/i,
  /(刪除|取消(訂單|訂閱|帳號|會員|預約|這筆|此)|註銷|無法復原|無法還原)/,
  /\b(supprimer|annuler|désactiver|fermer) (le |la |l'|votre |mon |ma )?(compte|commande|abonnement|réservation)\b/i,
  /(удалить|отменить|закрыть) (аккаунт|заказ|подписку|бронь|учётную запись|профиль)/i,
  /\b(eliminar|borrar|cancelar|cerrar|desactivar) (la |el |tu |mi )?(cuenta|pedido|suscripción|reserva)\b/i
];
const ABOUT_PAY = [
  /\b(checkout|payment|pay now|order total|total to pay|amount due|place (your |my )?order)\b/i,
  /(付款|支付|結帳|結賬|訂單總額|應付金額)/,
  /\b(paiement|régler|total à payer|passer la commande)\b/i,
  /(оплата|оплатить|итого к оплате|оформление заказа)/i,
  /\b(pago|pagar|total a pagar|finalizar (la )?compra)\b/i
];

const CLICKABLE = new Set(['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch']);
const any = (list, name) => list.some((pattern) => pattern.test(name));

/** Whether the page takes a card (the elements of a snapshot). */
export const pageTakesCard = (elements) => (Array.isArray(elements) ? elements : []).some((element) => ['textbox', 'searchbox', 'combobox', 'spinbutton', 'password field'].includes(element.role) && CARD_FIELD.test(String(element.name || '')));

/** What the page is about when it is about deleting or paying ('delete', 'payment') or null: its title and text (a page of a snapshot). */
export function pageSubject(page) {
  const text = `${page?.title || ''}\n${page?.text || ''}`.slice(0, 12_000);
  if (any(ABOUT_DELETE, text)) return 'delete';
  if (any(ABOUT_PAY, text)) return 'payment';
  return null;
}

/**
 * What the click on this element is, or null when it is an ordinary click: 'payment', 'delete' or 'change'. `element`: { role, name } from the snapshot; `page`: { takesCard, subject }.
 */
export function tripwireFor(element, page = {}) {
  if (!element || !CLICKABLE.has(element.role)) return null;
  const name = String(element.name || '').trim();
  if (!name || name.length > 120) return null;
  if (any(PAY, name)) return 'payment';
  if (any(DELETE, name)) return 'delete';
  if (any(CHANGE, name)) return 'change';
  if (page.takesCard && element.role === 'button' && any(SEND, name)) return 'payment';
  if (page.subject && element.role === 'button' && GENERIC_NAME.test(name)) return page.subject;
  return null;
}

/** A download that can run on the person's computer: asked about before it is kept. */
export const EXECUTABLE_FILE = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|jar|apk|dmg|pkg|app|sh|run|deb|rpm)$/i;
