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

const CLICKABLE = new Set(['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch']);
const any = (list, name) => list.some((pattern) => pattern.test(name));

/** Whether the page takes a card (the elements of a snapshot). */
export const pageTakesCard = (elements) => (Array.isArray(elements) ? elements : []).some((element) => ['textbox', 'searchbox', 'combobox', 'spinbutton', 'password field'].includes(element.role) && CARD_FIELD.test(String(element.name || '')));

/**
 * What the click on this element is, or null when it is an ordinary click: 'payment', 'delete' or 'change'. `element`: { role, name } from the snapshot; `page`: { takesCard }.
 */
export function tripwireFor(element, page = {}) {
  if (!element || !CLICKABLE.has(element.role)) return null;
  const name = String(element.name || '').trim();
  if (!name || name.length > 120) return null;
  if (any(PAY, name)) return 'payment';
  if (any(DELETE, name)) return 'delete';
  if (any(CHANGE, name)) return 'change';
  if (page.takesCard && element.role === 'button' && any(SEND, name)) return 'payment';
  return null;
}

/** A download that can run on the person's computer: asked about before it is kept. */
export const EXECUTABLE_FILE = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|jar|apk|dmg|pkg|app|sh|run|deb|rpm)$/i;
