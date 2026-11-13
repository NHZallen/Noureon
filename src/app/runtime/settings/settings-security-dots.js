// The small dot before each row of the security list (phone): green when the protection is set up and on, amber when it needs the person to prove themselves again (the sync
// vault or the keys of this device are locked), red when it is not set up. It reads what each card already shows, so there is no new request; the words of the three states
// are for the screen readers and the long press (a colour alone says nothing to everyone).

/** 'on', 'warn' or 'off' for the card of a page of the security list, or '' for a page with no state (the signed-in devices). */
export function securityStatus(id, section) {
  const find = (selector) => section.querySelector(selector);
  const shown = (element) => Boolean(element) && !element.classList.contains('hidden');
  switch (id) {
    case 'login': return shown(find('#login-password-row')) ? 'on' : 'off';
    case 'sync': {
      const state = find('#sync-vault-state');
      return state?.classList.contains('is-on') ? 'on' : state?.classList.contains('is-warn') ? 'warn' : 'off';
    }
    case 'passkey': return find('#security-passkey-list')?.children.length ? 'on' : 'off';
    case 'totp': return shown(find('#security-totp-on')) ? 'on' : 'off';
    case 'keyguard': return find('#security-keyguard-card')?.dataset.state || 'off';
    default: return '';
  }
}

export const STATUS_TEXT = {
  on: ['securityStatusOn', '已設定'],
  warn: ['securityStatusWarn', '需要重新認證'],
  off: ['securityStatusOff', '尚未設定']
};
