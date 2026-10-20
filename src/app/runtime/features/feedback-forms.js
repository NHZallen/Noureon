// The feedback form and the Noura proposal form of the settings: both are sent to the same-origin form proxy behind a Cloudflare
// Turnstile check when one is configured.

import { createTurnstileClient } from '../security/turnstile-client.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';

export function bindFeedbackForms({ window, document, elements: ALL_ELEMENTS, i18n, getConfig, toggleModal, showNotification, postJsonWithReadableError, logger }) {
    const turnstile = createTurnstileClient({ window, document });
    const getTurnstileRequiredMessage = () => i18n[getConfig().uiLanguage]?.turnstileRequired || '請完成安全驗證後再送出。';
    const mountTurnstile = (name, anchorElement) => {
        if (!turnstile.enabled) return;
        turnstile.mount(name, anchorElement).catch((error) => {
            logger.error('Cloudflare Turnstile failed to initialize:', error);
            showNotification(i18n[getConfig().uiLanguage]?.turnstileLoadError || '安全驗證載入失敗，請重新整理後再試。', 'error');
        });
    };
    mountTurnstile('feedback', ALL_ELEMENTS.sendFeedbackBtn);
    ALL_ELEMENTS.sendFeedbackBtn.addEventListener('click', async () => {
        const feedbackContent = ALL_ELEMENTS.feedbackTextarea.value.trim();
        const sendButton = ALL_ELEMENTS.sendFeedbackBtn;
        const turnstileToken = turnstile.getToken('feedback');

        if (!feedbackContent) {
            showNotification(getRuntimeText(getConfig().uiLanguage, 'feedbackRequired'), 'warning');
            return;
        }
        if (turnstile.enabled && !turnstileToken) {
            showNotification(getTurnstileRequiredMessage(), 'warning');
            return;
        }

        // Send through the optional same-origin form proxy.
        const FORM_ENDPOINT = '/api/google-form-submit';

        const originalButtonText = sendButton.textContent;
        sendButton.disabled = true;
        sendButton.textContent = getRuntimeText(getConfig().uiLanguage, 'sending');

        try {
            // ✨ 準備要發送的資料，並加入 formType 讓後台知道這是意見反饋
            const dataToSend = {
                formType: 'feedback', // <-- 關鍵識別碼！
                subject: '來自 Noureon 的新意見反饋',
                timestamp: new Date().toISOString(),
                message: feedbackContent,
                ...(turnstileToken ? { turnstileToken } : {})
            };

            await postJsonWithReadableError(FORM_ENDPOINT, dataToSend, { allowOpaqueFallback: false });

            showNotification(getRuntimeText(getConfig().uiLanguage, 'feedbackSent'), 'success');
            ALL_ELEMENTS.feedbackTextarea.value = '';

        } catch (error) {
            logger.error('發送反饋時出錯:', error);
            const message = String(error?.message || '');
            showNotification(
                message.includes('Google form endpoint is not configured')
                ? i18n[getConfig().uiLanguage].feedbackEndpointMissing
                : i18n[getConfig().uiLanguage].feedbackSendFailed,
                'error'
            );
        } finally {
            turnstile.reset('feedback');
            sendButton.disabled = false;
            sendButton.textContent = originalButtonText;
        }
    });
    ALL_ELEMENTS.proposeAstrasBtn.addEventListener('click', () => {
        ALL_ELEMENTS.proposalNameInput.value = '';
        ALL_ELEMENTS.proposalDescInput.value = '';
        ALL_ELEMENTS.proposalInstructionsInput.value = '';
        toggleModal(ALL_ELEMENTS.astrasProposalModal, true);
        mountTurnstile('astra-proposal', ALL_ELEMENTS.submitProposalBtn);
    });

    ALL_ELEMENTS.cancelProposalBtn.addEventListener('click', () => {
        toggleModal(ALL_ELEMENTS.astrasProposalModal, false);
    });

    ALL_ELEMENTS.submitProposalBtn.addEventListener('click', async () => {
        const name = ALL_ELEMENTS.proposalNameInput.value.trim();
        const description = ALL_ELEMENTS.proposalDescInput.value.trim();
        const instructions = ALL_ELEMENTS.proposalInstructionsInput.value.trim();
        const submitButton = ALL_ELEMENTS.submitProposalBtn;
        const turnstileToken = turnstile.getToken('astra-proposal');

        if (!name || !instructions) {
            showNotification(getRuntimeText(getConfig().uiLanguage, 'proposalRequired'), 'warning');
            return;
        }
        if (turnstile.enabled && !turnstileToken) {
            showNotification(getTurnstileRequiredMessage(), 'warning');
            return;
        }

        // Send through the optional same-origin form proxy.
        const FORM_ENDPOINT = '/api/google-form-submit';

        const originalButtonText = submitButton.textContent;
        submitButton.disabled = true;
        submitButton.textContent = getRuntimeText(getConfig().uiLanguage, 'submitting');

        try {
            // 準備要發送的資料，並加入 formType 讓後台知道這是 Noura 提案
            const dataToSend = {
                formType: 'astra_proposal', // <-- 關鍵識別碼！
                subject: `新的 Noura 提案: ${name}`,
                timestamp: new Date().toISOString(),
                proposal_name: name,
                proposal_desc: description,
                proposal_instructions: instructions,
                ...(turnstileToken ? { turnstileToken } : {})
            };

            await postJsonWithReadableError(FORM_ENDPOINT, dataToSend, { allowOpaqueFallback: false });

            toggleModal(ALL_ELEMENTS.astrasProposalModal, false);
            showNotification(getRuntimeText(getConfig().uiLanguage, 'proposalSent'), 'success');

        } catch (error) {
            logger.error('提交提案時出錯:', error);
            const message = String(error?.message || '');
            showNotification(
                message.includes('Google form endpoint is not configured')
                ? i18n[getConfig().uiLanguage].proposalEndpointMissing
                : i18n[getConfig().uiLanguage].proposalSendFailed,
                'error'
            );
        } finally {
            turnstile.reset('astra-proposal');
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
    });
}
