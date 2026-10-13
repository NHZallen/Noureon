// What is said when OpenCode Go refuses a request (one line of what to do), in the five languages. Loaded only when a refusal comes (the page does
// not carry these words otherwise). Shared by the page and the server: no window, no document, no browser storage.
export const OPENCODE_ERROR_TEXTS = Object.freeze({
  'zh-TW': {
    opencodeGlobalRegion: '這個模型需要在 OpenCode 工作區的「隱私」設定把區域選為 Global 才能使用。',
    opencodeTrainingConsent: '這個模型會用你的請求資料訓練。要使用它，請在 OpenCode 工作區的「隱私」設定允許「會用請求資料訓練的付費端點」。',
    opencodeKeyInvalid: 'OpenCode Go 不接受這把金鑰。請到設定檢查金鑰是否正確、是否仍有效。',
    opencodeLimits: '用量以 OpenCode Go 後台限額為準，請到 OpenCode 後台查看。',
    opencodeUnavailable: '這個模型目前暫時無法使用（OpenCode 那一端的服務離線）。請稍後再試，或換別的模型。',
  },
  en: {
    opencodeGlobalRegion: 'This model needs the region set to Global in the Privacy settings of your OpenCode workspace.',
    opencodeTrainingConsent: 'This model trains on your request data. To use it, allow “paid endpoints that train on request data” in the Privacy settings of your OpenCode workspace.',
    opencodeKeyInvalid: 'OpenCode Go does not accept this key. Check in Settings that it is correct and still valid.',
    opencodeLimits: 'Usage follows the limits in the OpenCode Go console. Check them there.',
    opencodeUnavailable: 'This model is not available right now (its service at OpenCode is offline). Try again later, or pick another model.',
  },
  fr: {
    opencodeGlobalRegion: 'Ce modèle nécessite la région Global dans les réglages de confidentialité de votre espace de travail OpenCode.',
    opencodeTrainingConsent: 'Ce modèle s’entraîne sur vos données de requête. Pour l’utiliser, autorisez les « points d’accès payants qui s’entraînent sur les données de requête » dans les réglages de confidentialité de votre espace de travail OpenCode.',
    opencodeKeyInvalid: 'OpenCode Go n’accepte pas cette clé. Vérifiez dans les réglages qu’elle est correcte et toujours valide.',
    opencodeLimits: 'L’utilisation suit les limites de la console OpenCode Go. Consultez-les là-bas.',
    opencodeUnavailable: 'Ce modèle n’est pas disponible pour le moment (son service chez OpenCode est hors ligne). Réessayez plus tard ou choisissez un autre modèle.',
  },
  ru: {
    opencodeGlobalRegion: 'Для этой модели в настройках конфиденциальности рабочего пространства OpenCode нужно выбрать регион Global.',
    opencodeTrainingConsent: 'Эта модель обучается на данных ваших запросов. Чтобы её использовать, разрешите «платные конечные точки, обучающиеся на данных запросов» в настройках конфиденциальности рабочего пространства OpenCode.',
    opencodeKeyInvalid: 'OpenCode Go не принимает этот ключ. Проверьте в настройках, что он верный и действующий.',
    opencodeLimits: 'Использование определяется лимитами в консоли OpenCode Go. Посмотрите их там.',
    opencodeUnavailable: 'Эта модель сейчас недоступна (её сервис в OpenCode отключён). Повторите позже или выберите другую модель.',
  },
  es: {
    opencodeGlobalRegion: 'Este modelo necesita que la región sea Global en los ajustes de privacidad de tu espacio de trabajo de OpenCode.',
    opencodeTrainingConsent: 'Este modelo se entrena con los datos de tus solicitudes. Para usarlo, permite los «endpoints de pago que entrenan con datos de solicitudes» en los ajustes de privacidad de tu espacio de trabajo de OpenCode.',
    opencodeKeyInvalid: 'OpenCode Go no acepta esta clave. Comprueba en Ajustes que es correcta y sigue vigente.',
    opencodeLimits: 'El uso depende de los límites de la consola de OpenCode Go. Consúltalos allí.',
    opencodeUnavailable: 'Este modelo no está disponible ahora (su servicio en OpenCode está fuera de línea). Inténtalo más tarde o elige otro modelo.',
  }
});
