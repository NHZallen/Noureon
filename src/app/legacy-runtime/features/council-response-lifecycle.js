export function createCouncilResponseLifecycle({
  buildTavilySearchQuery,
  getSearchCurrentDate,
  getConfig,
  getActiveConversation,
  getCouncilSelectedModels,
  getCouncilTexts,
  getCouncilRuntimeTexts,
  getCouncilAttachmentTranslationNeed,
  getCouncilTranslatorModel,
  getCouncilSharedSearchModel,
  models,
  councilMaxModels,
  extractTextFromParts,
  truncateCouncilText,
  filterPartsForModelCapability,
  getSearchQueryFromParts,
  fetchTavilySearchPacket,
  streamCouncilApiCallWithRetry,
  modelUsesNativeWebSearch,
  modelSupportsVision,
  modelSupportsDocumentUpload
}) {
  const MODELS = models;
  const COUNCIL_MAX_MODELS = councilMaxModels;

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
  const buildCouncilSharedSearchPrompt = (parts) => `
  You are preparing a shared web research packet for a multi-model council.
  
  Current date:
  ${getSearchCurrentDate()}
  
  User request:
  ${extractTextFromParts(parts)}
  
  Search the web once, then produce a concise evidence packet for the council.
  This packet is system-generated council context, not user-provided material.
  - Label it as shared council research context.
  - Treat search evidence as newer than model pretraining.
  - Key current facts and dates
  - Important source names or URLs when available
  - Disagreements, uncertainty, and freshness risks
  - What the council should pay attention to
  
  Do not answer the user directly. Prepare shared context only.
  `;
  const buildCouncilSecondSearchPrompt = (parts, firstRoundResults = []) => `
  You are preparing a second web research packet before the Model Council discussion round.
  
  Current date:
  ${getSearchCurrentDate()}
  
  User request:
  ${extractTextFromParts(parts)}
  
  First-round council claims to verify:
  ${formatCouncilResponses(firstRoundResults).slice(0, 5000)}
  
  Search the web again with attention to claims, disagreements, dated facts, and missing evidence.
  For time-sensitive facts, dated search evidence overrides stale model pretraining.
  Do not answer the user directly. Prepare only an updated evidence packet for the discussion round.
  `;
  const buildCouncilSecondSearchQuery = (parts, firstRoundResults = []) => {
      const firstRoundFocus = formatCouncilResponses(firstRoundResults)
          .replace(/https?:\/\/\S+/g, ' ')
          .replace(/[#>*_`~\[\](){}|]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);
      return buildTavilySearchQuery(`${extractTextFromParts(parts)} verify latest facts dates evidence disagreements ${firstRoundFocus}`);
  };
  const getSearchPacketFromModel = async (searchModel, promptOrQuery, signal, options = {}) => {
      if (!searchModel) {
          throw new Error(getConfig().uiLanguage === 'en' ? 'No search-capable council synthesizer selected.' : '尚未選擇可搜索的理事會統整模型。');
      }
      if (modelUsesNativeWebSearch(searchModel)) {
          return await streamCouncilApiCallWithRetry(
              [{ text: promptOrQuery }],
              options.onChunk || (() => {}),
              signal,
              false,
              {
                  modelInfo: searchModel,
                  historyForApi: [],
                  forceWebSearch: true,
                  ignoreConversationWebSearch: true,
                  additionalSystemInstruction: options.systemInstruction || 'Prepare shared web research context. Do not answer the user directly.',
                  onRetry: options.onRetry
              }
          );
      }
      return await fetchTavilySearchPacket(promptOrQuery, signal, {
          label: options.label || 'Council web search packet',
          maxResults: options.maxResults || 6
      });
  };
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
  const buildCouncilAttachmentTranslationPackets = async (parts, selectedModels, signal, progress) => {
      const need = getCouncilAttachmentTranslationNeed(selectedModels, parts);
      if (!need.needsAnyPacket) {
          return { visualPacket: '', documentPacket: '', translatorModelId: null, translatorModelName: null };
      }
      const translatorModel = getCouncilTranslatorModel();
      if (!translatorModel) {
          throw new Error(getConfig().uiLanguage === 'en'
              ? 'Council attachments require a translator model in Settings.'
              : '理事會附件需要先在設定中選擇轉譯模型。');
      }
      const result = {
          visualPacket: '',
          documentPacket: '',
          translatorModelId: translatorModel.id,
          translatorModelName: translatorModel.name
      };
      const runTranslation = async (kind) => {
          const label = kind === 'visual'
              ? (getConfig().uiLanguage === 'en' ? 'image translation packet' : '圖片轉譯包')
              : (getConfig().uiLanguage === 'en' ? 'document translation packet' : '文件轉譯包');
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
                  historyForApi: [],
                  ignoreConversationWebSearch: true,
                  additionalSystemInstruction: 'You are only translating attachments into detailed neutral text packets for a model council. Do not answer the user.',
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
  const buildCouncilRequestPartsForModel = (parts, sharedSearchPacket, attachmentPackets, model) => {
      const result = [];
      if (sharedSearchPacket?.trim()) {
          result.push({
              text: `# Shared council search packet (system-generated, not user-provided)\nCurrent date: ${getSearchCurrentDate()}\nUse this as common research context. Do not say or imply that the user provided this packet. For time-sensitive facts, dated search evidence overrides stale model pretraining.\n\n${truncateCouncilText(sharedSearchPacket, 5000)}\n\n# User request follows`
          });
      }
      const attachmentPacket = buildAttachmentPacketTextForModel(model, attachmentPackets);
      if (attachmentPacket) {
          result.push({ text: attachmentPacket });
      }
      result.push(...filterPartsForModelCapability(parts, model));
      return result;
  };
  const buildCouncilSynthesisPartsForModel = (synthesisPrompt, originalParts, attachmentPackets, model) => {
      const result = [{ text: synthesisPrompt }];
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
  如果你看到「Shared council search packet」，那是系統為理事會產生的共同搜尋資料，不是使用者提供的資料；引用時請稱為「共同搜尋資料」或「搜尋資料包」。
  目前模式：${mode === 'deliberation' ? '討論模式，第一輪先提出自己的最佳答案。' : '共識模式，提出自己的最佳答案供統整模型比較。'}
  `;
  const buildSharedSearchSection = (sharedSearchPacket = '') => sharedSearchPacket?.trim()
      ? `\n# 理事會共同搜尋資料（系統產生，不是使用者提供）\n${truncateCouncilText(sharedSearchPacket, 5000)}\n`
      : '';
  const buildCouncilDeliberationPrompt = (originalParts, sharedSearchPacket, firstRoundResults, currentModelName) => `
  你正在參與模型理事會第二輪討論。以下是使用者問題與其他模型第一輪答案。
  
  # 使用者問題
  ${extractTextFromParts(originalParts)}
  ${buildSharedSearchSection(sharedSearchPacket)}
  
  # 第一輪答案
  ${formatCouncilResponses(firstRoundResults)}
  
  # 你的任務
  你是 ${currentModelName}。請根據其他答案修正或補強你的看法：
  - 指出你同意的共識。
  - 指出你認為有問題、缺漏或需要修正的地方。
  - 給出你第二輪後的最佳答案。
  - 不要把「理事會共同搜尋資料」稱為使用者提供的資料。
  `;
  const buildCouncilSynthesisPrompt = (conv, originalParts, sharedSearchPacket, firstRoundResults, finalRoundResults, failures, mode) => `
  你是使用者指定的「模型理事會統整模型」。請閱讀多個模型的回答，產生給使用者的最終答案。
  
  # 使用者問題
  ${extractTextFromParts(originalParts)}
  ${buildSharedSearchSection(sharedSearchPacket)}
  
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
  - 若使用共同搜尋資料，請稱為「共同搜尋資料」或「搜尋資料包」，不要寫成「你提供的資料」。
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
  async function runModelCouncil(parts, signal, onProgress, onFinalChunk) {
      const conv = getActiveConversation();
      const { council, participants, synthesizer } = getCouncilSelectedModels(conv);
      const texts = getCouncilTexts();
      const runtimeTexts = getCouncilRuntimeTexts();
      const mode = council.mode;
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
      const searchState = conv.isWebSearchEnabled
          ? { status: 'pending', label: runtimeTexts.sharedSearch, detail: runtimeTexts.pending }
          : null;
      const startedAt = Date.now();
      let progressTick = 0;
      const progress = (stage, message = stage, extra = {}) => {
          if (typeof onProgress !== 'function') return;
          onProgress({
              stage,
              message,
              mode,
              tick: ++progressTick,
              startedAt,
              elapsedMs: Date.now() - startedAt,
              searchEnabled: Boolean(searchState),
              totalParticipants: participants.length,
              activeParticipants: activeParticipants.length,
              modelStates: Array.from(modelStates.values()),
              search: searchState ? { ...searchState } : null,
              ...extra
          });
      };
      const createCouncilStreamTracker = (state, stage, modelName) => {
          let receivedChars = 0;
          let lastUpdateAt = 0;
          return (chunk = '') => {
              receivedChars += String(chunk || '').length;
              const now = Date.now();
              if (!state || now - lastUpdateAt < 850) return;
              lastUpdateAt = now;
              const chunkUnit = getConfig().uiLanguage === 'en' ? 'chunks' : '段內容';
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
          progress
      );
      let sharedSearchPacket = '';
      if (searchState) {
          const sharedSearchModel = getCouncilSharedSearchModel(synthesizer);
          searchState.status = 'running';
          searchState.detail = `${runtimeTexts.searchRunning}: ${sharedSearchModel?.name || 'Tavily'}`;
          progress('search', searchState.detail);
          try {
              const searchStreamTracker = createCouncilStageTracker('search', () => runtimeTexts.searchRunning);
              sharedSearchPacket = await getSearchPacketFromModel(
                  sharedSearchModel,
                  modelUsesNativeWebSearch(sharedSearchModel) ? buildCouncilSharedSearchPrompt(parts) : getSearchQueryFromParts(parts),
                  signal,
                  {
                      label: 'Shared council web search packet',
                      systemInstruction: 'Prepare shared web research context for the council. Do not answer the user directly.',
                      onChunk: () => {
                          searchState.detail = runtimeTexts.running;
                          searchStreamTracker();
                      },
                      onRetry: () => {
                          searchState.detail = runtimeTexts.retrying;
                          progress('search', `${runtimeTexts.searchRunning} 繚 ${runtimeTexts.retrying}`);
                      }
                  }
              );
  
              searchState.status = 'done';
              searchState.detail = runtimeTexts.searchDone;
              progress('search', runtimeTexts.searchDone);
          } catch (error) {
              searchState.status = 'failed';
              searchState.detail = `${runtimeTexts.searchFailed}: ${error.message}`;
              progress('search', searchState.detail);
          }
      }
      progress('firstRound', `${runtimeTexts.firstRound}: ${activeParticipants.length}/${participants.length}`);
      const firstRoundSettled = await Promise.allSettled(activeParticipants.map(async (modelInfo) => {
          const state = modelStates.get(modelInfo.id);
          if (state) {
              state.status = 'running';
              state.detail = runtimeTexts.running;
              progress('firstRound', `${runtimeTexts.firstRound}: ${modelInfo.name}`);
          }
          const councilParts = buildCouncilRequestPartsForModel(parts, sharedSearchPacket, attachmentTranslation, modelInfo);
          const text = await streamCouncilApiCallWithRetry(
              councilParts,
              createCouncilStreamTracker(state, 'firstRound', modelInfo.name),
              signal,
              false,
              {
                  modelInfo,
                  ignoreConversationWebSearch: true,
                  additionalSystemInstruction: buildCouncilMemberInstruction(mode),
                  onRetry: () => {
                      if (state) {
                          state.detail = runtimeTexts.retrying;
                          progress('firstRound', `${runtimeTexts.retrying}: ${modelInfo.name}`);
                      }
                  }
              }
          );
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
      const firstRoundResults = [];
      firstRoundSettled.forEach((result, index) => {
          const modelInfo = activeParticipants[index];
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
  
      let secondSearchPacket = '';
      let combinedSearchPacket = sharedSearchPacket;
      let finalRoundResults = firstRoundResults;
      if (mode === 'deliberation' && firstRoundResults.length > 1) {
          if (searchState) {
              const sharedSearchModel = getCouncilSharedSearchModel(synthesizer);
              searchState.status = 'running';
              searchState.detail = `${runtimeTexts.searchRunning}: ${sharedSearchModel?.name || 'Tavily'} (discussion)`;
              progress('search', searchState.detail);
              try {
                  const searchStreamTracker = createCouncilStageTracker('search', () => searchState.detail);
                  secondSearchPacket = await getSearchPacketFromModel(
                      sharedSearchModel,
                      modelUsesNativeWebSearch(sharedSearchModel)
                          ? buildCouncilSecondSearchPrompt(parts, firstRoundResults)
                          : buildCouncilSecondSearchQuery(parts, firstRoundResults),
                      signal,
                      {
                          label: 'Second council discussion web search packet',
                          systemInstruction: 'Prepare updated web research context before the council discussion round. Do not answer the user directly.',
                          onChunk: () => {
                              searchState.detail = runtimeTexts.running;
                              searchStreamTracker();
                          },
                          onRetry: () => {
                              searchState.detail = runtimeTexts.retrying;
                              progress('search', `${runtimeTexts.searchRunning} 繚 ${runtimeTexts.retrying}`);
                          }
                      }
                  );
                  combinedSearchPacket = [sharedSearchPacket, secondSearchPacket]
                      .filter(text => text?.trim())
                      .map((text, index) => `# Council search packet ${index + 1}\n${text}`)
                      .join('\n\n---\n\n');
                  searchState.status = 'done';
                  searchState.detail = runtimeTexts.searchDone;
                  progress('search', runtimeTexts.searchDone);
              } catch (error) {
                  searchState.status = 'failed';
                  searchState.detail = `${runtimeTexts.searchFailed}: ${error.message}`;
                  progress('search', searchState.detail);
              }
          }
          progress('deliberation', runtimeTexts.deliberation);
          const secondRoundSettled = await Promise.allSettled(firstRoundResults.map(async (result) => {
              const modelInfo = MODELS.find(model => model.id === result.modelId);
              const state = modelStates.get(result.modelId);
              if (state) {
                  state.status = 'running';
                  state.detail = runtimeTexts.deliberation;
                  progress('deliberation', `${runtimeTexts.deliberation}: ${result.modelName}`);
              }
              const text = await streamCouncilApiCallWithRetry(
                  [{
                      text: `${buildCouncilDeliberationPrompt(parts, combinedSearchPacket, firstRoundResults, result.modelName)}
  
  Important anti-conformity rule:
  Do not change your judgment merely because most other models disagree. Only revise your position when another model provides clear evidence or stronger reasoning. If you keep a minority view, state the reason clearly.`
                  }],
                  createCouncilStreamTracker(state, 'deliberation', result.modelName),
                  signal,
                  false,
                  {
                      modelInfo,
                      historyForApi: [],
                      ignoreConversationWebSearch: true,
                      additionalSystemInstruction: '你正在進行模型理事會第二輪修正，請聚焦於修正、反駁與補強，不要重複寒暄。不要把共同搜尋資料稱為使用者提供的資料。',
                      onRetry: () => {
                          if (state) {
                              state.detail = runtimeTexts.retrying;
                              progress('deliberation', `${runtimeTexts.retrying}: ${result.modelName}`);
                          }
                      }
                  }
              );
              if (state) {
                  state.status = 'done';
                  state.detail = runtimeTexts.done;
                  progress('deliberation', `${runtimeTexts.done}: ${result.modelName}`);
              }
              return { ...result, roundTwo: text, finalText: text || result.roundOne };
          }));
          finalRoundResults = secondRoundSettled.map((result, index) => {
              if (result.status === 'fulfilled') return result.value;
              const fallback = firstRoundResults[index];
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
          });
      }
  
      progress('synthesis', `${runtimeTexts.synthesis}: ${synthesizer.name}`);
      const synthesisPrompt = buildCouncilSynthesisPrompt(conv, parts, combinedSearchPacket, firstRoundResults, finalRoundResults, failures, mode);
      const synthesisParts = buildCouncilSynthesisPartsForModel(synthesisPrompt, parts, attachmentTranslation, synthesizer);
      const synthesisInstruction = `You are the council synthesizer.
  Before output, internally compare the core claims from each model using these criteria: correctness, completeness, actionability, fit to the user's question, risk disclosure, and whether a claim is unverified.
  For each important claim, judge whether it is supported by multiple models, has clear reasoning, needs external verification, or could mislead the user.
  Only keep content that passes this check in the final answer.
  Do not refer to the shared council search packet as material provided by the user.
  For current facts, use dated source evidence from the search packet over stale pretrained knowledge. If sources conflict or freshness is unclear, say so instead of falling back to old assumptions.
  Avoid overly brief answers: the final response should be complete enough for the user's decision unless the question is trivial.${buildCouncilComparisonInstruction(council.showComparisonTable)}`;
      let finalText = '';
      let synthesisError = null;
      try {
          const synthesisStageTracker = createCouncilStageTracker('synthesis', () => `${runtimeTexts.synthesis}: ${synthesizer.name}`);
          finalText = await streamCouncilApiCallWithRetry(
              synthesisParts,
              (chunk) => {
                  synthesisStageTracker(chunk);
                  onFinalChunk?.(chunk);
              },
              signal,
              false,
              {
                  modelInfo: synthesizer,
                  historyForApi: [],
                  ignoreConversationWebSearch: true,
                  additionalSystemInstruction: synthesisInstruction,
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
      return {
          text: finalText,
          metadata: {
              mode,
              participantModelIds: participants.map(model => model.id),
              activeParticipantModelIds: activeParticipants.map(model => model.id),
              skippedParticipantModelIds: skippedParticipants.map(model => model.id),
              synthesizerModelId: synthesizer.id,
              sharedSearchPacket: sharedSearchPacket || null,
              secondSearchPacket: secondSearchPacket || null,
              attachmentTranslation,
              showComparisonTable: council.showComparisonTable,
              firstRoundResults,
              finalRoundResults,
              failures,
              synthesisError: synthesisError?.message || null
          }
      };
  }

  return {
    runModelCouncil
  };
}
