const OUTPUT_MODE_SETTINGS_TEXT = Object.freeze({
  'zh-TW': Object.freeze({
    title: '輸出模式',
    desc: '適用於單獨模型與模型理事會回覆。',
    typewriter: '完整輸出後打字機',
    realtime: '即時同步輸出'
  }),
  en: Object.freeze({
    title: 'Output mode',
    desc: 'Applies to single-model and Model Council replies.',
    typewriter: 'Typewriter after completion',
    realtime: 'Realtime API stream'
  }),
  fr: Object.freeze({
    title: 'Mode de sortie',
    desc: 'S’applique aux réponses mono-modèle et au conseil de modèles.',
    typewriter: 'Machine à écrire après la réponse complète',
    realtime: 'Flux API en temps réel'
  })
});

export const getOutputModeSettingsText = (uiLanguage = 'zh-TW') => (
  { ...(OUTPUT_MODE_SETTINGS_TEXT[uiLanguage] || OUTPUT_MODE_SETTINGS_TEXT['zh-TW']) }
);
