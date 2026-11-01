// Speech to text in the Models settings, below the API keys (docs/superpowers/specs/2026-11-02-chat-video-audio-design.md, §3): one card (ui/memory-notes/transcription-card.js) in the section of the
// models. It is off until the person reads where the sound goes and agrees; it does not depend on the memory. Drawn again whenever the settings are opened (the keys may have changed).

import { renderTranscriptionCard } from '../../ui/memory-notes/transcription-card.js';

const CARD_ID = 'speech-settings-card';

export function createSpeechSettings({ document, getTranscription = () => null, saveConfig = async () => {}, getText = (key) => key, showNotification = () => {}, showCustomDialog }) {
  const text = (key, values = {}) => Object.entries(values).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, String(value)), getText(key) || key);
  const el = (tag, className = '', content = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  };
  const button = (label, className, onClick) => {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  };
  const ask = ({ title, message, confirmLabel }) => showCustomDialog({
    title,
    message,
    buttons: [
      { text: text('mnCancel'), class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => null },
      { text: confirmLabel || text('mnConfirm'), class: 'px-4 py-2 rounded-md btn-primary', value: () => true }
    ]
  });

  const mount = () => {
    const transcription = getTranscription();
    const host = document.querySelector('#model-management-section .pz');
    if (!transcription || !host) return;
    transcription.setSaver(() => saveConfig().catch((error) => console.warn('Saving the settings of speech to text failed.', error)));
    const draw = () => {
      const card = renderTranscriptionCard({ transcription, el, button, text, ask, showNotification, render: draw });
      const old = document.getElementById(CARD_ID);
      if (!card) { old?.remove(); return; }
      card.id = CARD_ID;
      if (old) old.replaceWith(card);
      else host.append(card);
    };
    draw();
  };
  return { mount };
}
