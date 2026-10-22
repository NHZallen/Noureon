// The words of the "models a text model may call" tab of the settings, in the app's five languages. {name} placeholders are filled by toolModelText.

export const TOOL_MODEL_TEXTS = Object.freeze({
  'zh-TW': {
    nav: '模型可呼叫模型',
    desc: '文字模型可以自己呼叫的模型。選好之後，模型選單裡標有「可呼叫模型」的文字模型就能直接用它。',
    imageTitle: '圖片生成',
    imageDesc: '文字模型想畫圖時用的圖片模型。每次畫圖前，會依「權限」分頁的設定先問你。',
    imageNone: '不使用',
    imageNoneDesc: '文字模型不能自己畫圖。',
    needsKey: '需要 {provider} 的 API 金鑰，請先在設定的 API 金鑰填入。',
    note: '提示詞與參考圖會送到你選的圖片模型；文字模型也會看到對話裡的圖。'
  },
  en: {
    nav: 'Models it can call',
    desc: 'Models a text model can call by itself. Once one is chosen, the text models marked "Calls models" in the model menu can use it directly.',
    imageTitle: 'Image generation',
    imageDesc: 'The picture model a text model draws with. You are asked before each picture, as set in the Permissions tab.',
    imageNone: 'Not used',
    imageNoneDesc: 'Text models cannot draw pictures by themselves.',
    needsKey: 'Needs an API key for {provider}: add it under API keys in the settings first.',
    note: 'The prompt and reference pictures go to the picture model you choose; the text model also sees the pictures in the chat.'
  },
  fr: {
    nav: 'Modèles appelables',
    desc: 'Les modèles qu’un modèle de texte peut appeler lui-même. Une fois l’un d’eux choisi, les modèles de texte marqués « Appelle des modèles » dans le menu des modèles peuvent l’utiliser directement.',
    imageTitle: 'Génération d’images',
    imageDesc: 'Le modèle d’images avec lequel un modèle de texte dessine. Il vous est demandé avant chaque image, selon l’onglet Autorisations.',
    imageNone: 'Non utilisé',
    imageNoneDesc: 'Les modèles de texte ne peuvent pas dessiner seuls.',
    needsKey: 'Nécessite une clé API pour {provider} : ajoutez-la d’abord dans les clés API des paramètres.',
    note: 'Le texte de la demande et les images de référence sont envoyés au modèle d’images choisi ; le modèle de texte voit aussi les images de la conversation.'
  },
  ru: {
    nav: 'Вызываемые модели',
    desc: 'Модели, которые текстовая модель может вызывать сама. После выбора их смогут использовать текстовые модели с пометкой «Вызывает модели» в меню моделей.',
    imageTitle: 'Создание изображений',
    imageDesc: 'Модель изображений, которой рисует текстовая модель. Перед каждой картинкой вас спросят — так, как задано на вкладке «Разрешения».',
    imageNone: 'Не использовать',
    imageNoneDesc: 'Текстовые модели не смогут рисовать сами.',
    needsKey: 'Нужен API-ключ {provider}: сначала добавьте его в разделе API-ключей в настройках.',
    note: 'Запрос и опорные изображения уходят выбранной модели изображений; текстовая модель тоже видит картинки в чате.'
  },
  es: {
    nav: 'Modelos que puede llamar',
    desc: 'Los modelos que un modelo de texto puede llamar por sí mismo. Una vez elegido uno, los modelos de texto marcados «Llama a modelos» en el menú de modelos pueden usarlo directamente.',
    imageTitle: 'Generación de imágenes',
    imageDesc: 'El modelo de imágenes con el que dibuja un modelo de texto. Se te pregunta antes de cada imagen, según la pestaña Permisos.',
    imageNone: 'No usar',
    imageNoneDesc: 'Los modelos de texto no pueden dibujar por sí mismos.',
    needsKey: 'Necesita una clave de API de {provider}: añádela antes en las claves de API de los ajustes.',
    note: 'El texto de la petición y las imágenes de referencia se envían al modelo de imágenes elegido; el modelo de texto también ve las imágenes del chat.'
  }
});

export function toolModelText(language, key, values = {}) {
  const table = TOOL_MODEL_TEXTS[language] || TOOL_MODEL_TEXTS.en;
  const template = table[key] ?? TOOL_MODEL_TEXTS.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])));
}
