// Chart fonts for the Python sandbox, sent when matplotlib is first used:
// Inter and Noto Sans TC, SC, JP and KR with every character, pinned to the
// regular weight (the Noto files are variable fonts whose default is Thin)
// and named plainly, so matplotlib can fall back between them per glyph.

const CHART_FONTS = Object.freeze([
  { file: 'inter.ttf', family: 'Inter' },
  { file: 'noto-sans-tc.ttf', family: 'Noto Sans TC' },
  { file: 'noto-sans-sc.ttf', family: 'Noto Sans SC' },
  { file: 'noto-sans-jp.ttf', family: 'Noto Sans JP' },
  { file: 'noto-sans-kr.ttf', family: 'Noto Sans KR' }
]);

let prepared = null;

export function prepareChartFonts({
  loadAssets = () => import('../../ui/files/generators/pptx-assets.js'),
  loadEmbedding = () => import('../../ui/files/generators/font-embedding.js')
} = {}) {
  prepared ||= (async () => {
    const [{ loadFontFile, loadSubsetter }, { renameFontFace }] = await Promise.all([loadAssets(), loadEmbedding()]);
    const subsetter = await loadSubsetter();
    return Promise.all(CHART_FONTS.map(async ({ file, family }) => {
      const pinned = subsetter.subset(await loadFontFile(file), '', { instance: true, variations: { wght: 400 }, allCharacters: true });
      return { name: file, family, bytes: renameFontFace(pinned, { family, weight: 400 }) };
    }));
  })();
  prepared.catch(() => { prepared = null; });
  return prepared;
}
