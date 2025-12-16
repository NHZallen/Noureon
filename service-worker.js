// 【重要】每次更新 PWA 時，請手動增加此版本號！
const CACHE_NAME = 'astra-chat-cache-v151;

// 靜態資源，可以長期快取
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/i18n.js',
  '/demo-conversations.js',
  '/astras-data.js'
];

// 核心檔案，需要優先從網路獲取
const CORE_FILES = [
  '/index.html',
  '/i18n.js',
  '/update-logs.js'
];

// Service Worker 安裝事件
self.addEventListener('install', event => {
  console.log('Service Worker v4: 正在安裝...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log(`Service Worker v4: 快取靜態資源到 ${CACHE_NAME}`);
      // 只預先快取不會頻繁變動的靜態資源
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Service Worker 啟動事件
self.addEventListener('activate', event => {
  console.log('Service Worker v4: 正在啟動並清理舊版本快取...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`Service Worker v4: 刪除舊快取: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      ).then(() => {
        console.log('Service Worker v4: 已取得控制權。');
        return self.clients.claim();
      });
    })
  );
});

// Service Worker 攔截網路請求事件
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 【新增修正：API 請求直接放行，不經過 Service Worker】
  // 如果網址包含 openrouter.ai 或 googleapis.com (Gemini)，直接 return，讓瀏覽器正常處理
  if (url.hostname.includes('openrouter.ai') || 
      url.hostname.includes('googleapis.com') ||
      event.request.method === 'POST') { 
      return; 
  }

  // 【策略一：核心檔案，網路優先】
  // 如果請求的是 index.html 或 update-logs.js
  if (CORE_FILES.some(path => url.pathname.endsWith(path))) {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        // 如果成功從網路拿到，就更新快取並回傳
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        // 如果網路失敗 (離線)，就從快取中找備用
        return caches.match(event.request);
      })
    );
    return;
  }

  // 【策略二：其他所有請求，快取優先】
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});





























































