const DEMO_MODELS = [
  { id: 'proMax', name: 'Noureon-Pro Max', title: 'Noureon-Pro Max 對話範例', desc: '深度決策，商業研究最佳拍檔' },
  { id: 'proPV', name: 'Noureon-Pro PV', title: 'Noureon-Pro PV 對話範例', desc: '預覽新技術，多模態高速體驗' },
  { id: 'pro', name: 'Noureon-Pro', title: 'Noureon-Pro 對話範例', desc: '高效多模態，文檔圖像兼擅' },
  { id: 'plusPV', name: 'Noureon-Plus PV', title: 'Noureon-Plus PV 對話範例', desc: '輕量快速，日常應用即刻啟動' },
  { id: 'mini', name: 'Noureon-Mini', title: 'Noureon-Mini 對話範例', desc: '強大推理，長文與數理皆能' },
  { id: 'mill', name: 'Noureon-Mill', title: 'Noureon-Mill 對話範例', desc: '開源高效，短文生成與結構化' },
  { id: 'nano', name: 'Noureon-Nano', title: 'Noureon-Nano 對話範例', desc: '程式專精，技術代碼好幫手' }
];

export function setupDemoModelHomepage({ document, demoConversations } = {}) {
  if (!document) return;

  const selectorContainer = document.querySelector('.demo-model-selector');
  const chatWindow = document.getElementById('demo-chat-window');
  const chatTitle = document.getElementById('demo-chat-title');
  if (!selectorContainer || !chatWindow || !chatTitle) return;

  const conversations = demoConversations || {};
  DEMO_MODELS.forEach((model, index) => {
    const button = document.createElement('button');
    button.className = `selector-btn text-center p-3 rounded-lg border-2 border-gray-200 bg-white ${index === 0 ? 'active' : ''}`;
    button.dataset.modelId = model.id;
    button.innerHTML = `
      <div class="font-semibold text-sm text-gray-800">${model.name}</div>
      <div class="text-xs text-gray-500">${model.desc}</div>
    `;
    selectorContainer.appendChild(button);

    const contentDiv = document.createElement('div');
    contentDiv.id = `demo-chat-${model.id}`;
    contentDiv.className = `demo-chat-content space-y-6 ${index === 0 ? 'active' : ''}`;
    contentDiv.innerHTML = conversations[model.id] ?? '';
    chatWindow.appendChild(contentDiv);
  });

  selectorContainer.addEventListener('click', (event) => {
    const button = event.target.closest('.selector-btn');
    if (!button) return;

    const modelId = button.dataset.modelId;
    selectorContainer.querySelector('.active').classList.remove('active');
    button.classList.add('active');
    chatWindow.querySelector('.active').classList.remove('active');
    document.getElementById(`demo-chat-${modelId}`).classList.add('active');
    const modelInfo = DEMO_MODELS.find((model) => model.id === modelId);
    chatTitle.textContent = modelInfo.title;
  });
}
