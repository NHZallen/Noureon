// The words of the picture of an account (頭像: the edit button of the User tab, its menu, the crop window, the notices) in the app's five languages.
// {name} placeholders are filled by avatarText.

export const AVATAR_TEXTS = Object.freeze({
  'zh-TW': {
    edit: '編輯頭像',
    change: '更換頭像',
    useGoogle: '使用 Google 頭像',
    remove: '移除頭像',
    cropTitle: '設定頭像',
    cropDesc: '移動和縮放圖片，裁出圓形頭像。',
    cancel: '取消',
    save: '儲存',
    saving: '儲存中…',
    saved: '頭像已更新',
    removed: '頭像已移除',
    failed: '頭像沒有儲存成功，請稍後再試。',
    removeFailed: '頭像沒有移除成功，請稍後再試。',
    notImage: '這個檔案不是可用的圖片（可用 PNG、JPG、WebP、GIF）。',
    tooBig: '圖片太大了，請選 10 MB 以內的圖片。',
    unreadable: '讀不出這張圖片，請換一張。'
  },
  en: {
    edit: 'Edit picture',
    change: 'Change picture',
    useGoogle: 'Use my Google picture',
    remove: 'Remove picture',
    cropTitle: 'Set your picture',
    cropDesc: 'Move and zoom the image to crop a round picture.',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Picture updated',
    removed: 'Picture removed',
    failed: 'The picture was not saved. Please try again later.',
    removeFailed: 'The picture was not removed. Please try again later.',
    notImage: 'This file is not a usable picture (PNG, JPG, WebP or GIF).',
    tooBig: 'The picture is too big. Choose one under 10 MB.',
    unreadable: 'This picture could not be read. Please choose another.'
  },
  fr: {
    edit: 'Modifier la photo',
    change: 'Changer de photo',
    useGoogle: 'Utiliser ma photo Google',
    remove: 'Supprimer la photo',
    cropTitle: 'Définir votre photo',
    cropDesc: 'Déplacez et zoomez l’image pour découper une photo ronde.',
    cancel: 'Annuler',
    save: 'Enregistrer',
    saving: 'Enregistrement…',
    saved: 'Photo mise à jour',
    removed: 'Photo supprimée',
    failed: 'La photo n’a pas été enregistrée. Réessayez plus tard.',
    removeFailed: 'La photo n’a pas été supprimée. Réessayez plus tard.',
    notImage: 'Ce fichier n’est pas une image utilisable (PNG, JPG, WebP ou GIF).',
    tooBig: 'L’image est trop grande. Choisissez-en une de moins de 10 Mo.',
    unreadable: 'Cette image n’a pas pu être lue. Choisissez-en une autre.'
  },
  ru: {
    edit: 'Изменить фото',
    change: 'Сменить фото',
    useGoogle: 'Использовать моё фото Google',
    remove: 'Удалить фото',
    cropTitle: 'Выберите фото профиля',
    cropDesc: 'Перемещайте и масштабируйте изображение, чтобы вырезать круглое фото.',
    cancel: 'Отмена',
    save: 'Сохранить',
    saving: 'Сохранение…',
    saved: 'Фото обновлено',
    removed: 'Фото удалено',
    failed: 'Фото не сохранено. Попробуйте позже.',
    removeFailed: 'Фото не удалено. Попробуйте позже.',
    notImage: 'Этот файл не подходит (PNG, JPG, WebP или GIF).',
    tooBig: 'Изображение слишком большое. Выберите файл до 10 МБ.',
    unreadable: 'Не удалось прочитать изображение. Выберите другое.'
  },
  es: {
    edit: 'Editar foto',
    change: 'Cambiar foto',
    useGoogle: 'Usar mi foto de Google',
    remove: 'Quitar foto',
    cropTitle: 'Elige tu foto',
    cropDesc: 'Mueve y amplía la imagen para recortar una foto redonda.',
    cancel: 'Cancelar',
    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Foto actualizada',
    removed: 'Foto quitada',
    failed: 'La foto no se guardó. Inténtalo más tarde.',
    removeFailed: 'La foto no se quitó. Inténtalo más tarde.',
    notImage: 'Este archivo no es una imagen válida (PNG, JPG, WebP o GIF).',
    tooBig: 'La imagen es demasiado grande. Elige una de menos de 10 MB.',
    unreadable: 'No se pudo leer esta imagen. Elige otra.'
  }
});

/** One text in a language (English when the language lacks it), with {name} placeholders filled. */
export function avatarText(language, key, values = {}) {
  const table = AVATAR_TEXTS[language] || AVATAR_TEXTS.en;
  const template = table[key] ?? AVATAR_TEXTS.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (values[name] === undefined ? match : String(values[name])));
}
