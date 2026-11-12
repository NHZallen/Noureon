// The authenticator app of the security page (docs/superpowers/specs/2026-11-12-vault-recovery-design.md, §4): the person sets it up (a QR code, or a key to type in, then a
// code of six digits), and once it is set up the code is asked for before the recovery of the sync password is changed, recovered or started over (`requireAal2`). It is
// Supabase's own TOTP factor of its multi-factor sign-in: a session that confirmed the code is "aal2", and the rules of the table of the recovery ask for that.

const CODE = /^\d{6}$/;

export function createAuthenticatorControls({ document, window, getSupabase, getCurrentUser, getElements, text, showNotification, notifyError, notifySecurity = () => {} }) {
  let factorId = null; // the confirmed factor
  let pendingId = null; // a factor being set up (not confirmed yet)
  let secret = '';
  let asking = null; // { resolve } while the code is asked for

  const isCloud = () => getCurrentUser?.()?.authProvider === 'supabase';
  const mfa = () => getSupabase()?.auth?.mfa || null;
  const show = (node, yes) => node?.classList.toggle('hidden', !yes);
  const digits = (value) => String(value || '').replace(/\D/g, '').slice(0, 6);

  const listFactors = async () => {
    const api = mfa();
    if (!api) return { all: [], totp: [] };
    const { data, error } = await api.listFactors();
    if (error) throw error;
    return { all: data?.all || [], totp: data?.totp || [] };
  };

  async function refresh() {
    const elements = getElements();
    if (!elements.totpCard) return;
    show(elements.totpCard, isCloud() && Boolean(mfa()));
    if (!isCloud() || !mfa()) return;
    try {
      const { totp } = await listFactors();
      factorId = totp.find((factor) => factor.status === 'verified')?.id || null;
    } catch (error) {
      globalThis.console?.warn?.('The authenticator state could not be read.', error);
    }
    const on = Boolean(factorId);
    const label = elements.totpState?.querySelector('.us-state-text');
    if (label) label.textContent = on ? text('securityTotpStateOn', '已啟用') : text('securityTotpStateOff', '未啟用');
    elements.totpState?.classList.toggle('is-on', on);
    show(elements.totpState, true);
    show(elements.totpOff, !on && !pendingId);
    show(elements.totpSetup, Boolean(pendingId));
    show(elements.totpOn, on && !pendingId);
  }

  // ----- asking for the code (before something the authenticator guards)
  const closeAsk = (result) => {
    const elements = getElements();
    show(elements.mfaChallenge, false);
    if (elements.mfaCode) elements.mfaCode.value = '';
    show(elements.mfaError, false);
    const current = asking;
    asking = null;
    current?.resolve(result);
  };

  /** Resolves true when nothing is asked or the code was confirmed, false when the person gave up. */
  async function requireAal2() {
    const api = mfa();
    if (!isCloud() || !api?.getAuthenticatorAssuranceLevel) return true;
    let level;
    try {
      level = (await api.getAuthenticatorAssuranceLevel()).data;
    } catch {
      return true; // not known here: the server and the rules of the table decide
    }
    if (!level || !(level.nextLevel === 'aal2' && level.currentLevel !== 'aal2')) return true;
    if (asking) return asking.promise;
    if (!factorId) await refresh();
    if (!factorId) return true;
    const elements = getElements();
    const promise = new Promise((resolve) => { asking = { resolve }; });
    asking.promise = promise;
    show(elements.mfaChallenge, true);
    elements.mfaChallenge?.scrollIntoView?.({ block: 'nearest' });
    elements.mfaCode?.focus?.();
    return promise;
  }

  async function confirmAsk() {
    const elements = getElements();
    const code = digits(elements.mfaCode?.value);
    if (!CODE.test(code)) {
      elements.mfaError.textContent = text('securityMfaBadCode', '請輸入六位數的驗證碼。');
      show(elements.mfaError, true);
      return;
    }
    const { error } = await mfa().challengeAndVerify({ factorId, code });
    if (error) {
      elements.mfaError.textContent = text('securityMfaWrongCode', '驗證碼不正確，請再試一次。');
      show(elements.mfaError, true);
      elements.mfaCode.value = '';
      elements.mfaCode.focus?.();
      return;
    }
    closeAsk(true);
  }

  // ----- setting it up and taking it away
  async function startSetup() {
    const api = mfa();
    const { all } = await listFactors();
    for (const factor of all) if (factor.factor_type === 'totp' && factor.status !== 'verified') await api.unenroll({ factorId: factor.id });
    const { data, error } = await api.enroll({ factorType: 'totp', friendlyName: `Noureon ${Date.now().toString(36)}`, issuer: 'Noureon' });
    if (error) throw error;
    const elements = getElements();
    pendingId = data.id;
    secret = String(data.totp?.secret || '');
    elements.totpQr.src = data.totp?.qr_code || '';
    elements.totpSecret.value = secret.replace(/(.{4})/g, '$1 ').trim();
    elements.totpCode.value = '';
    await refresh();
    elements.totpCode.focus?.();
  }

  async function cancelSetup() {
    const id = pendingId;
    pendingId = null;
    secret = '';
    if (id) await mfa()?.unenroll({ factorId: id });
    await refresh();
  }

  async function confirmSetup() {
    const code = digits(getElements().totpCode.value);
    if (!CODE.test(code)) throw new Error(text('securityMfaBadCode', '請輸入六位數的驗證碼。'));
    const { error } = await mfa().challengeAndVerify({ factorId: pendingId, code });
    if (error) throw new Error(text('securityMfaWrongCode', '驗證碼不正確，請再試一次。'));
    pendingId = null;
    secret = '';
    await refresh();
    notifySecurity('authenticator-added');
    showNotification(text('securityTotpEnabledNotice', '驗證器已啟用。'));
  }

  async function remove() {
    if (!window.confirm(text('securityTotpRemoveConfirm', '移除後，重設同步密碼與救援資料的變更不再需要驗證碼。確定要移除嗎？'))) return;
    if (!await requireAal2()) return;
    const { error } = await mfa().unenroll({ factorId });
    if (error) throw error;
    factorId = null;
    await refresh();
    notifySecurity('authenticator-removed');
    showNotification(text('securityTotpRemovedNotice', '驗證器已移除。'));
  }

  const guard = (task) => async (event) => {
    event?.preventDefault?.();
    try { await task(); } catch (error) { notifyError(error); }
  };

  function bind() {
    const elements = getElements();
    if (!elements.totpCard || elements.totpCard.dataset.bound === 'true') return;
    elements.totpCard.dataset.bound = 'true';
    elements.totpStart.addEventListener('click', guard(startSetup));
    elements.totpConfirm.addEventListener('click', guard(confirmSetup));
    elements.totpCancel.addEventListener('click', guard(cancelSetup));
    elements.totpRemove.addEventListener('click', guard(remove));
    elements.totpCopy.addEventListener('click', guard(async () => {
      await window.navigator.clipboard.writeText(secret);
      showNotification(text('securityTotpCopied', '已複製設定金鑰。'));
    }));
    elements.mfaConfirm.addEventListener('click', guard(confirmAsk));
    elements.mfaCancel.addEventListener('click', () => closeAsk(false));
    for (const input of [elements.totpCode, elements.mfaCode]) {
      input.addEventListener('input', () => { input.value = digits(input.value); });
    }
    elements.mfaCode.addEventListener('keydown', (event) => { if (event.key === 'Enter') guard(confirmAsk)(event); });
    elements.totpCode.addEventListener('keydown', (event) => { if (event.key === 'Enter') guard(confirmSetup)(event); });
  }

  /** Whether an authenticator app is set up and confirmed for this account. */
  async function isSet() {
    if (!isCloud() || !mfa()) return false;
    if (!factorId) await refresh();
    return Boolean(factorId);
  }

  return { bind, refresh, requireAal2, isSet };
}
