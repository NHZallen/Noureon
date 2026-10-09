import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const S = process.argv[2];
const css = fs.readFileSync(S + '/quiz-draft.css', 'utf8');
const Q = { text: '光合作用中，植物釋放出的氧氣主要來自哪一個分子？', opts: [
  ['二氧化碳 (CO₂)', '二氧化碳是碳的來源，在暗反應被固定成葡萄糖。它的氧最後進入糖類和水，不是釋放出去的氧氣。'],
  ['水 (H₂O)', '光反應中水被光解，產生氧氣、電子和氫離子，釋放出的氧氣就來自水。'],
  ['葡萄糖 (C₆H₁₂O₆)', '葡萄糖是光合作用的產物，不是原料，所以不可能是氧氣的來源。'],
  ['葉綠素', '葉綠素是吸收光能的色素，在反應中不會被分解成氧氣。']], answer: 1,
  extra: '1941 年，魯賓（Ruben）與卡門（Kamen）等人用含重氧（¹⁸O）的水和二氧化碳做實驗，發現釋放的氧氣帶有標記的是水，不是二氧化碳。' };
const K = ['A', 'B', 'C', 'D'];
const ico = (d, extra = '') => `<svg class="quiz-ico${extra}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const P = (d) => `<path d="${d}"/>`;
const I = { check: ico(P('M5 12.5l4.5 4.5L19 7.5')), x: ico(P('M6 6l12 12M18 6L6 18')), arrow: ico(P('M5 12h14M13 6l6 6-6 6')), expand: ico(P('M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7')), bulb: ico(P('M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z')), spark: ico(P('M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z')), send: ico(P('M4 12l16-8-6 16-3-7z')), more: ico('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>', ' is-fill'), down: ico(P('M12 4v11M7 11l5 5 5-5M5 20h14')) };
const opt = (i, mode, pick) => {
  const right = i === Q.answer, isPick = i === pick; let cls = '';
  if (mode === 'idle' && isPick) cls = ' is-selected';
  if (mode !== 'idle') { cls = ' is-locked'; if (right) cls += ' is-correct'; else if (isPick) cls += ' is-wrong'; }
  return `<li class="quiz-option${cls}"><button type="button"><span class="quiz-key">${K[i]}</span><span class="quiz-option-text">${Q.opts[i][0]}</span></button></li>`;
};
const reasons = (pick) => `<ol class="quiz-reasons">${[0, 1, 2, 3].map((i) => `<li class="${i === Q.answer ? 'is-correct' : (i === pick ? 'is-picked' : '')}"><b>${K[i]}</b><span>${Q.opts[i][1]}${i === Q.answer ? '<em>正確答案</em>' : (i === pick ? '<em>你選的</em>' : '')}</span></li>`).join('')}</ol>`;
const menu = (send) => `<div class="quiz-menu" role="menu">${send ? `<button>${I.send.replace('quiz-ico', 'quiz-ico')}傳送結果<small></small></button><hr>` : ''}<h4>考卷版 <span>只有題目</span></h4><button>Word<small>.docx</small></button><button>PDF<small>.pdf</small></button><h4>解答版 <span>答案與每個選項的說明</span></h4><button>Word<small>.docx</small></button><button>PDF<small>.pdf</small></button><h4>資料 <span>一題一列</span></h4><button>Excel<small>.xlsx</small></button><button>CSV<small>.csv</small></button><button>JSON（可貼回聊天室）<small>.json</small></button></div>`;
const steps = (n, total, results) => `<div class="quiz-steps" aria-hidden="true">${Array.from({ length: total }, (_, k) => `<i class="${results ? (results[k] ? 'is-right' : 'is-miss') : (k < n ? 'is-done' : '')}"></i>`).join('')}</div>`;
const card = ({ mode, pick, others = false, hint = false, menuOpen = false, send = false, mini = false, n = 2, total = 5 }) => `
<div class="quiz-card">
  <div class="quiz-head"><span class="quiz-kicker">${mini ? '小測驗 · 檢查理解' : '測驗 · 光合作用'}</span><span class="quiz-tools">${mode === 'idle' ? `<button class="quiz-tool" type="button">${I.bulb}提示</button>` : ''}<button class="quiz-tool" type="button" aria-label="放大">${I.expand}</button><button class="quiz-tool" type="button" aria-label="更多">${I.more}</button>${menuOpen ? menu(send) : ''}</span></div>
  ${steps(mini ? 0 : n, total)}
  <div class="quiz-body">
    <p class="quiz-question">${Q.text}</p>
    ${hint ? '<p class="quiz-hint"><b>提示</b><span>想一想，光反應一開始被光拆開的是哪一個分子？</span></p>' : ''}
    <ul class="quiz-options">${[0, 1, 2, 3].map((i) => opt(i, mode, pick)).join('')}</ul>
  </div>
  ${mode === 'idle' ? `<div class="quiz-dock"><p>第 ${n} 題，共 ${total} 題</p><button class="quiz-primary" type="button"${pick == null ? ' disabled' : ''}>確認</button></div>` : ''}
  ${mode === 'correct' ? `<div class="quiz-band is-correct"><p class="quiz-verdict"><span class="quiz-badge">${I.check}</span>答對了</p><p class="quiz-label">補充說明</p><p class="quiz-text">${Q.opts[Q.answer][1]} ${Q.extra}</p>${others ? reasons(pick) : ''}<button class="quiz-more" type="button">${others ? '收起其他選項' : '看其他選項為什麼不對'}</button><div class="quiz-actions"><button class="quiz-primary" type="button">${mini ? '再來一題' : '下一題'}${I.arrow}</button><button class="quiz-quiet" type="button">${I.spark}解釋</button>${send ? `<button class="quiz-quiet" type="button">${I.send}傳送結果</button>` : ''}</div></div>` : ''}
  ${mode === 'wrong' ? `<div class="quiz-band is-wrong"><p class="quiz-verdict"><span class="quiz-badge">${I.x}</span>答錯了 <small>正確答案是 B</small></p>${reasons(pick)}<div class="quiz-actions"><button class="quiz-primary" type="button">${mini ? '再來一題' : '下一題'}${I.arrow}</button><button class="quiz-quiet" type="button">${I.spark}解釋</button>${send ? `<button class="quiz-quiet" type="button">${I.send}傳送結果</button>` : ''}</div></div>` : ''}
</div>`;
const done = `<div class="quiz-card"><div class="quiz-head"><span class="quiz-kicker">測驗完成 · 光合作用</span><span class="quiz-tools"><button class="quiz-tool" type="button" aria-label="更多">${I.more}</button></span></div>${steps(5, 5, [1, 1, 0, 1, 1])}<div class="quiz-body"><p class="quiz-score"><strong>4 / 5</strong><span>答對 4 題</span></p><div><p class="quiz-label" style="margin-bottom:.4rem">答錯的題目</p><ul class="quiz-misses"><li><b>第 3 題</b><span>光合作用中，植物釋放出的氧氣主要來自哪一個分子？</span></li></ul></div></div><div class="quiz-dock" style="flex-wrap:wrap;justify-content:flex-start"><button class="quiz-primary" type="button">只重做答錯的</button><button class="quiz-quiet" type="button">全部重來</button><button class="quiz-quiet" type="button">${I.send}傳送結果</button><button class="quiz-quiet" type="button">${I.down}下載</button></div></div>`;

const msgUser = (t) => `<div class="message-item flex items-start gap-2 md:gap-4 justify-end user-message"><div class="message-stack message-stack-user"><div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative"><div class="prose prose-sm max-w-none text-[var(--text-primary)] message-content"><p>${t}</p></div></div></div></div>`;
const msgModel = (inner) => `<div class="message-item flex items-start gap-2 md:gap-4 model-message"><div class="message-stack message-stack-model"><div class="p-3 md:p-4 rounded-lg shadow-sm max-w-full md:max-w-xl message-bubble relative"><div class="prose prose-sm max-w-none text-[var(--text-primary)] message-content">${inner}</div></div></div></div>`;

const scenes = {
  idle: [msgUser('幫我出 5 題光合作用的選擇題'), msgModel('<p>好的，以下是 5 題光合作用的選擇題，一次一題，答完會有解析。</p>' + card({ mode: 'idle', hint: true, pick: 2 })) ],
  wrong: [msgUser('幫我出 5 題光合作用的選擇題'), msgModel('<p>好的，以下是 5 題光合作用的選擇題，一次一題，答完會有解析。</p>' + card({ mode: 'wrong', pick: 2 }))],
  correct: [msgUser('幫我出 5 題光合作用的選擇題'), msgModel('<p>好的，以下是 5 題光合作用的選擇題，一次一題，答完會有解析。</p>' + card({ mode: 'correct', pick: 1, others: false, menuOpen: true, send: false }))],
  done: [msgUser('幫我出 5 題光合作用的選擇題'), msgModel(done)],
  learn: [msgUser('光合作用的氧氣是從哪裡來的？'), msgModel('<p>簡單說，光合作用釋放的氧氣來自水：光反應把水分解，氧氣是這個過程的副產品。你可以把它想成一座把水拆開的工廠，氫被留下來用，氧氣就排到空氣中。先想一想，再做下面這一題小測驗確認一下。</p>' + card({ mode: 'wrong', pick: 2, send: true, mini: true, n: 1, total: 1 })), msgUser('我做了小測驗，第 1 題答錯，選了「葡萄糖 (C₆H₁₂O₆)」。'), msgModel('<p>沒關係，這個選項很常見。先抓住一個想法：產物不可能同時是原料。從這裡再看一次，氧氣如果不是來自葡萄糖，剩下三個裡面，哪一個在光反應一開始就被拆開了？</p>')]
};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const jobs = [['desktop-light-idle', 'idle', 1100, 1000, 'light'], ['desktop-light-wrong', 'wrong', 1100, 1320, 'light'], ['desktop-dark-correct', 'correct', 1100, 1260, 'dark'], ['desktop-light-done', 'done', 1100, 900, 'light'], ['phone-dark-wrong', 'wrong', 390, 1800, 'dark'], ['phone-light-learn', 'learn', 390, 2300, 'light'], ['desktop-dark-learn', 'learn', 1100, 1650, 'dark']];
const errs = [];
for (const [name, scene, w, h, theme] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: theme });
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch {} }, theme);
  await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(([html, css, theme]) => {
    document.documentElement.dataset.theme = theme;
    const auth = document.getElementById('auth-container'); if (auth) auth.style.display = 'none';
    const app = document.getElementById('app-container'); if (app) { app.classList.remove('hidden'); app.classList.add('visible'); app.style.display = 'block'; }
    const s = document.createElement('style'); s.textContent = css; document.head.append(s);
    const list = document.getElementById('message-list'); list.innerHTML = html;
    const ph = document.querySelector('.chat-empty, #empty-state, .welcome'); if (ph) ph.style.display = 'none';
  }, [scenes[scene].join(''), css, theme]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${S}/app-${name}.png`, fullPage: false });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (ov > 0) errs.push(`${name} overflow ${ov}`);
  await page.close();
}
console.log('errors', errs.length ? errs : 'none');
await browser.close();
