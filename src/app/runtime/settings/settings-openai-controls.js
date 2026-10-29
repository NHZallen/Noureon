// The two choices that belong to OpenAI's own API (docs/superpowers/specs/2026-10-29-openai-provider-design.md): where its models search the web (the Web search card) and whether an
// anonymous identifier of the user is sent with each request (under the OpenAI key). The rows are in the page (03-shell fragment) with their texts; this reads the saved choice into
// them and hands the controls to the Save button.

export function ensureOpenAiSettingsControls({ document, elements, config }) {
  const select = document.getElementById('openai-web-search-select');
  if (select) {
    select.value = config.openaiWebSearch === 'provider' ? 'provider' : 'official';
    elements.openaiWebSearchSelect = select;
  }
  const toggle = document.getElementById('openai-safety-id-toggle-switch');
  if (toggle) {
    toggle.checked = config.openaiSafetyIdentifier !== false;
    elements.openaiSafetyIdToggle = toggle;
  }
}
