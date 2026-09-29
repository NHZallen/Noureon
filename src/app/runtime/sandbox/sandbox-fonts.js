// Fonts for the Python sandbox, sent the first time code uses matplotlib,
// reportlab or fpdf2: the app's open-source faces with every character,
// pinned to regular and bold (the Noto files are variable fonts whose
// default is Thin) and named plainly. They land in /fonts under the names
// below, which the model is told to use.

export const SANDBOX_FONTS = Object.freeze([
  { family: 'Inter', file: 'inter.ttf', name: 'Inter' },
  { family: 'Noto Sans TC', file: 'noto-sans-tc.ttf', name: 'NotoSansTC' },
  { family: 'Noto Serif TC', file: 'noto-serif-tc.ttf', name: 'NotoSerifTC' },
  { family: 'Noto Sans SC', file: 'noto-sans-sc.ttf', name: 'NotoSansSC' },
  { family: 'Noto Sans JP', file: 'noto-sans-jp.ttf', name: 'NotoSansJP' },
  { family: 'Noto Sans KR', file: 'noto-sans-kr.ttf', name: 'NotoSansKR' }
]);
const WEIGHTS = Object.freeze([{ weight: 400, style: 'Regular', bold: false }, { weight: 700, style: 'Bold', bold: true }]);

let prepared = null;

export function prepareChartFonts({
  loadAssets = () => import('../../ui/files/generators/pptx-assets.js'),
  loadEmbedding = () => import('../../ui/files/generators/font-embedding.js')
} = {}) {
  prepared ||= (async () => {
    const [{ loadFontFile, loadSubsetter }, { renameFontFace }] = await Promise.all([loadAssets(), loadEmbedding()]);
    const subsetter = await loadSubsetter();
    const fonts = [];
    for (const font of SANDBOX_FONTS) {
      const source = await loadFontFile(font.file);
      for (const { weight, style, bold } of WEIGHTS) {
        const pinned = subsetter.subset(source, '', { instance: true, variations: { wght: weight }, allCharacters: true });
        fonts.push({ name: `${font.name}-${style}.ttf`, family: font.family, bytes: renameFontFace(pinned, { family: font.family, bold, weight }) });
      }
    }
    return fonts;
  })();
  prepared.catch(() => { prepared = null; });
  return prepared;
}
