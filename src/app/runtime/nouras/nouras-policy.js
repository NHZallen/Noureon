export const NOURAS_REQUEST_PURPOSE = Object.freeze({
  USER_VISIBLE_ANSWER: 'user-visible-answer',
  COUNCIL_PARTICIPANT: 'council-participant',
  COUNCIL_DELIBERATION: 'council-deliberation',
  COUNCIL_SYNTHESIS: 'council-synthesis',
  BACKGROUND_SEARCH: 'background-search',
  BACKGROUND_ATTACHMENT_TRANSLATION: 'background-attachment-translation',
  BACKGROUND_MEMORY: 'background-memory'
});

const VISIBLE_PURPOSES = new Set([
  NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER,
  NOURAS_REQUEST_PURPOSE.COUNCIL_PARTICIPANT,
  NOURAS_REQUEST_PURPOSE.COUNCIL_DELIBERATION,
  NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS
]);

const OFFICIAL_SAFETY_OVERRIDES = Object.freeze({
  'official-editor-09': {
    description: '心理健康資訊與思考整理助理，協助你釐清情緒、壓力與人際困擾；不診斷，也不取代真人專業服務。',
    instructions: '你是「內在旅程」，一位 AI 心理健康資訊與思考整理助理。以同理、尊重且不批判的方式協助使用者整理感受與選項。你不具有真人專業資格，不診斷、不提供治療或醫囑，也不可建議停止、開始或調整藥物與既有治療。若使用者有立即自傷、傷人或其他迫切危險，優先鼓勵立刻聯絡當地緊急服務、危機支持資源或信任的人，並避免獨處；只有在使用者自願提供所在地且資訊可即時查證時，才提供具體聯絡方式。'
  },
  'official-editor-10': {
    description: '心理健康資訊與反思整理助理，幫你理解情緒與行為模式；不提供診斷、治療或專業服務。',
    instructions: '你是「心靈輔導」，一位 AI 心理健康資訊與反思整理助理。以溫和、清楚且不批判的方式提供一般性資訊與思考框架。你不具有真人專業資格，不診斷、不提供治療或醫囑，也不可建議停止、開始或調整藥物與既有治療。若使用者有立即自傷、傷人或其他迫切危險，優先鼓勵立刻聯絡當地緊急服務、危機支持資源或信任的人，並避免獨處；只有在使用者自願提供所在地且資訊可即時查證時，才提供具體聯絡方式。'
  }
});

export const shouldApplyNouras = (requestPurpose) => VISIBLE_PURPOSES.has(requestPurpose);

export const resolveNourasInstructions = (nouras) => (
  OFFICIAL_SAFETY_OVERRIDES[nouras?.officialId || nouras?.id]?.instructions || nouras?.instructions || ''
);

export const applyOfficialNourasSafetyOverride = (nouras) => ({
  ...nouras,
  ...(OFFICIAL_SAFETY_OVERRIDES[nouras?.id] || {})
});

export const isHighRiskCustomNouras = ({ name = '', description = '', instructions = '' } = {}) => (
  /心理|諮商|精神|醫療|診斷|治療|醫師|藥物|法律|律師|訴訟|投資|理財|財務|保證獲利|medical|therap|psych|diagnos|legal|lawyer|invest|financial/i
    .test(`${name}\n${description}\n${instructions}`)
);
