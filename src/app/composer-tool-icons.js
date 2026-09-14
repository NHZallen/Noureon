export const COMPOSER_TOOL_ICON_PATHS = Object.freeze({
  camera: '/assets/composer-tools/camera.png',
  media: '/assets/composer-tools/media.png',
  file: '/assets/composer-tools/file.png',
  webSearch: '/assets/composer-tools/web-search.png',
  modelCouncil: '/assets/composer-tools/model-council.png',
  learning: '/assets/composer-tools/learning.png'
});

export function renderComposerToolIcon(name, className = 'composer-menu-icon') {
  const source = COMPOSER_TOOL_ICON_PATHS[name];
  if (!source) return '';
  return `<img class="${className}" src="${source}" alt="" aria-hidden="true" draggable="false">`;
}
