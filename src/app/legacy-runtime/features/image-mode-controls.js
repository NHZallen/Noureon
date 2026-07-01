import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_RESOLUTIONS,
  normalizeImageGenerationConfig
} from './image-generation-config.js';

const createSelectControl = ({ document, id, label, values }) => {
  const row = document.createElement('label');
  row.id = `${id}-control`;
  row.className = 'image-mode-control w-full px-4 py-2 text-sm items-center gap-3';
  row.style.display = 'none';
  const text = document.createElement('span');
  text.className = 'flex-1';
  text.textContent = label;
  const select = document.createElement('select');
  select.id = `${id}-select`;
  select.className = 'image-mode-select p-1.5 rounded-md border border-transparent text-[var(--text-primary)]';
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  row.append(text, select);
  return { row, select };
};

export function createImageModeControls({
  document,
  getActiveConversation,
  getActiveModel,
  modelGeneratesImages,
  saveAppData = async () => {},
  onChange = () => {}
}) {
  let ratio;
  let resolution;
  let advanced;

  const advancedDefaults = {
    n: 1,
    quality: 'auto',
    outputFormat: 'png',
    background: 'auto',
    outputCompression: 90,
    seed: ''
  };

  const persist = async () => {
    const conversation = getActiveConversation();
    if (!conversation) return;
    conversation.imageConfig = normalizeImageGenerationConfig({
      aspectRatio: ratio.select.value,
      resolution: resolution.select.value
    });
    await saveAppData();
    onChange(conversation.imageConfig);
  };

  const persistAdvanced = async () => {
    const conversation = getActiveConversation();
    if (!conversation || !advanced) return;
    const seedValue = advanced.fields.seed.value.trim();
    let provider;
    try {
      provider = advanced.fields.provider.value.trim()
        ? JSON.parse(advanced.fields.provider.value)
        : undefined;
      advanced.fields.provider.setCustomValidity('');
    } catch {
      advanced.fields.provider.setCustomValidity('請輸入有效的 JSON');
      advanced.fields.provider.reportValidity?.();
      return;
    }
    conversation.imageAdvancedConfig = {
      n: Number(advanced.fields.n.value),
      quality: advanced.fields.quality.value,
      outputFormat: advanced.fields.outputFormat.value,
      background: advanced.fields.background.value,
      outputCompression: Number(advanced.fields.outputCompression.value),
      ...(seedValue ? { seed: Number(seedValue) } : {}),
      ...(provider ? { provider } : {})
    };
    await saveAppData();
    onChange(conversation.imageAdvancedConfig);
  };

  const createAdvanced = () => {
    const details = document.createElement('details');
    details.id = 'image-advanced-control';
    details.className = 'image-mode-advanced px-4 py-2 text-sm';
    details.style.display = 'none';
    const summary = document.createElement('summary');
    summary.className = 'cursor-pointer select-none';
    summary.textContent = '進階設定';
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'image-mode-advanced-grid mt-3 grid grid-cols-2 gap-2';
    const specs = [
      ['n', '張數', Array.from({ length: 10 }, (_, index) => String(index + 1))],
      ['quality', '品質', ['auto', 'low', 'medium', 'high']],
      ['outputFormat', '格式', ['png', 'jpeg', 'webp']],
      ['background', '背景', ['auto', 'transparent', 'opaque']],
      ['outputCompression', '壓縮率', Array.from({ length: 11 }, (_, index) => String(index * 10))]
    ];
    const fields = {};
    specs.forEach(([key, label, values]) => {
      const field = document.createElement('label');
      field.className = 'flex flex-col gap-1 text-xs text-[var(--text-secondary)]';
      field.textContent = label;
      const select = document.createElement('select');
      select.id = `image-${key.replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)}-select`;
      select.className = 'p-1.5 rounded-md bg-[var(--input-field-bg)] border border-[var(--border-color)] text-[var(--text-primary)]';
      values.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
      select.addEventListener('change', persistAdvanced);
      field.appendChild(select);
      body.appendChild(field);
      fields[key] = select;
    });
    const seedField = document.createElement('label');
    seedField.className = 'col-span-2 flex flex-col gap-1 text-xs text-[var(--text-secondary)]';
    seedField.textContent = 'Seed（選填）';
    const seed = document.createElement('input');
    seed.id = 'image-seed-input';
    seed.type = 'number';
    seed.min = '0';
    seed.className = 'p-1.5 rounded-md bg-[var(--input-field-bg)] border border-[var(--border-color)] text-[var(--text-primary)]';
    seed.addEventListener('change', persistAdvanced);
    seedField.appendChild(seed);
    body.appendChild(seedField);
    fields.seed = seed;
    const providerField = document.createElement('label');
    providerField.className = 'col-span-2 flex flex-col gap-1 text-xs text-[var(--text-secondary)]';
    providerField.textContent = '供應商選項（JSON）';
    const provider = document.createElement('textarea');
    provider.id = 'image-provider-options-input';
    provider.rows = 2;
    provider.placeholder = '{"options":{"provider-slug":{}}}';
    provider.className = 'p-1.5 rounded-md bg-[var(--input-field-bg)] border border-[var(--border-color)] text-[var(--text-primary)] resize-y';
    provider.addEventListener('change', persistAdvanced);
    providerField.appendChild(provider);
    body.appendChild(providerField);
    fields.provider = provider;
    details.appendChild(body);
    return { details, fields };
  };

  const ensure = () => {
    const popover = document.getElementById('file-options-popover');
    if (!popover) return false;
    if (!ratio) {
      ratio = createSelectControl({ document, id: 'image-aspect-ratio', label: '圖片比例', values: IMAGE_ASPECT_RATIOS });
      resolution = createSelectControl({ document, id: 'image-resolution', label: '解析度', values: IMAGE_RESOLUTIONS });
      ratio.select.addEventListener('change', persist);
      resolution.select.addEventListener('change', persist);
      const learning = document.getElementById('learning-mode-btn');
      popover.insertBefore(ratio.row, learning || null);
      popover.insertBefore(resolution.row, learning || null);
      advanced = createAdvanced();
      popover.insertBefore(advanced.details, learning || null);
    }
    return true;
  };

  const sync = () => {
    if (!ensure()) return false;
    const conversation = getActiveConversation();
    const active = Boolean(conversation && modelGeneratesImages(getActiveModel()));
    const config = normalizeImageGenerationConfig(conversation?.imageConfig);
    ratio.select.value = config.aspectRatio;
    resolution.select.value = config.resolution;
    ratio.row.style.display = active ? 'flex' : 'none';
    resolution.row.style.display = active ? 'flex' : 'none';
    const advancedConfig = { ...advancedDefaults, ...(conversation?.imageAdvancedConfig || {}) };
    Object.entries(advanced.fields).forEach(([key, field]) => {
      field.value = key === 'provider'
        ? (advancedConfig.provider ? JSON.stringify(advancedConfig.provider) : '')
        : (advancedConfig[key] ?? '');
    });
    advanced.details.style.display = active ? 'block' : 'none';
    const council = document.getElementById('model-council-menu-btn');
    const learning = document.getElementById('learning-mode-btn');
    if (council) council.style.display = active ? 'none' : 'flex';
    if (learning) learning.style.display = active ? 'none' : 'flex';
    return active;
  };

  return { ensure, sync };
}
