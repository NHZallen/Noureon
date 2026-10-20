import assert from 'node:assert/strict';
import test from 'node:test';

import { bindFeedbackForms } from '../src/app/runtime/features/feedback-forms.js';

function button() {
  const listeners = {};
  return { textContent: 'Send', disabled: false, addEventListener: (type, listener) => { listeners[type] = listener; }, click: () => listeners.click?.() };
}

function harness({ post = async () => {} } = {}) {
  const notes = [];
  const posted = [];
  const modals = [];
  const elements = {
    sendFeedbackBtn: button(), feedbackTextarea: { value: '' },
    proposeAstrasBtn: button(), cancelProposalBtn: button(), submitProposalBtn: button(),
    proposalNameInput: { value: '' }, proposalDescInput: { value: '' }, proposalInstructionsInput: { value: '' },
    astrasProposalModal: { id: 'proposal' }
  };
  bindFeedbackForms({
    window: {}, document: { documentElement: {} }, elements, i18n: { en: { feedbackSendFailed: 'Failed' } }, getConfig: () => ({ uiLanguage: 'en' }),
    toggleModal: (modal, open) => modals.push([modal.id, open]), showNotification: (text, type) => notes.push(type),
    postJsonWithReadableError: async (url, body) => { posted.push([url, body]); return post(); }, logger: { error() {} }
  });
  return { elements, notes, posted, modals };
}

test('feedback needs words, is sent to the form proxy, and the box is emptied', async () => {
  const h = harness();
  await h.elements.sendFeedbackBtn.click();
  assert.deepEqual(h.notes, ['warning']);
  assert.equal(h.posted.length, 0);
  h.elements.feedbackTextarea.value = '  Nice app ';
  await h.elements.sendFeedbackBtn.click();
  assert.equal(h.posted[0][0], '/api/google-form-submit');
  assert.equal(h.posted[0][1].formType, 'feedback');
  assert.equal(h.posted[0][1].message, 'Nice app');
  assert.equal(h.elements.feedbackTextarea.value, '');
  assert.equal(h.elements.sendFeedbackBtn.disabled, false);
  assert.equal(h.elements.sendFeedbackBtn.textContent, 'Send');
});

test('a failed send says so and gives the button back', async () => {
  const h = harness({ post: async () => { throw new Error('down'); } });
  h.elements.feedbackTextarea.value = 'Hi';
  await h.elements.sendFeedbackBtn.click();
  assert.deepEqual(h.notes, ['error']);
  assert.equal(h.elements.feedbackTextarea.value, 'Hi');
  assert.equal(h.elements.sendFeedbackBtn.disabled, false);
});

test('a Noura proposal needs a name and instructions and closes its dialog once sent', async () => {
  const h = harness();
  h.elements.proposeAstrasBtn.click();
  assert.deepEqual(h.modals, [['proposal', true]]);
  await h.elements.submitProposalBtn.click();
  assert.deepEqual(h.notes, ['warning']);
  h.elements.proposalNameInput.value = 'Coach';
  h.elements.proposalInstructionsInput.value = 'Be kind';
  await h.elements.submitProposalBtn.click();
  assert.equal(h.posted[0][1].formType, 'astra_proposal');
  assert.equal(h.posted[0][1].proposal_name, 'Coach');
  assert.deepEqual(h.modals.at(-1), ['proposal', false]);
});
