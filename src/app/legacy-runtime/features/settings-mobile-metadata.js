export const SETTINGS_MOBILE_ICON_MAP = Object.freeze({
  personalization: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M8 13s1.5 2 4 2 4-2 4-2"></path><path d="M9 9h.01"></path><path d="M15 9h.01"></path></svg>',
  memory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"></path></svg>',
  'model-management': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2"></circle><circle cx="18" cy="6" r="2"></circle><circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="18" r="2"></circle></svg>',
  'data-management': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7c0-2 3.6-3.5 8-3.5s8 1.5 8 3.5-3.6 3.5-8 3.5S4 9 4 7z"></path><path d="M4 7v5c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5V7"></path><path d="M4 12v5c0 2 3.6 3.5 8 3.5s8-1.5 8-3.5v-5"></path></svg>',
  accessibility: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10"></path><path d="M18 7h2"></path><circle cx="16" cy="7" r="2"></circle><path d="M4 17h2"></path><path d="M10 17h10"></path><circle cx="8" cy="17" r="2"></circle></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 15H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>',
  about: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>'
});

const resolveSettingsText = (getText, key, fallback) => (
  typeof getText === 'function' ? getText(key, fallback) : fallback
);

export const getSettingsMobileGroups = (getText) => {
  const text = (key, fallback) => resolveSettingsText(getText, key, fallback);

  return [
    {
      title: '自訂 ASTRA',
      items: [
        { section: 'personalization', label: text('personalization', '個人化') },
        { section: 'memory', label: text('memoryManagement', '記憶管理') },
        { section: 'model-management', label: text('modelManagement', '模型管理') }
      ]
    },
    {
      title: text('appSettings', '應用程式設定'),
      items: [
        { section: 'data-management', label: text('dataManagement', '資料管理') },
        { section: 'accessibility', label: text('accessibility', '輔助功能') },
        { section: 'trash', label: text('trash', '垃圾桶') }
      ]
    },
    {
      title: '取得協助',
      items: [
        { section: 'about', label: text('about', '關於') }
      ]
    }
  ];
};
