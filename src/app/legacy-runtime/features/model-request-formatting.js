const STEP_PLAN_SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const STEP_PLAN_SUPPORTED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-matroska']);
const STEP_PLAN_VIDEO_SIZE_LIMIT_BYTES = 128 * 1024 * 1024;
const STEP_PLAN_MIME_TYPE_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  mkv: 'video/x-matroska'
};

const TAVILY_QUERY_CHAR_LIMIT = 380;

export const getStepPlanAttachmentMimeType = (inlineData) => {
  const mimeType = String(inlineData.mimeType || '').toLowerCase();
  if (mimeType) return mimeType;
  const ext = /\.([a-zA-Z0-9]{1,8})$/.exec(String(inlineData.name || ''))?.[1]?.toLowerCase();
  return STEP_PLAN_MIME_TYPE_BY_EXTENSION[ext] || '';
};

export const getBase64ByteLength = (base64 = '') => {
  const value = String(base64).replace(/\s/g, '');
  if (!value) return 0;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
};

export const appendStepPlanAttachmentContent = (content, inlineData, modelInfo, { modelSupportsVision }) => {
  const mimeType = getStepPlanAttachmentMimeType(inlineData);
  const name = inlineData.name || mimeType || 'attachment';
  const dataUrl = `data:${mimeType};base64,${inlineData.data}`;
  if (mimeType.startsWith('image/') && modelSupportsVision(modelInfo)) {
    if (STEP_PLAN_SUPPORTED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase())) {
      content.push({
        type: 'image_url',
        image_url: {
          url: dataUrl,
          detail: 'high'
        }
      });
    } else {
      content.push({ type: 'text', text: `[Unsupported image format for Step Plan: ${name}]` });
    }
    return;
  }
  if (mimeType.startsWith('video/') && modelSupportsVision(modelInfo)) {
    if (STEP_PLAN_SUPPORTED_VIDEO_MIME_TYPES.has(mimeType.toLowerCase())) {
      const byteLength = Number(inlineData.size || 0) || getBase64ByteLength(inlineData.data);
      if (byteLength > STEP_PLAN_VIDEO_SIZE_LIMIT_BYTES) {
        content.push({ type: 'text', text: `[Video omitted for Step Plan: ${name} is larger than 128MB. Split it into smaller MP4 clips before sending.]` });
        return;
      }
      content.unshift({
        type: 'video_url',
        video_url: {
          url: dataUrl
        }
      });
    } else {
      content.push({ type: 'text', text: `[Unsupported video format for Step Plan: ${name}. Use MP4, QuickTime, or Matroska.]` });
    }
    return;
  }
  content.push({ type: 'text', text: `[Attachment omitted for ${modelInfo.name}: ${name}]` });
};

export const getSearchCurrentDate = () => new Date().toISOString().slice(0, 10);

export const isWorldCupQuery = (value = '') => /(\bworld cup\b|\bfifa\b|世界盃|世界杯|美加墨)/i.test(String(value || ''));

export const isSportsResultsQuery = (value = '') => /(\bmatch\b|\bmatches\b|\bscore\b|\bscores\b|\bfixture\b|\bfixtures\b|\bstandings\b|\bgroup stage\b|\bwin\b|\bwins\b|\bwon\b|贏幾場|贏了幾場|幾勝|比分|賽果|戰績|小組賽|足球|賽程|排名)/i.test(String(value || '')) || isWorldCupQuery(value);

export const normalizeSearchQuery = (value = '') => String(value || '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/```[\s\S]*?```/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, TAVILY_QUERY_CHAR_LIMIT)
  .trim();

export const buildTavilySearchQuery = (value = '') => {
  const text = String(value || '');
  const sportsBoost = isWorldCupQuery(text)
    ? ' FIFA World Cup official match report results scores wins group stage'
    : (isSportsResultsQuery(text) ? ' official results scores wins fixtures standings' : '');
  return normalizeSearchQuery(`${text} current date ${getSearchCurrentDate()} latest${sportsBoost}`);
};

export const formatTavilySearchPacket = (data, query, label = 'Web search packet') => {
  const results = Array.isArray(data?.results) ? data.results : [];
  const lines = [
    `# ${label}`,
    '',
    `Provider: Tavily`,
    `Query: ${data?.query || query}`,
    `Current date: ${getSearchCurrentDate()}`,
    `Retrieved at: ${new Date().toISOString()}`
  ];
  if (data?.answer) {
    lines.push('', '## Tavily answer', String(data.answer).trim());
  }
  if (results.length > 0) {
    lines.push('', '## Sources');
    results.slice(0, 8).forEach((result, index) => {
      lines.push(
        '',
        `${index + 1}. ${result.title || 'Untitled source'}`,
        `URL: ${result.url || ''}`,
        `Content: ${String(result.content || result.raw_content || '').trim().slice(0, 1400) || 'No snippet returned.'}`
      );
      if (typeof result.score === 'number') {
        lines.push(`Score: ${result.score.toFixed(3)}`);
      }
    });
  } else {
    lines.push('', 'No Tavily results were returned.');
  }
  lines.push(
    '',
    'Use this as system-generated web context. Do not say or imply that the user wrote this packet. Prefer dated source evidence from the Sources section when making current factual claims, and state uncertainty when sources conflict.'
  );
  return lines.join('\n');
};
