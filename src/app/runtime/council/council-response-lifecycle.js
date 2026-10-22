import { getRuntimeText } from '../i18n/runtime-texts.js';
import { NOURAS_REQUEST_PURPOSE } from '../nouras/nouras-policy.js';
import { resolveInvokedSkills } from '../skill/skill-bridge.js';
import { invokedSkillsInstruction, skillNamesOfParts } from '../../../data/skill-prompt.js';
import { createMemberSteps } from './council-member-steps.js';

export function createCouncilResponseLifecycle({
  getSearchCurrentDate,
  getConfig,
  getActiveConversation,
  getCouncilSelectedModels,
  getCouncilTexts,
  getCouncilRuntimeTexts,
  getCouncilAttachmentTranslationNeed,
  getCouncilTranslatorModel,
  models,
  councilMaxModels,
  extractTextFromParts,
  truncateCouncilText,
  filterPartsForModelCapability,
  readLinkedPages = async () => '',
  readsLinkedPages = () => false,
  streamCouncilApiCallWithRetry,
  // The members' own answers with their tools (council-member-reply.js: `createCouncilMembers`), made for each council: `(conversation, parts) => members`.
  // Without it a member answers in one call, with no tools.
  createMembers = null,
  modelSupportsVision,
  modelSupportsDocumentUpload
}) {
  const MODELS = models;

  const formatRecentConversationContext = (conv) => {
      if (!conv?.messages?.length) return '';
      return conv.messages
          .slice(Math.max(0, conv.messages.length - 8), -1)
          .map(message => {
              const role = message.role === 'model' ? 'assistant' : 'user';
              return `${role}: ${truncateCouncilText(extractTextFromParts(message.parts || []), 1200)}`;
          })
          .filter(line => !line.endsWith(': '))
          .join('\n\n');
  };
  const formatCouncilResponses = (results = []) => results.map(result => `
  ### ${result.modelName}
  
  ${truncateCouncilText(result.finalText || result.roundTwo || result.roundOne)}
  `).join('\n');
  const buildCouncilAttachmentTranslationPrompt = (kind, parts) => {
      const requestText = extractTextFromParts(parts);
      const title = kind === 'visual' ? '圖片/影像轉譯包' : '文件轉譯包';
      const target = kind === 'visual'
          ? 'attached images or videos'
          : 'attached documents and non-visual files';
      return `
  You are the Model Council attachment translator.
  
  Create a detailed, neutral ${title} for council models that cannot directly read ${target}.
  Do not answer the user's question. Translate the attachment content into faithful text only.
  
  User request for context:
  ${requestText}
  
  Output requirements:
  - Start with "# ${title}".
  - Describe all visible/readable facts in detail.
  - Preserve exact wording, numbers, tables, labels, UI text, filenames, page or section hints, and uncertainty.
  - For images/screenshots: include layout, objects, colors only when meaningful, text/OCR, relationships, and anything needed for reasoning.
  - For documents: include structure, headings, key paragraphs, tables, lists, data, citations, and page/section references when available.
  - Separate observed content from inference.
  - Mention unreadable, truncated, missing, low-confidence, or unsupported portions.
  - Do not invent content that is not present.
  `;
  };
  const filterAttachmentPartsByKind = (parts = [], kind) => parts.filter(part => {
      if (part.text) return true;
      if (!part.inlineData) return false;
      const mimeType = part.inlineData.mimeType || '';
      const isVisual = mimeType.startsWith('image/') || mimeType.startsWith('video/');
      return kind === 'visual' ? isVisual : !isVisual;
  });
  const buildCouncilAttachmentTranslationPackets = async (parts, selectedModels, signal, progress, conversation) => {
      const need = getCouncilAttachmentTranslationNeed(selectedModels, parts);
      if (!need.needsAnyPacket) {
          return { visualPacket: '', documentPacket: '', translatorModelId: null, translatorModelName: null };
      }
      const translatorModel = getCouncilTranslatorModel();
      if (!translatorModel) {
          throw new Error(getRuntimeText(getConfig().uiLanguage, 'councilTranslatorRequired'));
      }
      const result = {
          visualPacket: '',
          documentPacket: '',
          translatorModelId: translatorModel.id,
          translatorModelName: translatorModel.name
      };
      const runTranslation = async (kind) => {
          const label = getRuntimeText(getConfig().uiLanguage, kind === 'visual' ? 'imageTranslationPacket' : 'documentTranslationPacket');
          progress?.('translation', `${label}: ${translatorModel.name}`);
          const translationParts = [
              { text: buildCouncilAttachmentTranslationPrompt(kind, parts) },
              ...filterAttachmentPartsByKind(parts, kind).filter(part => part.inlineData)
          ];
          return await streamCouncilApiCallWithRetry(
              translationParts,
              () => progress?.('translation', `${label}: ${translatorModel.name}`),
              signal,
              false,
              {
                  modelInfo: translatorModel,
                  conversation,
                  historyForApi: [],
                  ignoreConversationWebSearch: true,
                  disableReasoning: true,
                  additionalSystemInstruction: 'You are only translating attachments into detailed neutral text packets for a model council. Do not answer the user.',
                  requestPurpose: NOURAS_REQUEST_PURPOSE.BACKGROUND_ATTACHMENT_TRANSLATION,
              }
          );
      };
      if (need.needsVisualPacket) {
          result.visualPacket = await runTranslation('visual');
      }
      if (need.needsDocumentPacket) {
          result.documentPacket = await runTranslation('document');
      }
      return result;
  };
  const buildAttachmentPacketTextForModel = (model, packets = {}) => {
      const sections = [];
      if (packets.visualPacket?.trim() && !modelSupportsVision(model)) {
          sections.push(`# 圖片轉譯包\n${truncateCouncilText(packets.visualPacket, 6000)}`);
      }
      if (packets.documentPacket?.trim() && !modelSupportsDocumentUpload(model)) {
          sections.push(`# 文件轉譯包\n${truncateCouncilText(packets.documentPacket, 6000)}`);
      }
      if (sections.length === 0) return '';
      return `# Attachment translation packet\nThis packet is system-generated by the configured council translator model. It replaces only the attachment types this model cannot read directly. Do not say the user wrote this packet.\n\n${sections.join('\n\n')}\n\n# User request follows`;
  };
  const buildCouncilRequestPartsForModel = (parts, attachmentPackets, model, linkedPagesText = '') => {
      const result = [];
      if (linkedPagesText) result.push({ text: linkedPagesText });
      const attachmentPacket = buildAttachmentPacketTextForModel(model, attachmentPackets);
      if (attachmentPacket) {
          result.push({ text: attachmentPacket });
      }
      result.push(...filterPartsForModelCapability(parts, model));
      return result;
  };
  const buildCouncilSynthesisPartsForModel = (synthesisPrompt, originalParts, attachmentPackets, model, linkedPagesText = '') => {
      const result = [{ text: synthesisPrompt }];
      if (linkedPagesText) result.push({ text: linkedPagesText });
      const attachmentPacket = buildAttachmentPacketTextForModel(model, attachmentPackets);
      if (attachmentPacket) {
          result.push({ text: attachmentPacket });
      }
      result.push(...filterPartsForModelCapability(originalParts, model).filter(part => part.inlineData));
      return result;
  };

  const buildCouncilComparisonInstruction = (enabled) => enabled ? `
  
  Additional output requirement:
  After the final answer, include a concise collapsed "共識與差異整理" section using this HTML wrapper:
  <details class="council-collapse"><summary>共識與差異整理</summary>
  ...your Markdown table and notes...
  </details>
  All comparison tables, bullets, and notes must stay inside this wrapper. Do not repeat or continue comparison Markdown after the closing </details> tag.
  Use a Markdown table when it helps. Cover:
  - Points where council members agree
  - Meaningful disagreements or tradeoffs
  - Which models raised each point
  - A short note on how the final answer resolves those differences
  ` : '';
  const buildCouncilMemberInstruction = (mode) => `
  你是「模型理事會」中的獨立成員。請先獨立思考，不要假設其他模型會補足你的答案。
  請提供清楚、可驗證、可執行的回答；若資訊不足，請明確標出不確定處。
  你有工具時，需要查的事自己查（搜尋、開網頁、載入技能、讀使用者連接的服務）；你只能讀，不能改任何東西，要做的事留給統整模型。
  目前日期：${getSearchCurrentDate()}。
  目前模式：${mode === 'deliberation' ? '討論模式，第一輪先提出自己的最佳答案。' : '共識模式，提出自己的最佳答案供統整模型比較。'}
  `;
  // The pages the members met, with the numbers their answers cite them by.
  const SOURCES_LISTED = 60;
  const buildSourcesSection = (sources = []) => {
      const read = new Set(sources.filter(source => source.read).map(source => source.url));
      const listed = [];
      const seen = new Set();
      for (const source of [...sources].sort((a, b) => a.n - b.n)) {
          if (seen.has(source.n)) continue;
          seen.add(source.n);
          listed.push(`[${source.n}] ${String(source.title || source.url).replace(/\s+/g, ' ').slice(0, 140)} — ${source.url}${read.has(source.url) ? '（成員讀過全文）' : ''}`);
      }
      if (!listed.length) return '';
      return `\n# 成員查到的來源（系統整理，不是使用者提供）\n${listed.slice(0, SOURCES_LISTED).join('\n')}${listed.length > SOURCES_LISTED ? `\n…（另有 ${listed.length - SOURCES_LISTED} 個）` : ''}\n`;
  };
  const buildCouncilDeliberationPrompt = (originalParts, sources, firstRoundResults, currentModelName) => `
  你正在參與模型理事會第二輪討論。以下是使用者問題與其他模型第一輪答案。
  
  # 使用者問題
  ${extractTextFromParts(originalParts)}
  ${buildSourcesSection(sources)}
  
  # 第一輪答案
  ${formatCouncilResponses(firstRoundResults)}
  
  # 你的任務
  你是 ${currentModelName}。請根據其他答案修正或補強你的看法：
  - 指出你同意的共識。
  - 指出你認為有問題、缺漏或需要修正的地方。
  - 給出你第二輪後的最佳答案。
  - 對其他模型的說法有疑問、而你有工具時，可以自己查證；不要重複大家已經查過的。
  - 答案中的 [數字] 是來源編號（上面的清單），引用時沿用同一個編號。
  `;
  const buildCouncilSynthesisPrompt = (conv, originalParts, sources, firstRoundResults, finalRoundResults, failures, mode) => `
  你是使用者指定的「模型理事會統整模型」。請閱讀多個模型的回答，產生給使用者的最終答案。
  
  # 使用者問題
  ${extractTextFromParts(originalParts)}
  ${buildSourcesSection(sources)}
  
  ${formatRecentConversationContext(conv) ? `# 近期對話脈絡\n${formatRecentConversationContext(conv)}\n` : ''}
  # 理事會模式
  ${mode === 'deliberation' ? '討論模式：模型已完成第一輪獨立回答與第二輪修正。' : '共識模式：模型已完成第一輪獨立回答。'}
  
  # 可用模型觀點
  ${formatCouncilResponses(finalRoundResults)}
  
  ${failures.length ? `# 未完成模型\n${failures.map(item => `- ${item.modelName}: ${item.error}`).join('\n')}\n` : ''}
  # 統整要求
  - 先回應使用者的核心問題，但不要只給短結論或簡答版；不要用「直接結論」這類像速答的標題作開場。
  - 除非問題本身非常簡單，請至少包含：判斷摘要、主要依據與推理、重要分歧或不確定性、風險提示或後續觀察點。
  - 優先採納有明確理由、相互印證、符合使用者需求的內容。
  - 若模型之間有重要分歧，請簡短說明分歧與你的取捨。
  - 若答案存在風險或不確定性，請明確標出。
  - 成員答案中的 [數字] 是上面來源清單的編號。用到某個來源支持的說法時，把它的編號放在句尾，例如 [2] 或 [1][3]；只用清單裡有的編號，不要自己編，結尾不要另列來源清單（介面會顯示）。不要把成員查到的資料說成使用者提供的。
  - 使用自然、清楚、可執行的語氣。
  - 不要用「如果你要，我可以...」作為結尾。
  `;
  const buildCouncilAppendix = (firstRoundResults, finalRoundResults, failures, mode) => {
      const texts = getCouncilTexts();
      const sections = [`\n\n<details class="council-collapse">\n<summary>${texts.rawNotes}</summary>\n\n**${mode === 'deliberation' ? texts.deliberationMode : texts.consensusMode}**`];
      sections.push('\n\n### First round\n');
      sections.push(formatCouncilResponses(firstRoundResults));
      if (mode === 'deliberation') {
          sections.push(`\n\n### ${texts.deliberationRound}\n`);
          sections.push(formatCouncilResponses(finalRoundResults));
      }
      if (failures.length) {
          sections.push(`\n\n### ${texts.failedModels}\n`);
          sections.push(failures.map(item => `- **${item.modelName}**: ${item.error}`).join('\n'));
      }
      sections.push('\n\n</details>');
      return sections.join('');
  };
  async function runModelCouncil(parts, signal, onProgress, onFinalChunk, {
      webSearchEnabled = null,
      conversation = null,
      onMemoryContextResolved = () => {},
      // Models that already left this council (a council taken up again after a restart), and what is told when another leaves.
      exitedModelIds = [],
      onMemberExit = () => {},
      // The synthesis made as a whole reply (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.2): it may search nothing but may use
      // everything else a reply has (files, Python, CLI tools, connectors that change things). `synthesize({ parts, instruction, sources, synthesizer,
      // conversation, onMemoryContextResolved })` resolves { text, ... } (what else it gives is handed back as `synthesis`). Without it, one call.
      synthesize = null
  } = {}) {
      const conv = conversation || getActiveConversation();
      const { council, participants, synthesizer } = getCouncilSelectedModels(conv);
      const texts = getCouncilTexts();
      const runtimeTexts = getCouncilRuntimeTexts();
      const mode = council.mode;
      // The skills asked for with "/" in this message go to every call of the council (the members, the second round and the synthesis).
      const skillInstruction = invokedSkillsInstruction(await resolveInvokedSkills(skillNamesOfParts(parts)));
      const withSkills = (instruction) => (skillInstruction ? [instruction, skillInstruction].filter(Boolean).join('\n\n') : instruction);
      const activeParticipants = participants;
      const skippedParticipants = [];
      const modelStates = new Map();
      participants.forEach(model => {
          const isSkipped = skippedParticipants.some(item => item.id === model.id);
          modelStates.set(model.id, {
              modelId: model.id,
              modelName: model.name,
              status: isSkipped ? 'skipped' : 'pending',
              detail: isSkipped ? runtimeTexts.skippedVisualReason : runtimeTexts.pending
          });
      });
      // A person may let a model that is still answering leave the council: its answers do not count, and the others go on.
      const exitedIds = new Set(exitedModelIds);
      exitedIds.forEach(id => {
          const state = modelStates.get(id);
          if (state) {
              state.status = 'exited';
              state.detail = runtimeTexts.exited;
          }
      });
      const memberControllers = new Map();
      let currentStage = 'firstRound';
      // Each member searches by itself when the search is on (there is no shared search any more).
      const searchOn = webSearchEnabled === true || Boolean(conv.isWebSearchEnabled);
      const members = typeof createMembers === 'function' ? await createMembers(conv, parts) : null;
      // What each member did (the counts and the newest steps), for the panel.
      const memberSteps = new Map();
      const stepsOf = (modelId) => {
          if (!memberSteps.has(modelId)) memberSteps.set(modelId, createMemberSteps());
          return memberSteps.get(modelId);
      };
      const startedAt = Date.now();
      let progressTick = 0;
      // When each stage began and ended (ms from the start), and how the members stood when the answering stage ended: the timeline shows them,
      // and they are kept with the message.
      const stageTimes = [];
      const enterStage = (stage) => {
          const last = stageTimes.at(-1);
          if (last?.key === stage) return;
          const at = Date.now() - startedAt;
          if (last && last.endMs === undefined) {
              last.endMs = at;
              if (last.key === 'firstRound' || last.key === 'deliberation') {
                  const states = Array.from(modelStates.values());
                  last.done = states.filter(state => state.status === 'done').length;
                  last.failed = states.filter(state => state.status === 'failed').length;
              }
          }
          if (stage !== 'completed') stageTimes.push({ key: stage, startMs: at });
      };
      const progress = (stage, message = stage, extra = {}) => {
          enterStage(stage);
          if (typeof onProgress !== 'function') return;
          currentStage = stage;
          onProgress({
              stage,
              message,
              mode,
              tick: ++progressTick,
              startedAt,
              elapsedMs: Date.now() - startedAt,
              searchEnabled: searchOn,
              totalParticipants: participants.length,
              activeParticipants: activeParticipants.length,
              modelStates: Array.from(modelStates.values()).map(state => ({ ...state, canExit: canExitModel(state.modelId), ...(memberSteps.has(state.modelId) ? stepsOf(state.modelId).view() : {}) })),
              search: null,
              stages: stageTimes.map(entry => ({ ...entry })),
              exit: exitModel,
              ...extra
          });
      };
      // A model may leave while it is answering, when at least two others (or it and one more) would still be in the council.
      const canExitModel = (modelId) => ['firstRound', 'deliberation'].includes(currentStage)
          && modelStates.get(modelId)?.status === 'running'
          && participants.filter(model => model.id !== modelId && !['failed', 'exited', 'skipped'].includes(modelStates.get(model.id)?.status)).length >= 2;
      const exitModel = (modelId) => {
          if (!canExitModel(modelId)) return false;
          const state = modelStates.get(modelId);
          exitedIds.add(modelId);
          state.status = 'exited';
          state.detail = runtimeTexts.exited;
          memberControllers.get(modelId)?.abort();
          onMemberExit(modelId);
          progress(currentStage, `${runtimeTexts.exited}: ${state.modelName}`);
          return true;
      };
      // The signal of a member's call: the council's stop, or that member leaving.
      const memberSignal = (modelId) => {
          const controller = memberControllers.get(modelId) || new AbortController();
          memberControllers.set(modelId, controller);
          if (!signal) return controller.signal;
          const linked = new AbortController();
          const stop = () => linked.abort();
          if (signal.aborted || controller.signal.aborted) stop();
          signal.addEventListener?.('abort', stop, { once: true });
          controller.signal.addEventListener('abort', stop, { once: true });
          return linked.signal;
      };
      const createCouncilStreamTracker = (state, stage, modelName) => {
          let receivedChars = 0;
          let lastUpdateAt = 0;
          return (chunk = '') => {
              receivedChars += String(chunk || '').length;
              if (state) state.chars = receivedChars;
              const now = Date.now();
              if (!state || now - lastUpdateAt < 850) return;
              lastUpdateAt = now;
              const chunkUnit = getRuntimeText(getConfig().uiLanguage, 'chunks');
              state.detail = `${runtimeTexts.running} · ${Math.max(1, Math.round(receivedChars / 100))}${chunkUnit}`;
              progress(stage, `${runtimeTexts.running}: ${modelName}`);
          };
      };
      const createCouncilStageTracker = (stage, messageBuilder) => {
          let lastUpdateAt = 0;
          return () => {
              const now = Date.now();
              if (now - lastUpdateAt < 850) return;
              lastUpdateAt = now;
              progress(stage, typeof messageBuilder === 'function' ? messageBuilder() : messageBuilder);
          };
      };
  
      // One answer of a member: with its own tools when the council has them, else one call. Its steps go to the panel as they come.
      const answerAsMember = ({ modelInfo, parts: memberParts, stage, state, requestOptions }) => {
          const onChunk = createCouncilStreamTracker(state, stage, modelInfo.name);
          const onRetry = () => {
              if (state) {
                  state.detail = runtimeTexts.retrying;
                  progress(stage, `${runtimeTexts.retrying}: ${modelInfo.name}`);
              }
          };
          if (!members) return streamCouncilApiCallWithRetry(memberParts, onChunk, memberSignal(modelInfo.id), false, { ...requestOptions, onRetry });
          return members.answer({
              modelInfo,
              parts: memberParts,
              requestOptions,
              signal: memberSignal(modelInfo.id),
              searchOn,
              onChunk,
              onRetry,
              onStep: (step) => {
                  stepsOf(modelInfo.id).add(step);
                  progress(stage, `${modelInfo.name}: ${step.label || step.kind}`);
              }
          });
      };

      if (activeParticipants.length === 0) {
          throw new Error(runtimeTexts.noVisionParticipants);
      }
  
      const failures = skippedParticipants.map(model => ({
          modelId: model.id,
          modelName: model.name,
          error: runtimeTexts.skippedVisualReason,
          skipped: true
      }));
      const selectedCouncilModels = [...participants, synthesizer].filter(Boolean);
      const attachmentTranslation = await buildCouncilAttachmentTranslationPackets(
          parts,
          selectedCouncilModels,
          signal,
          progress,
          conv
      );
      // Web addresses in the message are read once for the whole council when one of its models cannot open a link.
      let linkedPagesText = '';
      if (selectedCouncilModels.some(readsLinkedPages)) {
          try {
              linkedPagesText = await readLinkedPages(parts, signal);
          } catch (error) {
              if (signal?.aborted) throw error;
          }
      }
      progress('firstRound', `${runtimeTexts.firstRound}: ${activeParticipants.length}/${participants.length}`);
      const roundOneMembers = activeParticipants.filter(model => !exitedIds.has(model.id));
      const firstRoundSettled = await Promise.allSettled(roundOneMembers.map(async (modelInfo) => {
          const state = modelStates.get(modelInfo.id);
          if (state) {
              state.status = 'running';
              state.detail = runtimeTexts.running;
              progress('firstRound', `${runtimeTexts.firstRound}: ${modelInfo.name}`);
          }
          const councilParts = buildCouncilRequestPartsForModel(parts, attachmentTranslation, modelInfo, linkedPagesText);
          const text = await answerAsMember({
              modelInfo,
              parts: councilParts,
              stage: 'firstRound',
              state,
              requestOptions: {
                  modelInfo,
                  conversation: conv,
                  ignoreConversationWebSearch: true,
                  disableReasoning: true,
                  additionalSystemInstruction: withSkills(buildCouncilMemberInstruction(mode)),
                  requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_PARTICIPANT
              }
          });
          if (exitedIds.has(modelInfo.id)) return null;
          if (state) {
              state.status = 'done';
              state.detail = runtimeTexts.done;
              progress('firstRound', `${runtimeTexts.done}: ${modelInfo.name}`);
          }
          return {
              modelId: modelInfo.id,
              modelName: modelInfo.name,
              roundOne: text,
              finalText: text
          };
      }));
      let firstRoundResults = [];
      firstRoundSettled.forEach((result, index) => {
          const modelInfo = roundOneMembers[index];
          // A model that left is neither an answer nor a failure.
          if (exitedIds.has(modelInfo.id)) return;
          if (result.status === 'fulfilled' && result.value?.roundOne?.trim()) {
              firstRoundResults.push(result.value);
          } else {
              const state = modelStates.get(modelInfo.id);
              if (state) {
                  state.status = 'failed';
                  state.detail = result.reason?.message || runtimeTexts.failed;
                  progress('firstRound', `${runtimeTexts.failed}: ${modelInfo.name}`);
              }
              failures.push({
                  modelId: modelInfo.id,
                  modelName: modelInfo.name,
                  error: result.reason?.message || 'No response'
              });
          }
      });
      if (firstRoundResults.length === 0) {
          const failureSummary = failures
              .filter(item => !item.skipped)
              .map(item => `${item.modelName}: ${item.error}`)
              .join('；');
          throw new Error(`${texts.title}: all participant models failed after one retry.${failureSummary ? ` ${failureSummary}` : ''}`);
      }
  
      let finalRoundResults = firstRoundResults;
      const memberSources = () => (members ? members.sources() : []);
      if (mode === 'deliberation' && firstRoundResults.length > 1) {
          progress('deliberation', runtimeTexts.deliberation);
          const secondRoundSettled = await Promise.allSettled(firstRoundResults.map(async (result) => {
              const modelInfo = MODELS.find(model => model.id === result.modelId);
              const state = modelStates.get(result.modelId);
              if (state) {
                  state.status = 'running';
                  state.detail = runtimeTexts.deliberation;
                  progress('deliberation', `${runtimeTexts.deliberation}: ${result.modelName}`);
              }
              const text = await answerAsMember({
                  modelInfo,
                  parts: [{
                      text: `${buildCouncilDeliberationPrompt(parts, memberSources(), firstRoundResults, result.modelName)}
  
  Important anti-conformity rule:
  Do not change your judgment merely because most other models disagree. Only revise your position when another model provides clear evidence or stronger reasoning. If you keep a minority view, state the reason clearly.`
                  }],
                  stage: 'deliberation',
                  state,
                  requestOptions: {
                      modelInfo,
                      conversation: conv,
                      historyForApi: [],
                      ignoreConversationWebSearch: true,
                      disableReasoning: true,
                      additionalSystemInstruction: withSkills('你正在進行模型理事會第二輪修正，請聚焦於修正、反駁與補強，不要重複寒暄。不要把成員查到的資料說成使用者提供的。'),
                      requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_DELIBERATION
                  }
              });
              if (exitedIds.has(result.modelId)) return null;
              if (state) {
                  state.status = 'done';
                  state.detail = runtimeTexts.done;
                  progress('deliberation', `${runtimeTexts.done}: ${result.modelName}`);
              }
              return { ...result, roundTwo: text, finalText: text || result.roundOne };
          }));
          finalRoundResults = secondRoundSettled.map((result, index) => {
              const fallback = firstRoundResults[index];
              // A model that left takes its first answer with it.
              if (exitedIds.has(fallback.modelId)) return null;
              if (result.status === 'fulfilled') return result.value;
              const state = modelStates.get(fallback.modelId);
              if (state) {
                  state.status = 'failed';
                  state.detail = result.reason?.message || runtimeTexts.failed;
                  progress('deliberation', `${runtimeTexts.failed}: ${fallback.modelName}`);
              }
              failures.push({
                  modelId: fallback.modelId,
                  modelName: fallback.modelName,
                  error: result.reason?.message || 'Second round failed'
              });
              return fallback;
          }).filter(Boolean);
          firstRoundResults = firstRoundResults.filter(result => !exitedIds.has(result.modelId));
      }
  
      progress('synthesis', `${runtimeTexts.synthesis}: ${synthesizer.name}`);
      const sources = memberSources();
      const synthesisPrompt = buildCouncilSynthesisPrompt(conv, parts, sources, firstRoundResults, finalRoundResults, failures, mode);
      const synthesisParts = buildCouncilSynthesisPartsForModel(synthesisPrompt, parts, attachmentTranslation, synthesizer, linkedPagesText);
      const synthesisInstruction = `You are the council synthesizer.
  Before output, internally compare the core claims from each model using these criteria: correctness, completeness, actionability, fit to the user's question, risk disclosure, and whether a claim is unverified.
  For each important claim, judge whether it is supported by multiple models, has clear reasoning, needs external verification, or could mislead the user.
  Only keep content that passes this check in the final answer.
  Do not refer to what the members found as material provided by the user.
  For current facts, use dated source evidence the members found over stale pretrained knowledge. If sources conflict or freshness is unclear, say so instead of falling back to old assumptions.
  Avoid overly brief answers: the final response should be complete enough for the user's decision unless the question is trivial.${buildCouncilComparisonInstruction(council.showComparisonTable)}`;
      let finalText = '';
      let synthesisError = null;
      let synthesisMade = null;
      try {
          const synthesisStageTracker = createCouncilStageTracker('synthesis', () => `${runtimeTexts.synthesis}: ${synthesizer.name}`);
          if (typeof synthesize === 'function') {
              synthesisMade = await synthesize({ parts: synthesisParts, instruction: withSkills(synthesisInstruction), sources, synthesizer, conversation: conv, onMemoryContextResolved });
              finalText = String(synthesisMade?.text ?? '');
          } else finalText = await streamCouncilApiCallWithRetry(
              synthesisParts,
              (chunk) => {
                  synthesisStageTracker(chunk);
                  onFinalChunk?.(chunk);
              },
              signal,
              false,
              {
                  modelInfo: synthesizer,
                  conversation: conv,
                  historyForApi: [],
                  ignoreConversationWebSearch: true,
                  disableReasoning: true,
                  additionalSystemInstruction: withSkills(synthesisInstruction),
                  requestPurpose: NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS,
                  onMemoryContextResolved,
                  onRetry: () => progress('synthesis', `${runtimeTexts.synthesis}: ${synthesizer.name} · ${runtimeTexts.retrying}`)
              }
          );
      } catch (error) {
          synthesisError = error;
          finalText = `模型理事會已完成成員回答，但統整模型 ${synthesizer.name} 未能完成統整：${error.message}\n\n以下提供可用模型觀點供參考。\n\n${formatCouncilResponses(finalRoundResults)}`;
      }
      if (council.showRawResponses) {
          finalText += buildCouncilAppendix(firstRoundResults, finalRoundResults, failures, mode);
      }
      progress('completed', runtimeTexts.completed);
      // What the message keeps of the council (the line "3 members discussed", opening to the timeline).
      const record = {
          mode,
          members: participants.map(model => {
              const state = modelStates.get(model.id) || {};
              const steps = memberSteps.has(model.id) ? stepsOf(model.id).view() : null;
              return { name: model.name, status: state.status || 'done', ...(state.chars ? { chars: state.chars } : {}), ...(steps ? { counts: steps.counts } : {}) };
          }),
          stages: stageTimes.map(entry => ({ key: entry.key, ms: Math.max(0, (entry.endMs ?? Date.now() - startedAt) - entry.startMs), ...(entry.done !== undefined ? { done: entry.done, failed: entry.failed } : {}) }))
      };
      return {
          text: finalText,
          record,
          // The pages the members met, numbered as the answers cite them (the saved message shows them as its sources).
          sources,
          ...(synthesisMade ? { synthesis: synthesisMade } : {}),
          metadata: {
              mode,
              participantModelIds: participants.map(model => model.id),
              activeParticipantModelIds: activeParticipants.map(model => model.id),
              skippedParticipantModelIds: skippedParticipants.map(model => model.id),
              synthesizerModelId: synthesizer.id,
              sharedSearchPacket: null,
              secondSearchPacket: null,
              attachmentTranslation,
              showComparisonTable: council.showComparisonTable,
              firstRoundResults,
              finalRoundResults,
              failures,
              exitedParticipantModelIds: [...exitedIds],
              synthesisError: synthesisError?.message || null
          }
      };
  }

  return {
    runModelCouncil
  };
}
