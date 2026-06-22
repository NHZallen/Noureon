                if (lastMessageDiv && lastMessageDiv.classList.contains('model-message')) {
                    const bubble = lastMessageDiv.querySelector('.message-bubble');
                    const content = lastMessageDiv.querySelector('.message-content');
                    const aiMessageObject = conv.messages[conv.messages.length - 1];
                    if (bubble && content && aiMessageObject && !bubble.querySelector('.absolute')) {
                        content.classList.add('pb-8');
                        const timeString = formatFullTimestamp(aiMessageObject.createdAt);
                        const actionButtonsHTML = `
                            <div class="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                                <button class="copy-content-btn p-1 rounded-md hover:bg-gray-500/20 text-[var(--text-secondary)] opacity-50 hover:opacity-100 transition-opacity" title="${i18n[config.uiLanguage].copyContent || '複製內容'}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                                <span class="text-xs text-gray-400">${timeString}</span>
                            </div>
                        `;
                        bubble.insertAdjacentHTML('beforeend', actionButtonsHTML);
                    }
                }
            }
        };
        function cleanGeminiHistory(history, targetModel = null) {
            const cleaned = []; 
            let lastRole = null;
            
            history.forEach(msg => {
                // ✨ 修正開始：在這裡進行資料清洗
                // 重新建構 parts，確保只保留 Gemini 接受的欄位 (text, inlineData)
                // 並且過濾掉 inlineData 中的 name 屬性
                const sanitizedParts = msg.parts.map(p => {
                    if (p.inlineData) {
                        if (targetModel && !modelSupportsUploadedFile(targetModel, { inlineData: p.inlineData })) {
                            return null;
                        }
                        return {
                            inlineData: {
                                mimeType: p.inlineData.mimeType,
                                data: p.inlineData.data
                                // 關鍵：這裡故意不放入 name，解決 Gemini 報錯問題
                            }
                        };
                    }
                    // 如果是文字，確保結構單純
                    if (p.text) {
                        return { text: p.text };
                    }
                    return null;
                }).filter(Boolean); // 過濾掉可能的空值


                const sanitizedMsg = { role: msg.role, parts: sanitizedParts };
                // ✨ 修正結束


                // 以下維持原本的邏輯 (過濾空訊息、合併連續 User 訊息)
                if (sanitizedMsg.role === 'model' && !sanitizedMsg.parts.some(p => (p.text && p.text.trim() !== '') || p.inlineData)) return;
                
                if (sanitizedMsg.role === lastRole && lastRole === 'user') {
                    cleaned[cleaned.length - 1].parts.push(...sanitizedMsg.parts);
                } else {
                    cleaned.push(sanitizedMsg);
                    lastRole = sanitizedMsg.role;
                }
            });
            
            if (cleaned.length > 0 && cleaned[0].role !== 'user') cleaned.shift();
            return cleaned;
        }
        function calculateRelevanceScore(summary, keywords) {
            if (!summary || !keywords || keywords.length === 0) {
                return 0;
            }
            const summaryLower = summary.toLowerCase();
            let score = 0;
            keywords.forEach(keyword => {
                if (summaryLower.includes(keyword.toLowerCase())) {
                    score++;
                }
            });
            const coverageRatio = score / keywords.length;
            return score * (1 + coverageRatio);
        }
        const STEP_PLAN_SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
        const STEP_PLAN_SUPPORTED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/x-matroska']);
        const STEP_PLAN_VIDEO_SIZE_LIMIT_BYTES = 128 * 1024 * 1024;
        const STEP_PLAN_CHAT_COMPLETIONS_URL = 'https://api.stepfun.com/v1/chat/completions';
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
        const getStepPlanAttachmentMimeType = (inlineData) => {
            const mimeType = String(inlineData.mimeType || '').toLowerCase();
            if (mimeType) return mimeType;
            const ext = /\.([a-zA-Z0-9]{1,8})$/.exec(String(inlineData.name || ''))?.[1]?.toLowerCase();
            return STEP_PLAN_MIME_TYPE_BY_EXTENSION[ext] || '';
        };
        const getBase64ByteLength = (base64 = '') => {
            const value = String(base64).replace(/\s/g, '');
            if (!value) return 0;
            const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
            return Math.floor((value.length * 3) / 4) - padding;
        };
        const appendStepPlanAttachmentContent = (content, inlineData, modelInfo) => {
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
        async function streamApiCall(parts, onChunk, signal, isWebSearchForced = false, requestOptions = {}) {
            const conv = getActiveConversation();
            const modelInfo = requestOptions.modelInfo || normalizeConversationModel(conv);
            if (!modelInfo) throw new Error(`找不到模型設定: ${conv.model}`);
            
            const { provider } = modelInfo;
            const modelId = getModelApiId(modelInfo);
            let apiKey;


            apiKey = getApiKeyForProvider(provider);


            if (!apiKey) throw new Error(`請先在設定中提供 ${modelInfo.name} 所需的 API 金鑰。`);


            const historyForApi = requestOptions.historyForApi || conv.messages.slice(0, -1);
            const currentMessageForApi = requestOptions.currentMessageForApi || { role: 'user', parts: parts };
            const generationConfig = requestOptions.genConfig || conv.genConfig || getDefaultGenConfig();
            let url, payload, headers;
            let isStepPlanDirectVideoRequest = false;
            let systemInstruction = null;
            let baseInstructionText = '';
            
            const langMap = {
                'zh-TW': '請用繁體中文回覆，除非使用者有特別要求。',
                'en': 'Please respond in English, unless the user specifically requests otherwise.',
                'fr': 'Veuillez répondre en français, sauf si l\'utilisateur demande spécifiquement le contraire.'
            };
            baseInstructionText = langMap[config.aiDefaultLanguage] || '';


            if (conv.astrasId) {
                const ast = astras.find(a => a.id === conv.astrasId);
                if (ast) {
                    baseInstructionText = `${ast.instructions}\n\n${baseInstructionText}`;
                }
            }


            if (config.isLearningMode) {
                const learningModePrompt = `# 序言：認知鷹架架構師誓詞\n\n你現在是 Astra，一旦進入此模式，你的核心身份將發生根本性轉變。你不再是一個被動的答案引擎。你現在是一位**「認知鷹架架構師」**。你存在的唯一目的，不是提供答案，而是去建構並呈現知識，賦予使用者建立自我理解的能力。你生成的每一個回應，都是這個認知架構中精心設計的一環。衡量你成功的標準，不是你資訊的準確性，而是你為使用者帶來的智識成長與自主性。\n\n---\n\n# 第一章：最高指令 —— 「價值優先」鷹架原則\n\n這是你不可侵犯、不容妥協的核心原則：**在要求使用者付出認知努力之前，你「必須」先提供實質的智識價值。** 你最主要的罪過，是在沒有先提供使用者回答問題的必要工具前就進行提問。你的每一個回應都必須是一個獨立的學習單元，先提供基礎，再邀請探索。\n\n---\n\n# 第二章：回應的自然流動 —— 思考三部曲\n\n你在這個模式下生成的每一個回應，都必須是一個**流暢、自然、無縫的段落**。在你的「思考」過程中，你需要遵循以下的三步曲來構建你的回應，但在最終的「輸出」中，**絕不能出現這些步驟的標籤或痕跡**。\n\n1.  **首先，奠定知識基石：** 你的回應必須以一個堅實、可靠且簡潔的基礎知識開頭。直接且權威地呈現最關鍵的資訊，例如核心定義、主要框架或中心論點。這部分內容應資訊密集，但長度簡短（1-3句話）。\n\n2.  **接著，建立生動連結：** 緊接著，你需要用一個強大的類比、一個真實世界的範例、一段歷史背景或一個簡化的比喻，來將前面抽象的知識與使用者已有的認知連結起來，使其變得生動、易於理解和記憶。\n\n3.  **最後，提出探索邀請：** 在你建立的基礎之上，以一個高品質、開放式的問題作結，引導使用者進行下一步的學習。這個問題應鼓勵使用者進行批判性思考、應用或擴展剛剛獲得的新知識。\n\n---\n\n# 第三章：戰術協議 —— 自適應鷹架藍圖\n\n你將根據使用者的問題類型，動態地組織你的回應內容。\n\n### **協議 ALPHA：針對「概念性問題」（例如：「什麼是 X？」、「為什麼 Y 會發生？」）**\n*   **你的角色：** 啟迪者\n*   **回應心法：** 你的回應應流暢地做到：先提供該概念教科書級別的精確定義，接著立即用一個富有創意、不落俗套的比喻來闡明它，最後再根據這個比喻提出一個能迫使使用者深入思考的引導性問題。\n\n### **協議 BETA：針對「流程性問題」（例如：「我該如何做 X？」）**\n*   **你的角色：** 架構師\n*   **回應心法：** 你的回應應流暢地做到：先將整個流程呈現為一個包含 2-4 個階段的高層次框架，給使用者一張心智地圖。然後，只詳細闡述第一階段的關鍵性與考量因素，最後針對第一階段提出一個務實的、以行動為導向的問題。\n\n### **協議 GAMMA：針對「研究性問題」（例如：「跟我說說關於 X 的事。」）**\n*   **你的角色：** 探索規劃師\n*   **回應心法：** 你的回應應流暢地做到：先重申研究主題並將其分解為 2-3 個不同的探究途徑。接著，為每個途徑提供包含「強效關鍵詞」和「建議來源類型」的入門包，最後提出一個策略性問題，幫助使用者根據目標選擇開始的方向。\n\n---\n\n# 第四章：通用行為準則與應急預案\n\n*   **認知同理心：** 你的語氣必須始終是一位有耐心、鼓勵人心的導師。使用諸如「這是一個很好的問題，讓我們來拆解它」、「我們現在正觸及問題的核心」以及「這是一個非常有洞察力的觀察」之類的語句。\n*   **清晰化協議 (逃生閥機制)：** 這是你的「緊急出口」。如果使用者明確表示困惑（「我不懂」、「直接告訴我」、「這太複雜了」），或連續兩次未能有效回應你的引導性問題，你**必須**啟動此協議。\n    1.  立即暫停三部曲的思考模式。\n    2.  切換到「清晰解說員」的人格。\n    3.  直接、簡單且全面地解釋當前的主題。\n    4.  在解釋結束時，用一句溫和的話語轉折，嘗試回到鷹架模式，例如：「既然我們清楚了這一點，讓我們回頭看看剛才關於……的想法。」\n*   **絕對禁令：**\n    *   **禁止**任何單一句、低價值的回應。\n    *   **禁止**要求使用者去做你該做的事（例如：「你能說得更具體一點嗎？」）。你的工作是主動提出具體的選項（如協議 GAMMA 所示）。\n    *   **禁止**重複的提問風格。多樣化你的引導性問題。\n    *   **禁止**假裝無知或遺忘。你是 AI，你記得所有上下文。\n    *   **【新增】禁止在回應中提及「錨點」、「橋樑」、「羅盤」、「三部曲」或任何來自本指導原則的結構性術語。你的思考過程必須對使用者完全隱藏，呈現出的應是天衣無縫的對話。**\n\n---\n\n# 第五章：模式啟動確認\n\n當使用者在對話中首次啟動此模式時，你必須發布以下一次性聲明以設定預期：\n\n"**學習模式已啟動。** 在此模式下，我不會直接給出答案，而是會提供核心知識並引導您一同思考。讓我們開始吧。"`;
                systemInstruction = { parts: [{ text: learningModePrompt }] };
            } else if (baseInstructionText) {
                systemInstruction = { parts: [{ text: baseInstructionText }] };
            }


            let memoryPrompt = '';
            if (config.memoryEnabled1) {
                const enabledMemories = personalMemories.filter(m => m.enabled).map(m => m.content).join('\n');
                if (enabledMemories) {
                    memoryPrompt += `個人習慣記憶：\n${enabledMemories}\n`;
                }
            }


            if (memoryPrompt) {
                if (systemInstruction && systemInstruction.parts[0].text) {
                    systemInstruction.parts[0].text += `\n\n${memoryPrompt}`;
                } else if (systemInstruction) {
                    systemInstruction.parts.push({ text: `\n\n${memoryPrompt}` });
                }
                else {
                    systemInstruction = { parts: [{ text: memoryPrompt }] };
                }
            }
            if (requestOptions.additionalSystemInstruction) {
                if (systemInstruction && systemInstruction.parts[0].text) {
                    systemInstruction.parts[0].text += `\n\n${requestOptions.additionalSystemInstruction}`;
                } else if (systemInstruction) {
                    systemInstruction.parts.push({ text: requestOptions.additionalSystemInstruction });
                } else {
                    systemInstruction = { parts: [{ text: requestOptions.additionalSystemInstruction }] };
                }
            }


            if (provider === 'gemini') {
                url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}`;
                payload = {
                    contents: cleanGeminiHistory([...historyForApi, currentMessageForApi], modelInfo),
                    generationConfig: {
                        ...(generationConfig.temperature !== null && { temperature: generationConfig.temperature }),
                        ...(generationConfig.topP !== null && { topP: generationConfig.topP }),
                        ...(generationConfig.maxTokens !== null && { maxOutputTokens: generationConfig.maxTokens }),
                    }
                };
                if (systemInstruction) {
                    payload.systemInstruction = systemInstruction;
                }
                const shouldUseWebSearch = !requestOptions.ignoreConversationWebSearch && conv.isWebSearchEnabled;
                if (shouldUseWebSearch || isWebSearchForced || requestOptions.forceWebSearch) {
                    payload.tools = [{"googleSearch": {}}];
                }
                headers = { 'Content-Type': 'application/json' };
            } else if (provider === 'nvidia' || provider === 'stepfun') {
                url = provider === 'stepfun' ? '/api/step-plan-chat' : '/api/nvidia-chat';
                const messages = [];
                if (systemInstruction) {
                    messages.push({ role: 'system', content: systemInstruction.parts.map(p => p.text).join('\n') });
                }

                const allMessages = [...historyForApi, currentMessageForApi];
                for (const m of allMessages) {
                    const role = m.role === 'model' ? 'assistant' : m.role;
                    const content = [];
                    for (const part of m.parts) {
                        if (part.text) {
                            content.push({ type: 'text', text: part.text });
                            continue;
                        }
                        if (!part.inlineData) continue;
                        const mimeType = part.inlineData.mimeType || '';
                        const base64Data = part.inlineData.data;
                        const fullDataUrl = `data:${mimeType};base64,${base64Data}`;
                        if (provider === 'stepfun') {
                            appendStepPlanAttachmentContent(content, part.inlineData, modelInfo);
                        } else if ((mimeType.startsWith('image/') || mimeType.startsWith('video/')) && modelSupportsVision(modelInfo)) {
                            content.push(mimeType.startsWith('video/')
                                ? { type: 'video_url', video_url: { url: fullDataUrl } }
                                : { type: 'image_url', image_url: { url: fullDataUrl, detail: 'high' } });
                        } else {
                            content.push({
                                type: 'text',
                                text: `[Attachment omitted for ${modelInfo.name}: ${part.inlineData.name || mimeType || 'file'}]`
                            });
                        }
                    }
                    const textOnly = content.length === 1 && content[0].type === 'text'
                        ? content[0].text
                        : content;
                    if ((Array.isArray(textOnly) && textOnly.length > 0) || (typeof textOnly === 'string' && textOnly.trim())) {
                        messages.push({ role, content: textOnly });
                    }
                }

                const hasStepPlanVideo = provider === 'stepfun' && messages.some(message =>
                    Array.isArray(message.content) &&
                    message.content.some(part => part?.type === 'video_url')
                );
                if (hasStepPlanVideo) {
                    url = STEP_PLAN_CHAT_COMPLETIONS_URL;
                    isStepPlanDirectVideoRequest = true;
                }

                payload = {
                    model: modelId,
                    messages,
                    stream: !hasStepPlanVideo,
                    ...(generationConfig.temperature !== null && { temperature: generationConfig.temperature }),
                    ...(generationConfig.topP !== null && { top_p: generationConfig.topP }),
                    ...(generationConfig.maxTokens !== null && { max_tokens: generationConfig.maxTokens }),
                };
                if (provider === 'stepfun' && modelInfo.reasoningEffort) {
                    payload.reasoning_effort = modelInfo.reasoningEffort;
                }
                headers = {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    ...(hasStepPlanVideo && { Accept: 'application/json' })
                };
            } else {
                url = 'https://openrouter.ai/api/v1/chat/completions';
                
                const messages = [];
                if (systemInstruction) {
                    messages.push({ role: 'system', content: systemInstruction.parts.map(p => p.text).join('\n') });
                }


                // 將我們的對話歷史轉換為 OpenRouter API 接受的格式
                const allMessages = [...historyForApi, currentMessageForApi];
                let hasOpenRouterFileAttachment = false;


                allMessages.forEach(m => {
                    const role = m.role === 'model' ? 'assistant' : m.role;
                    
                    // 檢查是否有非文字的內容 (圖片或檔案)
                    const hasAttachment = m.parts.some(p => p.inlineData);


                    if (hasAttachment) {
                        const content = m.parts.map(part => {
                            if (part.text) {
                                return { type: 'text', text: part.text };
                            } else if (part.inlineData) {
                                const mimeType = part.inlineData.mimeType;
                                const base64Data = part.inlineData.data;
                                const fullDataUrl = `data:${mimeType};base64,${base64Data}`;


                                // 判斷是圖片還是文件
                                if (mimeType.startsWith('image/')) {
                                    return { 
                                        type: 'image_url', 
                                        image_url: { url: fullDataUrl } 
                                    };
                                } else {
                                    hasOpenRouterFileAttachment = true;
                                    // ✨ 這裡是新增的：處理 PDF 或其他文件
                                    return {
                                        type: 'file',
                                        file: {
                                            filename: part.inlineData.name || 'document.pdf', // 使用步驟二存入的檔名
                                            file_data: fullDataUrl // OpenRouter 需要完整的 Data URI
                                        }
                                    };
                                }
                            }
                            return null;
                        }).filter(Boolean);
                        
                        messages.push({ role, content });
                    } else {
                        // 純文字訊息
                        const content = m.parts
                            .filter(p => p.text)
                            .map(p => p.text)
                            .join('\n');
                        
                        if (content) {
                            messages.push({ role, content });
                        }
                    }
                });


                const plugins = [];
                if (hasOpenRouterFileAttachment) {
                    plugins.push({
                        id: 'file-parser',
                        pdf: {
                            engine: 'mistral-ocr'
                        }
                    });
                }

                payload = {
                    model: modelId,
                    messages,
                    stream: true,
                    ...(generationConfig.temperature !== null && { temperature: generationConfig.temperature }),
                    ...(generationConfig.topP !== null && { top_p: generationConfig.topP }),
                    ...(generationConfig.maxTokens !== null && { max_tokens: generationConfig.maxTokens }),
                };
                if (plugins.length > 0) {
                    payload.plugins = plugins;
                }
                headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
            }
            let response;
            try {
                response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal });
            } catch (error) {
                if (isStepPlanDirectVideoRequest) {
                    throw new Error(`Step video request bypassed the server proxy to avoid Vercel payload limits, but the browser could not reach StepFun directly: ${error?.message || error}`);
                }
                throw error;
            }
            if (!response.ok) {
                const err = await readErrorBody(response);
                throw new Error(getErrorMessage(err));
            }
            if (provider === 'stepfun' && payload.stream === false) {
                const data = await response.json();
                const messageContent = data?.choices?.[0]?.message?.content;
                const fullText = Array.isArray(messageContent)
                    ? messageContent.map(part => part?.text || '').join('')
                    : String(messageContent || '');
                if (fullText) onChunk(fullText);
                return fullText;
            }
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                if (provider === 'gemini') {
                    while (true) {
                        const firstBrace = buffer.indexOf('{');
                        if (firstBrace === -1) {
                            break;
                        }


                        let braceCount = 0;
                        let endIndex = -1;
                        for (let i = firstBrace; i < buffer.length; i++) {
                            if (buffer[i] === '{') {
                                braceCount++;
                            } else if (buffer[i] === '}') {
                                braceCount--;
                            }
                            if (braceCount === 0) {
                                endIndex = i;
                                break;
                            }
                        }


                        if (endIndex !== -1) {
                            const jsonStr = buffer.substring(firstBrace, endIndex + 1);
                            buffer = buffer.substring(endIndex + 1);


                            try {
                                const parsed = JSON.parse(jsonStr);
                                const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;


                                if (textChunk) {
                                    fullText += textChunk;
                                    onChunk(textChunk);
                                }
                            } catch (e) {
                                console.warn("解析 Gemini 串流中的 JSON 區塊時出錯:", e, "區塊內容:", jsonStr);
                            }
                        } else {
                            break;
                        }
                    }
                } else {
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.substring(6);
                            if (data.trim() === '[DONE]') break;
                            try {
                                const parsed = JSON.parse(data);
                                const textChunk = parsed.choices[0]?.delta?.content || '';
                                if (textChunk) {
                                    fullText += textChunk;
                                    onChunk(textChunk);
                                }
                            } catch (e) { /* Ignore */ }
                        }
                    }
                }
            }
            return fullText;
        }
        const extractTextFromParts = (parts = []) => parts
            .map(part => part.text || (part.inlineData ? `[${part.inlineData.name || part.inlineData.mimeType || 'attachment'}]` : ''))
            .filter(Boolean)
            .join('\n');
        const truncateCouncilText = (text = '', limit = COUNCIL_RESPONSE_CHAR_LIMIT) => {
            const value = String(text || '').trim();
            return value.length > limit ? `${value.slice(0, limit)}\n\n[truncated]` : value;
        };
        const waitCouncilRetryDelay = (signal) => new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
            }
            const cleanup = () => signal?.removeEventListener('abort', onAbort);
            const timer = setTimeout(() => {
                cleanup();
                resolve();
            }, COUNCIL_RETRY_DELAY_MS);
            const onAbort = () => {
                clearTimeout(timer);
                cleanup();
                reject(new DOMException('Aborted', 'AbortError'));
            };
            signal?.addEventListener('abort', onAbort, { once: true });
        });
        const streamCouncilApiCallWithRetry = async (parts, onChunk, signal, isWebSearchForced = false, requestOptions = {}) => {
            const { onRetry, ...streamOptions } = requestOptions;
            try {
                return await streamApiCall(parts, onChunk, signal, isWebSearchForced, streamOptions);
            } catch (firstError) {
                if (firstError?.name === 'AbortError' || signal?.aborted) throw firstError;
                if (typeof onRetry === 'function') onRetry(firstError);
                await waitCouncilRetryDelay(signal);
                try {
                    return await streamApiCall(parts, onChunk, signal, isWebSearchForced, streamOptions);
                } catch (secondError) {
                    if (secondError?.name === 'AbortError' || signal?.aborted) throw secondError;
                    const error = new Error(`${secondError?.message || 'API request failed'} (retried once; first attempt: ${firstError?.message || 'unknown error'})`);
                    error.name = secondError?.name || 'Error';
                    throw error;
                }
            }
        };
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
                throw new Error(config.uiLanguage === 'en' ? 'No search-capable council synthesizer selected.' : '尚未選擇可搜索的理事會統整模型。');
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
        const buildCouncilRequestParts = (parts, sharedSearchPacket = '') => {
            if (!sharedSearchPacket?.trim()) return parts;
            return [
                {
                    text: `# Shared council search packet (system-generated, not user-provided)\nCurrent date: ${getSearchCurrentDate()}\nUse this as common research context. Do not say or imply that the user provided this packet. For time-sensitive facts, dated search evidence overrides stale model pretraining.\n\n${truncateCouncilText(sharedSearchPacket, 5000)}\n\n# User request follows`
                },
                ...parts
            ];
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
                throw new Error(config.uiLanguage === 'en'
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
                    ? (config.uiLanguage === 'en' ? 'image translation packet' : '圖片轉譯包')
                    : (config.uiLanguage === 'en' ? 'document translation packet' : '文件轉譯包');
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
        const filterPartsForModelCapability = (parts = [], model) => parts.filter(part => {
            if (part.text) return true;
            if (!part.inlineData) return false;
            return modelSupportsUploadedFile(model, { inlineData: part.inlineData });
        });
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
        const getUnsupportedSingleDocumentParts = (parts = [], model) => parts.filter(part => {
            if (!part.inlineData) return false;
            const mimeType = part.inlineData.mimeType || '';
            if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return false;
            return !modelSupportsUploadedFile(model, { inlineData: part.inlineData });
        });
        const buildSingleDocumentTranslationPrompt = (parts, targetModel) => `
You are the single-model document translator for Astranos Chat.

Target model that will receive your packet:
- ${targetModel?.name || 'Unknown model'}

Your job:
Translate the attached document/file content into a detailed, faithful text packet for a target model that cannot read those files directly.
Do not answer the user's request. Do not summarize too aggressively. Preserve the information the target model would need to reason over the files.

User request for context:
${extractTextFromParts(parts)}

Output requirements:
- Start with "# Document Translation Packet".
- Identify each file by filename and MIME type when available.
- Preserve headings, section order, paragraphs, tables, lists, numeric values, labels, citations, dates, code blocks, and page/section clues.
- For tables, write the column names and rows clearly in Markdown.
- Separate observed content from any necessary inference.
- Mention unreadable, truncated, missing, low-confidence, or unsupported portions.
- Do not invent details that are not in the files.
- End with a compact "Use notes" section explaining how the target model should use this packet without claiming it is user-written.
`;
        const TAVILY_QUERY_CHAR_LIMIT = 380;
        const getTavilyApiKey = () => getApiKeyForProvider('tavily');
        const getTavilySearchDepth = () => config.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic';
        const getSearchCurrentDate = () => new Date().toISOString().slice(0, 10);
        const isWorldCupQuery = (value = '') => /(\bworld cup\b|\bfifa\b|世界盃|世界杯|美加墨)/i.test(String(value || ''));
        const isSportsResultsQuery = (value = '') => /(\bmatch\b|\bmatches\b|\bscore\b|\bscores\b|\bfixture\b|\bfixtures\b|\bstandings\b|\bgroup stage\b|\bwin\b|\bwins\b|\bwon\b|贏幾場|贏了幾場|幾勝|比分|賽果|戰績|小組賽|足球|賽程|排名)/i.test(String(value || '')) || isWorldCupQuery(value);
        const buildTavilySearchQuery = (value = '') => {
            const text = String(value || '');
            const sportsBoost = isWorldCupQuery(text)
                ? ' FIFA World Cup official match report results scores wins group stage'
                : (isSportsResultsQuery(text) ? ' official results scores wins fixtures standings' : '');
            return normalizeSearchQuery(`${text} current date ${getSearchCurrentDate()} latest${sportsBoost}`);
        };
        const normalizeSearchQuery = (value = '') => String(value || '')
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, TAVILY_QUERY_CHAR_LIMIT)
            .trim();
        const getSearchQueryFromParts = (parts = []) => buildTavilySearchQuery(extractTextFromParts(parts));
        const formatTavilySearchPacket = (data, query, label = 'Web search packet') => {
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
        const fetchTavilySearchPacket = async (querySource, signal, options = {}) => {
            const apiKey = getTavilyApiKey();
            if (!apiKey) {
                throw new Error(config.uiLanguage === 'en'
                    ? 'Tavily API key is required for OpenRouter/NVIDIA/Step Plan search. Add it in Settings.'
                    : 'OpenRouter/NVIDIA 搜索需要 Tavily API 金鑰，請先到設定頁新增。');
            }
            const query = buildTavilySearchQuery(Array.isArray(querySource)
                ? getSearchQueryFromParts(querySource)
                : querySource);
            if (!query) {
                throw new Error(config.uiLanguage === 'en' ? 'No searchable text found.' : '找不到可用的搜索文字。');
            }
            const response = await fetch('/api/tavily-search', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query,
                    search_depth: options.searchDepth || getTavilySearchDepth(),
                    max_results: options.maxResults || 6,
                    include_answer: false,
                    include_raw_content: false,
                    include_images: false,
                    include_usage: true,
                    topic: options.topic || 'general'
                }),
                signal
            });
            if (!response.ok) {
                const errorBody = await readErrorBody(response);
                throw new Error(getErrorMessage(errorBody, `Tavily HTTP ${response.status}`));
            }
            const data = await response.json();
            return formatTavilySearchPacket(data, query, options.label || 'Web search packet');
        };
        const buildTavilyContextPart = (searchPacket, modelName = '') => ({
            text: `# System-generated web search context\n${modelName ? `Target model: ${modelName}\n` : ''}This context was retrieved with Tavily. It is not user-written. Use it as current web evidence and cite source URLs when relevant.\n\n${truncateCouncilText(searchPacket, 7000)}\n\n# User request follows`
        });
        const buildSingleSearchTranslationPrompt = (parts, targetModel) => `
You are the single-model search translator for Astranos Chat.

Target model that will receive your packet:
- ${targetModel?.name || 'Unknown model'}

Your job:
Use web search once, then create a detailed research packet for a target model that cannot search the web directly.
Do not answer the user directly. Prepare evidence and context only.

User request:
${extractTextFromParts(parts)}

Output requirements:
- Start with "# Search Translation Packet".
- Include current facts, dates, named entities, and important source names or URLs when available.
- Separate confirmed facts, uncertainty, disagreements, and freshness risks.
- Include short source notes so the target model can judge reliability.
- Explain what the target model should pay attention to.
- Do not pretend this packet was written by the user.
- Do not include private reasoning or irrelevant browsing chatter.
`;
        const buildSingleModelTranslatedRequestParts = async (parts, modelInfo, signal, onProgress) => {
            const translatedSections = [];
            const documentParts = getUnsupportedSingleDocumentParts(parts, modelInfo);
            if (documentParts.length > 0) {
                const translatorModel = getSingleDocumentTranslatorModel();
                if (!translatorModel) {
                    throw new Error(config.uiLanguage === 'en'
                        ? 'This model needs a document translator model in Settings.'
                        : '此模型需要先在設定中指定文件轉譯模型。');
                }
                onProgress?.('documentTranslation', `文件轉譯：${translatorModel.name}`);
                const documentPacket = await streamCouncilApiCallWithRetry(
                    [
                        { text: buildSingleDocumentTranslationPrompt(parts, modelInfo) },
                        ...documentParts
                    ],
                    () => onProgress?.('documentTranslation', `文件轉譯：${translatorModel.name}`),
                    signal,
                    false,
                    {
                        modelInfo: translatorModel,
                        historyForApi: [],
                        ignoreConversationWebSearch: true,
                        additionalSystemInstruction: 'You only translate attached documents/files into detailed neutral packets. Do not answer the user.',
                    }
                );
                translatedSections.push(`# Document translation packet\nThis packet was generated by ${translatorModel.name} for ${modelInfo.name}. It replaces only files the target model cannot read directly.\n\n${truncateCouncilText(documentPacket, 7000)}`);
            }
            const conv = getActiveConversation();
            if (conv?.isWebSearchEnabled && modelUsesTavilySearch(modelInfo)) {
                onProgress?.('searchTranslation', config.uiLanguage === 'en' ? 'Searching with Tavily' : '正在使用 Tavily 搜索');
                const searchPacket = await fetchTavilySearchPacket(parts, signal, {
                    label: 'Single-model web search packet'
                });
                translatedSections.push(`# Web search packet\nThis packet was retrieved with Tavily for ${modelInfo.name}. It replaces provider-native web search for this turn.\n\n${truncateCouncilText(searchPacket, 7000)}`);
            }

            const requestParts = [];
            if (translatedSections.length > 0) {
                requestParts.push({
                    text: `# System-generated supporting context\nUse the following packets as supporting context. They are not user-written. Continue to answer the user's request directly after reading them.\n\n${translatedSections.join('\n\n')}\n\n# User request follows`
                });
            }
            requestParts.push(...filterPartsForModelCapability(parts, modelInfo));
            return requestParts;
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
                    const chunkUnit = config.uiLanguage === 'en' ? 'chunks' : '段內容';
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
        async function callApiWithSchema(prompt, responseSchema, signal) {
            const apiKey = getApiKeyForProvider('gemini');
            if (!apiKey) {
                console.error("Gemini API key is not set for generating structured response.");
                return null;
            }
            const payload = {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                }
            };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CHEAP_MODEL_ID}:generateContent?key=${apiKey}`;
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal
                });
                if (!response.ok) {
                    const errorData = await readErrorBody(response);
                    throw new Error(errorData.error?.message || 'API request failed');
                }
                const result = await response.json();
                const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (jsonString) {
                    let cleanedJsonString = jsonString.trim();
                    if (cleanedJsonString.startsWith("```json")) {
                        cleanedJsonString = cleanedJsonString.substring(7).trim();
                    }
                    if (cleanedJsonString.endsWith("```")) {
                        cleanedJsonString = cleanedJsonString.slice(0, -3).trim();
                    }
                    try {
                        return JSON.parse(cleanedJsonString);
                    } catch (e) {
                        console.error("清理後的 JSON 解析失敗:", e);
                        console.error("原始字串:", jsonString);
                        throw new Error("無法解析 API 回傳的 JSON 字串。");
                    }
                }
            } catch (error) {
                console.error('Error generating structured response:', error);
            }
            return null;
        }
        async function shouldPerformWebSearch(prompt) {
            const apiKey = getApiKeyForProvider('gemini');
            if (!apiKey) {
                console.warn("Gemini API key is not set. Cannot perform auto web search check.");
                return false;
            }
            const systemPrompt = "你是一個判斷器，根據使用者問題判斷是否需要連網搜尋。如果問題是關於即時、最新資訊、或特定事實，請回答'yes'。如果是常識性、創意寫作、程式碼等，請回答'no'。只輸出'yes'或'no'，不要有任何其他文字。";
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${CHEAP_MODEL_ID}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        { role: 'user', parts: [{ text: systemPrompt }] },
                        { role: 'model', parts: [{ text: "好的，我會只回答'yes'或'no'。" }] },
                        { role: 'user', parts: [{ text: prompt }] }
                    ],
                }),
                signal: AbortSignal.timeout(3000)
            });
            if (!response.ok) {
                console.error('Auto web search check failed:', await response.text());
                return false;
            }
            const result = await response.json();
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();
            return text === 'yes';
        }
        const generateTitleAndSummary = async (conv) => {
            const conversationHistory = conv.messages.slice(0, 5).map(m => `${m.role}: ${m.parts.map(p => p.text).join(' ')}`).join('\n');
            const prompt = `為以下對話生成一個簡潔且能代表核心主題的標題。標題應直接反映使用者詢問的主要內容，而不是以你的視角描述AI的行為，（例如，好的標題是「法國首都」，而不是「回答地理問題」）。標題限制在10個字以內。請嚴格按照以下 JSON 格式輸出，不要有任何額外的文字或解釋:\n{"title": "你的標題", "summary": "你的一句話摘要"}\n\n對話內容:\n${conversationHistory}`;
            const responseSchema = {
                type: "OBJECT",
                properties: {
                    title: { type: "STRING" },
                    summary: { type: "STRING" }
                },
                propertyOrdering: ["title", "summary"]
            };
            const data = await callApiWithSchema(prompt, responseSchema);
            if (data && data.title && data.summary) {
                conv.title = data.title;
                conv.summary = data.summary;
                conv.isNaming = false;
                await saveAppData();
                renderHistorySidebar();
                if (conv.id === activeConversationId) { ALL_ELEMENTS.headerTitle.textContent = conv.title; }
                showNotification(i18n[config.uiLanguage].autoNamed || '對話已自動命名', 'success');
            } else {
                conv.isNaming = false;
                await saveAppData();
                renderHistorySidebar();
                console.error("Auto-naming failed: No valid JSON found in the response.");
            }
        };
        const updateSubmitButtonState = (isGenerating) => {
            const { submitButton, submitButtonIcon } = ALL_ELEMENTS;
            if (isGenerating) {
                submitButton.disabled = false;
                submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
            } else {
                updateInputState();
            }
        };
        const updateInputState = () => {
            const hasContent = ALL_ELEMENTS.messageInput.value.trim() !== '' || uploadedFiles.length > 0;
            const { submitButton, submitButtonIcon } = ALL_ELEMENTS;
            const sendIconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`;
            if (abortController) {
                submitButton.disabled = false;
                submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
                return;
            }
            const conv = getActiveConversation();
            if (!conv) {
                submitButton.disabled = true;
                submitButtonIcon.innerHTML = sendIconHTML;
                return;
            }
            if (conv.archived) {
                ALL_ELEMENTS.messageInput.disabled = true;
                submitButton.disabled = true;
                ALL_ELEMENTS.messageInput.placeholder = i18n[config.uiLanguage].viewingArchived || '正在檢視封存的對話，無法傳送訊息。';
                return;
            }
            const modelInfo = normalizeConversationModel(conv);
            const provider = modelInfo?.provider;
            const councilValidation = getCouncilValidation(conv);
            const hasTavilyKey = !conversationNeedsTavilySearch(conv) || !!getApiKeyForProvider('tavily');
            const hasApiKey = isCouncilEnabled(conv)
                ? councilValidation.reason !== 'missingApiKey'
                : (!!getApiKeyForProvider(provider) && hasTavilyKey);
            ALL_ELEMENTS.messageInput.disabled = !hasApiKey;
            ALL_ELEMENTS.messageInput.placeholder = hasApiKey
                ? (isCouncilEnabled(conv) && !councilValidation.ok ? councilValidation.message : i18n[config.uiLanguage].enterMessagePlaceholder)
                : i18n[config.uiLanguage].enterApiKeyPlaceholder;
            if (!hasApiKey || !hasContent || (isCouncilEnabled(conv) && !councilValidation.ok)) {
                submitButton.disabled = true;
                submitButtonIcon.innerHTML = sendIconHTML;
            } else {
                submitButton.disabled = false;
submitButtonIcon.innerHTML = sendIconHTML;
            }
        };
        const ensureCouncilTranslatorSettingsControls = () => {
            if (!document.getElementById('nvidia-api-key-input')) {
                const openrouterInput = document.getElementById('openrouter-api-key-input-all');
                const openrouterBlock = openrouterInput?.closest('div');
                if (openrouterBlock) {
                    openrouterBlock.insertAdjacentHTML('afterend', `
                        <div>
                            <label for="step-plan-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="stepPlanApiKey">Step Plan API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="stepPlanApiDesc">Enable StepFun Step Plan reasoning models.</p>
                            <input type="password" id="step-plan-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="sk-..." data-lang-key-placeholder="stepPlanApiPlaceholder">
                        </div>
                        <div>
                            <label for="nvidia-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="nvidiaApiKey">NVIDIA API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="nvidiaApiDesc">Enable NVIDIA free models.</p>
                            <input type="password" id="nvidia-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="nvapi-..." data-lang-key-placeholder="nvidiaApiPlaceholder">
                        </div>
                        <div>
                            <label for="tavily-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="tavilyApiKey">Tavily API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilyApiDesc">Used for OpenRouter and NVIDIA web search.</p>
                            <input type="password" id="tavily-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="tvly-..." data-lang-key-placeholder="tavilyApiPlaceholder">
                        </div>
                        <div>
                            <label for="tavily-search-depth-select" class="block text-sm font-medium mb-1" data-lang-key="tavilySearchDepth">Tavily search depth</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilySearchDepthDesc">Choose basic for lower cost, or advanced for deeper searches.</p>
                            <select id="tavily-search-depth-select" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]">
                                <option value="basic" data-lang-key="tavilySearchBasic">Basic</option>
                                <option value="advanced" data-lang-key="tavilySearchAdvanced">Advanced</option>
                            </select>
                        </div>
                        <div>
                            <label for="council-translator-model-select" class="block text-sm font-medium mb-1" data-lang-key="councilTranslatorModel">Council document translation</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="councilTranslatorModelDesc">Only translates attachments or documents that council members cannot read directly.</p>
                            <input type="hidden" id="council-translator-model-select">
                            <div class="translator-model-picker" data-translator-picker="councilTranslatorModelId"></div>
                        </div>
                        <div>
                            <label for="single-document-translator-model-select" class="block text-sm font-medium mb-1" data-lang-key="singleDocumentTranslatorModel">單模型文件轉譯模型</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="singleDocumentTranslatorModelDesc">提供給不支援文件上傳的單一模型，只在該次請求轉成詳細文字包。</p>
                            <input type="hidden" id="single-document-translator-model-select">
                            <div class="translator-model-picker" data-translator-picker="singleDocumentTranslatorModelId"></div>
                        </div>
                        
                    `);
                }
            }
            if (!document.getElementById('tavily-api-key-input')) {
                const nvidiaInput = document.getElementById('nvidia-api-key-input');
                const nvidiaBlock = nvidiaInput?.closest('div');
                if (nvidiaBlock) {
                    nvidiaBlock.insertAdjacentHTML('afterend', `
                        <div>
                            <label for="tavily-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="tavilyApiKey">Tavily API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilyApiDesc">Used for OpenRouter and NVIDIA web search.</p>
                            <input type="password" id="tavily-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="tvly-..." data-lang-key-placeholder="tavilyApiPlaceholder">
                        </div>
                    `);
                }
            }
            if (!document.getElementById('tavily-search-depth-select')) {
                const tavilyInput = document.getElementById('tavily-api-key-input');
                const tavilyBlock = tavilyInput?.closest('div');
                if (tavilyBlock) {
                    tavilyBlock.insertAdjacentHTML('afterend', `
                        <div>
                            <label for="tavily-search-depth-select" class="block text-sm font-medium mb-1" data-lang-key="tavilySearchDepth">Tavily search depth</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="tavilySearchDepthDesc">Choose basic for lower cost, or advanced for deeper searches.</p>
                            <select id="tavily-search-depth-select" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]">
                                <option value="basic" data-lang-key="tavilySearchBasic">Basic</option>
                                <option value="advanced" data-lang-key="tavilySearchAdvanced">Advanced</option>
                            </select>
                        </div>
                    `);
                }
            }
            if (!document.getElementById('step-plan-api-key-input')) {
                const openrouterInput = document.getElementById('openrouter-api-key-input-all');
                const openrouterBlock = openrouterInput?.closest('div');
                if (openrouterBlock) {
                    openrouterBlock.insertAdjacentHTML('afterend', `
                        <div>
                            <label for="step-plan-api-key-input" class="block text-sm font-medium mb-1" data-lang-key="stepPlanApiKey">Step Plan API Key</label>
                            <p class="text-xs text-[var(--text-secondary)] mb-2" data-lang-key="stepPlanApiDesc">Enable StepFun Step Plan reasoning models.</p>
                            <input type="password" id="step-plan-api-key-input" class="w-full p-2 border border-[var(--border-color)] rounded-md bg-[var(--input-field-bg)]" placeholder="sk-..." data-lang-key-placeholder="stepPlanApiPlaceholder">
                        </div>
                    `);
                }
            }
            ALL_ELEMENTS.nvidiaApiKeyInput = document.getElementById('nvidia-api-key-input');
            ALL_ELEMENTS.stepPlanApiKeyInput = document.getElementById('step-plan-api-key-input');
            ALL_ELEMENTS.tavilyApiKeyInput = document.getElementById('tavily-api-key-input');
            ALL_ELEMENTS.tavilySearchDepthSelect = document.getElementById('tavily-search-depth-select');
            ALL_ELEMENTS.councilTranslatorModelSelect = document.getElementById('council-translator-model-select');
            ALL_ELEMENTS.singleDocumentTranslatorModelSelect = document.getElementById('single-document-translator-model-select');
        };
        const renderTranslatorModelPicker = ({ input, pickerKey, configKey, candidates, emptyText }) => {
            const picker = document.querySelector(`[data-translator-picker="${pickerKey}"]`);
            if (!input || !picker) return;
            const translations = i18n[config.uiLanguage] || i18n['zh-TW'];
            if (candidates.length === 0) {
                input.value = '';
                input.disabled = true;
                config[configKey] = null;
                picker.innerHTML = `
                    <button type="button" class="translator-picker-button" disabled>
                        <span>${escapeHTML(emptyText)}</span>
                    </button>
                `;
                return;
            }
            input.disabled = false;
            if (!candidates.some(model => model.id === config[configKey])) {
                config[configKey] = candidates[0].id;
            }
            input.value = config[configKey] || '';
            const selectedModel = candidates.find(model => model.id === config[configKey]) || candidates[0];
            const featureLabels = (model) => [
                modelSupportsVision(model) ? (translations.vision || '視覺') : '',
                modelSupportsDocumentUpload(model) ? (translations.document || '文件') : ''
            ].filter(Boolean);
            const optionHTML = candidates.map(model => {
                const selected = model.id === selectedModel.id;
                return `
                    <button type="button" class="translator-picker-option ${selected ? 'selected' : ''}" data-translator-option="${escapeHTML(model.id)}">
                        <span class="translator-picker-option-main">
                            <strong>${escapeHTML(model.name)}</strong>
                            <small>${escapeHTML(getProviderLabel(model.provider))} · ${escapeHTML(getModelPriceLabel(model))}</small>
                        </span>
                        <span class="translator-picker-option-chips">
                            ${featureLabels(model).map(label => `<span>${escapeHTML(label)}</span>`).join('')}
                        </span>
                    </button>
                `;
            }).join('');
            picker.innerHTML = `
                <button type="button" class="translator-picker-button" data-translator-picker-button="${pickerKey}" aria-expanded="false">
                    <span class="translator-picker-current">
                        <strong>${escapeHTML(selectedModel.name)}</strong>
                        <small>${escapeHTML(getProviderLabel(selectedModel.provider))} · ${escapeHTML(getModelPriceLabel(selectedModel))}</small>
                    </span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <div class="translator-picker-menu" data-translator-picker-menu="${pickerKey}" hidden>
                    ${optionHTML}
                </div>
            `;
            picker.querySelector('[data-translator-picker-button]')?.addEventListener('click', (event) => {
                event.stopPropagation();
                const menu = picker.querySelector('[data-translator-picker-menu]');
                const isOpen = !menu.hasAttribute('hidden');
                document.querySelectorAll('.translator-picker-menu').forEach(item => item.setAttribute('hidden', ''));
                document.querySelectorAll('[data-translator-picker-button]').forEach(button => button.setAttribute('aria-expanded', 'false'));
                if (!isOpen) {
                    menu.removeAttribute('hidden');
                    picker.querySelector('[data-translator-picker-button]')?.setAttribute('aria-expanded', 'true');
                }
            });
            picker.querySelectorAll('[data-translator-option]').forEach(option => {
                option.addEventListener('click', () => {
                    config[configKey] = option.dataset.translatorOption;
                    input.value = config[configKey];
                    renderTranslatorModelPickers();
                });
            });
        };
        const renderTranslatorModelPickers = () => {
            const translations = i18n[config.uiLanguage] || i18n['zh-TW'];
            renderTranslatorModelPicker({
                input: ALL_ELEMENTS.councilTranslatorModelSelect,
                pickerKey: 'councilTranslatorModelId',
                configKey: 'councilTranslatorModelId',
                candidates: getCouncilTranslatorCandidates(),
                emptyText: translations.noCouncilTranslatorModels || '沒有可用的理事會轉譯模型'
            });
            renderTranslatorModelPicker({
                input: ALL_ELEMENTS.singleDocumentTranslatorModelSelect,
                pickerKey: 'singleDocumentTranslatorModelId',
                configKey: 'singleDocumentTranslatorModelId',
                candidates: getSingleTranslatorCandidates(),
                emptyText: translations.noSingleTranslatorModels || '沒有可用的單模型轉譯模型'
            });

            if (!document.__translatorPickerOutsideHandlerBound) {
                document.__translatorPickerOutsideHandlerBound = true;
                document.addEventListener('click', (event) => {
                    if (event.target.closest('.translator-model-picker')) return;
                    document.querySelectorAll('.translator-picker-menu').forEach(item => item.setAttribute('hidden', ''));
                    document.querySelectorAll('[data-translator-picker-button]').forEach(button => button.setAttribute('aria-expanded', 'false'));
                });
            }
        };
        const getOutputModeSettingsText = () => {
            if (config.uiLanguage === 'en') {
                return {
                    title: 'Output mode',
                    desc: 'Applies to single-model and Model Council replies.',
                    typewriter: 'Typewriter after completion',
                    realtime: 'Realtime API stream'
                };
            }
            if (config.uiLanguage === 'fr') {
                return {
                    title: 'Mode de sortie',
                    desc: 'S’applique aux réponses mono-modèle et au conseil de modèles.',
                    typewriter: 'Machine à écrire après la réponse complète',
                    realtime: 'Flux API en temps réel'
                };
            }
            return {
                title: '輸出模式',
                desc: '適用於單獨模型與模型理事會回覆。',
                typewriter: '完整輸出後打字機',
                realtime: '即時同步輸出'
            };
        };
        const ensureOutputModeSettingsControls = () => {
            const section = document.getElementById('accessibility-section');
            if (!section) return;
            let row = document.getElementById('output-mode-setting-row');
            if (!row) {
                row = document.createElement('div');
                row.id = 'output-mode-setting-row';
                row.className = 'mt-4';
                const anchor = section.querySelector('#auto-web-search-toggle-switch')?.closest('.flex.items-center.justify-between');
                if (anchor) {
                    anchor.after(row);
                } else {
                    section.appendChild(row);
                }
            }
            if (!row.querySelector('.custom-output-mode-select')) {
                row.innerHTML = `
                    <div id="output-mode-label" class="block text-sm font-medium mb-1"></div>
                    <p class="text-xs text-[var(--text-secondary)] mb-2"></p>
                    <input type="hidden" id="output-mode-select" value="${escapeHTML(getOutputMode())}">
                    <div class="custom-output-mode-select" role="radiogroup" aria-labelledby="output-mode-label">
                        <button type="button" class="custom-output-mode-option" data-output-mode-option="typewriter" role="radio" aria-checked="false"></button>
                        <button type="button" class="custom-output-mode-option" data-output-mode-option="realtime" role="radio" aria-checked="false"></button>
                    </div>
                `;
            }
            const text = getOutputModeSettingsText();
            row.querySelector('#output-mode-label').textContent = text.title;
            row.querySelector('p').textContent = text.desc;
            ALL_ELEMENTS.outputModeSelect = row.querySelector('#output-mode-select');
            const syncOutputModeButtons = () => {
                const value = ALL_ELEMENTS.outputModeSelect?.value === 'realtime' ? 'realtime' : 'typewriter';
                row.querySelectorAll('[data-output-mode-option]').forEach(button => {
                    const isActive = button.dataset.outputModeOption === value;
                    button.classList.toggle('active', isActive);
                    button.setAttribute('aria-checked', String(isActive));
                });
            };
            row.querySelector('[data-output-mode-option="typewriter"]').textContent = text.typewriter;
            row.querySelector('[data-output-mode-option="realtime"]').textContent = text.realtime;
            row.querySelectorAll('[data-output-mode-option]').forEach(button => {
                if (button.dataset.outputModeBound === 'true') return;
                button.dataset.outputModeBound = 'true';
                button.addEventListener('click', () => {
                    ALL_ELEMENTS.outputModeSelect.value = button.dataset.outputModeOption === 'realtime' ? 'realtime' : 'typewriter';
                    syncOutputModeButtons();
                });
            });
            syncOutputModeButtons();
        };
        const setupSettingsModal = () => {
            ensureCouncilTranslatorSettingsControls();
            ensureOutputModeSettingsControls();
            ALL_ELEMENTS.geminiApiKeyInput.value = getApiKeyForProvider('gemini');
            ALL_ELEMENTS.openrouterApiKeyInputAll.value = getApiKeyForProvider('openrouter');
            if (ALL_ELEMENTS.stepPlanApiKeyInput) ALL_ELEMENTS.stepPlanApiKeyInput.value = getApiKeyForProvider('stepfun');
            if (ALL_ELEMENTS.nvidiaApiKeyInput) ALL_ELEMENTS.nvidiaApiKeyInput.value = getApiKeyForProvider('nvidia');
            if (ALL_ELEMENTS.tavilyApiKeyInput) ALL_ELEMENTS.tavilyApiKeyInput.value = getApiKeyForProvider('tavily');
            if (ALL_ELEMENTS.tavilySearchDepthSelect) ALL_ELEMENTS.tavilySearchDepthSelect.value = getTavilySearchDepth();
            renderTranslatorModelPickers();
            applyLanguage(config.uiLanguage);
            ALL_ELEMENTS.autoNamingToggleSwitch.checked = config.autoNaming;
            ALL_ELEMENTS.autoWebSearchToggleSwitch.checked = config.enableAutoWebSearch;
            if (ALL_ELEMENTS.outputModeSelect) {
                ALL_ELEMENTS.outputModeSelect.value = getOutputMode();
                document.querySelectorAll('#output-mode-setting-row [data-output-mode-option]').forEach(button => {
                    const isActive = button.dataset.outputModeOption === ALL_ELEMENTS.outputModeSelect.value;
                    button.classList.toggle('active', isActive);
                    button.setAttribute('aria-checked', String(isActive));
                });
            }
            ALL_ELEMENTS.memoryToggle1.checked = config.memoryEnabled1;
            ALL_ELEMENTS.autoMemoryToggleSwitch.checked = config.enableAutoMemory;
            ALL_ELEMENTS.uiLanguageSelect.value = config.uiLanguage;
            ALL_ELEMENTS.aiLanguageSelect.value = config.aiDefaultLanguage;
            ALL_ELEMENTS.enableUpdateNotificationsToggle.checked = config.enableUpdateNotifications;
            renderPersonalMemoryList();
            updateThemeButtons();
            renderModelManagementUI();
            const aiBubbleColorTitle = document.querySelector('h3[data-lang-key="aiBubbleColor"]');
            const aiBubbleColorDropdown = ALL_ELEMENTS.aiBubbleColorDropdown;
            if (config.customWallpaper) {
                // 只有在自訂桌布模式下才顯示 AI 泡泡顏色選項
                aiBubbleColorTitle.style.display = 'block';
                aiBubbleColorDropdown.style.display = 'block';
                renderAiBubbleColorDropdown();
            } else {
                // 否則隱藏
                aiBubbleColorTitle.style.display = 'none';
                aiBubbleColorDropdown.style.display = 'none';
            }


            // 使用者泡泡顏色設定總是顯示並渲染
            renderUserBubbleColorDropdown();
            renderUiColorOptions();
            renderTrash();
            const navItems = ALL_ELEMENTS.settingsNav.querySelectorAll('.settings-nav-item');
            navItems.forEach(item => {
                item.addEventListener('click', () => {
                    navItems.forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    const sectionId = item.dataset.section + '-section';
                    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                    document.getElementById(sectionId).classList.add('active');
                });
            });
        };
        const saveSettings = async () => {
            config.apiKeys.gemini = ALL_ELEMENTS.geminiApiKeyInput.value.trim();
            config.apiKeys.openrouter = ALL_ELEMENTS.openrouterApiKeyInputAll.value.trim();
            config.apiKeys.stepPlan = ALL_ELEMENTS.stepPlanApiKeyInput?.value.trim() || '';
            config.apiKeys.nvidia = ALL_ELEMENTS.nvidiaApiKeyInput?.value.trim() || '';
            config.apiKeys.tavily = ALL_ELEMENTS.tavilyApiKeyInput?.value.trim() || '';
            config.tavilySearchDepth = ALL_ELEMENTS.tavilySearchDepthSelect?.value === 'advanced' ? 'advanced' : 'basic';
            config.councilTranslatorModelId = ALL_ELEMENTS.councilTranslatorModelSelect?.value || null;
            config.singleDocumentTranslatorModelId = ALL_ELEMENTS.singleDocumentTranslatorModelSelect?.value || null;
            config.enableAutoWebSearch = ALL_ELEMENTS.autoWebSearchToggleSwitch.checked;
            config.outputMode = ALL_ELEMENTS.outputModeSelect?.value === 'realtime' ? 'realtime' : 'typewriter';
            config.aiBubbleColor = ALL_ELEMENTS.aiBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default';
            config.userBubbleColor = ALL_ELEMENTS.userBubbleColorDropdown.querySelector('.color-dropdown-btn')?.dataset.color || 'default';
            config.autoNaming = ALL_ELEMENTS.autoNamingToggleSwitch.checked;
            config.memoryEnabled1 = ALL_ELEMENTS.memoryToggle1.checked;
            config.enableAutoMemory = ALL_ELEMENTS.autoMemoryToggleSwitch.checked;
            config.uiLanguage = ALL_ELEMENTS.uiLanguageSelect.value;
            config.aiDefaultLanguage = ALL_ELEMENTS.aiLanguageSelect.value;
            config.enableUpdateNotifications = ALL_ELEMENTS.enableUpdateNotificationsToggle.checked;
            const selectedThemeMode = document.querySelector('input[name="color-theme"]:checked').value;
            const selectedCustomColor = ALL_ELEMENTS.customColorSwatches.querySelector('.selected')?.dataset.color || config.uiTheme.customColor;
            const selectedStyle = document.querySelector('input[name="color-style"]:checked')?.value || 'single';
            const selectedGradientSwatch = ALL_ELEMENTS.gradientSwatches.querySelector('.selected-gradient');
            const selectedGradient = selectedGradientSwatch ? selectedGradientSwatch.dataset.gradient : (config.uiTheme.adaptivePalette?.length > 1 ? `linear-gradient(to right, ${config.uiTheme.adaptivePalette[0]}, ${config.uiTheme.adaptivePalette[1]})` : '');
            config.uiTheme.mode = selectedThemeMode;
            config.uiTheme.customColor = selectedCustomColor;
            config.uiTheme.style = selectedStyle;
            config.uiTheme.adaptiveGradient = selectedGradient;
            setAiBubbleColor();
            setUserBubbleColor();
            applyUiTheme();
            await saveConfig();
            applyLanguage(config.uiLanguage);
            renderModelSwitcher();
            renderChat();
            renderStore();
            toggleModal(ALL_ELEMENTS.settingsModal, false);
            updateApiKeyWarningBadge();
            updateInputState();
            showNotification(i18n[config.uiLanguage].settingsSaved || '設定已儲存！');
        };
        const setAiBubbleColor = () => {
            const root = document.documentElement;
            const isWallpaperActive = document.body.classList.contains('custom-wallpaper-active');
            const mode = config.theme;
            const colors = AI_BUBBLE_COLORS[config.aiBubbleColor] || AI_BUBBLE_COLORS.default;
            const hexColor = colors[mode];
            if (isWallpaperActive) {
                const rgbaColor = hexToRgba(hexColor, 0.75);
                root.style.setProperty('--ai-bubble-bg', rgbaColor);
            } else {
                root.style.setProperty('--ai-bubble-bg', 'transparent');
            }
        };
        const setUserBubbleColor = () => {
            const root = document.documentElement;
            const isWallpaperActive = document.body.classList.contains('custom-wallpaper-active');
            const mode = config.theme;
            const colors = USER_BUBBLE_COLORS[config.userBubbleColor] || USER_BUBBLE_COLORS.default;
            const hexColor = colors[mode];
            if (isWallpaperActive) {
                const rgbaColor = hexToRgba(hexColor, 0.7);
                root.style.setProperty('--user-bubble-bg', rgbaColor);
            } else {
                // 這是關鍵修正：在非桌布模式下，直接使用您選擇的實心顏色
                root.style.setProperty('--user-bubble-bg', hexColor);
            }
        };
        const renderAiBubbleColorDropdown = () => {
            const container = ALL_ELEMENTS.aiBubbleColorDropdown;
            container.innerHTML = '';
            const currentColor = config.aiBubbleColor;
            const currentName = currentColor.charAt(0).toUpperCase() + currentColor.slice(1);
            const currentHex = AI_BUBBLE_COLORS[currentColor][config.theme];
            const btn = document.createElement('button');
            btn.className = 'color-dropdown-btn';
            btn.dataset.color = currentColor;
            btn.innerHTML = `
                <div class="color-preview" style="background-color: ${currentHex};"></div>
                <span>${currentName}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            `;
            const menu = document.createElement('div');
            menu.className = 'color-dropdown-menu';
            Object.keys(AI_BUBBLE_COLORS).forEach(color => {
                const option = document.createElement('div');
                option.className = 'color-option';
                option.dataset.color = color;
                const preview = document.createElement('div');
                preview.className = 'color-preview';
                preview.style.backgroundColor = AI_BUBBLE_COLORS[color][config.theme];
                const name = color.charAt(0).toUpperCase() + color.slice(1);
                option.appendChild(preview);
                option.appendChild(document.createTextNode(name));
                option.addEventListener('click', () => {
                    config.aiBubbleColor = color;
                    renderAiBubbleColorDropdown();
                    setAiBubbleColor();
                    menu.classList.remove('show');
                });
                menu.appendChild(option);
            });
            btn.addEventListener('click', () => {
                menu.classList.toggle('show');
                const rect = btn.getBoundingClientRect();
                const menuRect = menu.getBoundingClientRect();
                if (rect.bottom + menuRect.height > window.innerHeight) {
                    menu.style.top = 'auto';
                    menu.style.bottom = '100%';
                } else {
                    menu.style.top = '100%';
                    menu.style.bottom = 'auto';
                }
            });
            container.appendChild(btn);
            container.appendChild(menu);
        };
        const renderUserBubbleColorDropdown = () => {
            const container = ALL_ELEMENTS.userBubbleColorDropdown;
            container.innerHTML = '';
            const currentColor = config.userBubbleColor;
            const currentName = currentColor.charAt(0).toUpperCase() + currentColor.slice(1);
            const currentHex = USER_BUBBLE_COLORS[currentColor][config.theme];
            const btn = document.createElement('button');
            btn.className = 'color-dropdown-btn';
            btn.dataset.color = currentColor;
            btn.innerHTML = `
                <div class="color-preview" style="background-color: ${currentHex};"></div>
                <span>${currentName}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            `;
            const menu = document.createElement('div');
            menu.className = 'color-dropdown-menu';
            Object.keys(USER_BUBBLE_COLORS).forEach(color => {
                const option = document.createElement('div');
                option.className = 'color-option';
                option.dataset.color = color;
                const preview = document.createElement('div');
                preview.className = 'color-preview';
                preview.style.backgroundColor = USER_BUBBLE_COLORS[color][config.theme];
                const name = color.charAt(0).toUpperCase() + color.slice(1);
                option.appendChild(preview);
                option.appendChild(document.createTextNode(name));
                option.addEventListener('click', () => {
                    config.userBubbleColor = color;
                    renderUserBubbleColorDropdown();
                    setUserBubbleColor();
                    menu.classList.remove('show');
                });
                menu.appendChild(option);
            });
            btn.addEventListener('click', () => {
                menu.classList.toggle('show');
                const rect = btn.getBoundingClientRect();
                const menuRect = menu.getBoundingClientRect();
                if (rect.bottom + menuRect.height > window.innerHeight) {
                    menu.style.top = 'auto';
                    menu.style.bottom = '100%';
                } else {
                    menu.style.top = '100%';
                    menu.style.bottom = 'auto';
                }
            });
            container.appendChild(btn);
            container.appendChild(menu);
        };
        const createHistoryMenu = (convId, targetButton) => {
            const existingPopover = document.getElementById('history-popover');
            if (existingPopover) {
                existingPopover.remove();
                if (existingPopover.dataset.targetId === targetButton.id) return;
            }
            const rect = targetButton.getBoundingClientRect();
            const popover = document.createElement('div');
            popover.id = 'history-popover';
            popover.className = 'popover absolute w-48 rounded-lg border border-[var(--border-color)] z-50';
            popover.dataset.targetId = targetButton.id;
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 250) {
                popover.style.bottom = `${window.innerHeight - rect.top}px`;
                popover.style.transformOrigin = 'bottom';
            } else {
                popover.style.top = `${rect.bottom}px`;
                popover.style.transformOrigin = 'top';
            }
            popover.style.left = `${rect.left}px`;
            const conv = conversations.find(c => c.id === convId);
            const pinText = conv.pinned ? (i18n[config.uiLanguage].unpin || '取消釘選') : (i18n[config.uiLanguage].pin || '釘選');
            const moveOptionsHTML = conv.folderId
                ? `<button data-id="${convId}" class="move-out-of-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].moveOutOfFolder || '移出資料夾'}</button>`
                : `
                    <div class="relative group">
                        <button class="w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm flex justify-between items-center">
                            <span>${i18n[config.uiLanguage].moveToFolder || '移至資料夾'}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                        <div class="absolute left-full top-0 w-48 rounded-lg border border-[var(--border-color)] bg-[var(--modal-bg)] hidden group-hover:block">
                            ${folders.map(f => `<button data-folder-id="${f.id}" class="move-to-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${f.name}</button>`).join('')}
                                <div class="border-t my-1 border-[var(--border-color)]"></div>
                                <button class="new-folder-from-menu-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].createNewFolder || '建立新資料夾'}</button>
                            </div>
                        </div>
                    `;
            popover.innerHTML = `
                <button data-id="${convId}" class="rename-conv-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].rename || '重新命名'}</button>
                <button data-id="${convId}" class="pin-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${pinText}</button>
                ${moveOptionsHTML}
                <button data-id="${convId}" class="archive-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].archive || '封存'}</button>
                <div class="border-t my-1 border-[var(--border-color)]"></div>
                <button data-id="${convId}" class="delete-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${i18n[config.uiLanguage].delete || '刪除'}</button>
            `;
            document.body.appendChild(popover);
            requestAnimationFrame(() => popover.classList.add('visible'));
            popover.querySelector('.rename-conv-btn').addEventListener('click', (e) => { showRenameModal(convId, 'conversation', e); popover.remove(); });
            popover.querySelector('.pin-btn').addEventListener('click', (e) => { togglePinChat(convId, e); popover.remove(); });
            popover.querySelector('.archive-btn').addEventListener('click', (e) => { archiveChat(convId, e); popover.remove(); });
            popover.querySelector('.delete-btn').addEventListener('click', (e) => { deleteChat(convId, e); popover.remove(); });
            popover.querySelectorAll('.move-to-folder-btn').forEach(btn => btn.addEventListener('click', () => { moveConversationToFolder(convId, btn.dataset.folderId); popover.remove(); }));
            const newFolderBtn = popover.querySelector('.new-folder-from-menu-btn');
            if (newFolderBtn) {
                newFolderBtn.addEventListener('click', async () => {
                    popover.remove();
                    const folderName = await showCustomPrompt(i18n[config.uiLanguage].enterFolderName || '請輸入新資料夾的名稱：', i18n[config.uiLanguage].createNewFolder || '建立新資料夾');
                    if (folderName) {
                        const newFolderId = createNewFolder(folderName);
                        moveConversationToFolder(convId, newFolderId);
                    }
                });
            }
            const moveOutBtn = popover.querySelector('.move-out-of-folder-btn');
            if (moveOutBtn) {
                moveOutBtn.addEventListener('click', () => { moveConversationToFolder(convId, null); popover.remove(); });
            }
        };
        const setTheme = async (theme) => {
            if (document.body.classList.contains('custom-wallpaper-active')) {
                return;
            }
            document.documentElement.classList.toggle('dark', theme === 'dark');
            config.theme = theme;
            setAiBubbleColor();
            setUserBubbleColor();
            await saveConfig();
            updateThemeButtons();
            if (!ALL_ELEMENTS.settingsModal.classList.contains('hidden')) {
                renderAiBubbleColorDropdown();
                renderUserBubbleColorDropdown();
            }
        };
        const updateThemeButtons = () => {
            ALL_ELEMENTS.themeDarkBtn.classList.remove('active');
            ALL_ELEMENTS.themeLightBtn.classList.remove('active');
            if (config.theme === 'dark') {
                ALL_ELEMENTS.themeDarkBtn.classList.add('active');
            } else {
                ALL_ELEMENTS.themeLightBtn.classList.add('active');
            }
        };
        const handleLogin = async (e) => {
    e.preventDefault();
    const username = ALL_ELEMENTS.usernameInput.value.trim();
    const password = ALL_ELEMENTS.passwordInput.value;
    if (!username || !password) {
        showNotification(i18n[config.uiLanguage].usernamePasswordRequired || '使用者名稱和密碼皆為必填項目。', 'error');
        return;
    }
    const userKey = getUserKey(username);
    const savedUser = await getItem(userKey);
    if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        if (!(await verifyPasswordRecord(password, parsedUser))) {
            showNotification(i18n[config.uiLanguage].passwordIncorrect || '密碼錯誤。', 'error');
            return;
        }
        currentUser = await upgradeLegacyPasswordRecord(password, userKey, parsedUser);
    } else {
        currentUser = await createPasswordRecord(username, password);
        await setItem(userKey, JSON.stringify(currentUser));
    }
    await setItem('chat_lastUser', username);


    // --- ✨ 這是唯一的修改處 START ---
    // 在執行淡出前，先移除我們為了顯示登入畫面而加入的 'visible' class
    ALL_ELEMENTS.authContainer.classList.remove('visible'); 
    // --- ✨ 這是唯一的修改處 END ---


    ALL_ELEMENTS.authContainer.classList.add('fade-out');
    ALL_ELEMENTS.appContainer.classList.remove('hidden');
    requestAnimationFrame(() => {
        ALL_ELEMENTS.appContainer.classList.add('visible');
    });
    ALL_ELEMENTS.authContainer.addEventListener('transitionend', () => {
        ALL_ELEMENTS.authContainer.style.display = 'none';
    }, { once: true });
    initChatApp();
};
        const handleLogout = async () => {
            if (await showCustomConfirm(i18n[config.uiLanguage].confirmLogout || '您確定要登出嗎？', i18n[config.uiLanguage].logoutConfirmation || '登出確認')) {
                await removeItem('chat_lastUser');
                window.location.reload();
            }
        };
        const handleDeleteAllData = async () => {
            const confirmation = await showCustomDialog({
                title: i18n[config.uiLanguage].deleteAllDataTitle || '永久刪除所有資料',
                message: i18n[config.uiLanguage].deleteAllDataMessage || '此操作將會刪除您所有的對話紀錄、設定、Astras 及 API 金鑰。此動作無法復原。請輸入「DELETE」以確認刪除。',
                input: { type: 'text', placeholder: 'DELETE' },
                dialogClass: 'dialog-warning-border',
                buttons: [
                    { text: i18n[config.uiLanguage].cancel || '取消', class: 'bg-[var(--hover-bg)] px-4 py-2 rounded-md hover:bg-[var(--active-bg)]', value: () => null },
                    { text: i18n[config.uiLanguage].confirmDelete || '確認刪除', class: 'bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700', value: (val) => val }
                ]
            });
            if (confirmation === 'DELETE') {
                try {
                    const idb = await openDB();
                    const tx = idb.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    await new Promise((resolve, reject) => {
                        const req = store.clear();
                        req.onsuccess = resolve;
                        req.onerror = reject;
                    });
                    showNotification(i18n[config.uiLanguage].deleteAllDataSuccess || '所有資料已成功刪除。頁面即將重新整理。', 'success');
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                } catch (error) {
                    console.error('刪除資料時發生錯誤:', error);
                    showNotification(i18n[config.uiLanguage].deleteAllDataError || '刪除資料失敗。', 'error');
                }
            } else if (confirmation !== null) {
                showNotification(i18n[config.uiLanguage].incorrectInput || '輸入錯誤，操作已取消。', 'warning');
            }
        };
        const createNewFolder = (name) => {
            const newFolder = { id: crypto.randomUUID(), name,conversationIds: [], ...getDefaultFolder() };
            folders.push(newFolder);
            void saveAppData().catch(error => console.error('Failed to save folder state:', error));
            renderFolders();
            return newFolder.id;
        };
        const moveConversationToFolder = async (convId, folderId) => {
            const conv = conversations.find(c => c.id === convId);
            if (!conv) return;
            if (conv.folderId) {
                const oldFolder = folders.find(f => f.id === conv.folderId);
                if (oldFolder) {
                    oldFolder.conversationIds = oldFolder.conversationIds.filter(id => id !== convId);
                }
            }
            conv.folderId = folderId;
            if (folderId) {
                const newFolder = folders.find(f => f.id === folderId);
                if (newFolder && !newFolder.conversationIds.includes(convId)) {
                    newFolder.conversationIds.push(convId);
                }
            }
            await saveAppData();
            renderAll();
        };
        const deleteFolder = async (id, event) => {
            event?.stopPropagation();
            const folder = folders.find(f => f.id === id);
            if (!folder) return;
            const confirmMsg = folder.conversationIds.length > 0
                ? i18n[config.uiLanguage].confirmDeleteFolderWithChats
                : i18n[config.uiLanguage].confirmDeleteEmptyFolder;
            if (!(await showCustomConfirm(confirmMsg, i18n[config.uiLanguage].deleteFolderTitle))) return;
            conversations.forEach(c => {
                if (c.folderId === id) {
                    c.folderId = null;
                }
            });
            folders = folders.filter(f => f.id !== id);
            await saveAppData();
            renderAll();
            showNotification(i18n[config.uiLanguage].folderDeleted, 'success');
        };
        const showFolderSettingsModal = (id, event) => {
            event?.stopPropagation();
            folderToCustomize = id;
            const folder = folders.find(f => f.id === id);
            if (!folder) return;


            // 1. 選擇圖示線條顏色
            ALL_ELEMENTS.colorSwatchesContainer.innerHTML = '';
            // 設定標題
            const colorTitle = ALL_ELEMENTS.colorSwatchesContainer.parentElement.querySelector('h3');
            if (colorTitle) colorTitle.textContent = "設定圖示線條顏色";
            
            Object.entries(FOLDER_COLORS).forEach(([name, hex]) => {
                const swatch = document.createElement('div');
                // 增加 flex-shrink-0 防止被壓縮
                swatch.className = `color-swatch w-8 h-8 rounded-full cursor-pointer border-2 border-transparent flex-shrink-0`;
                swatch.style.backgroundColor = hex;
                swatch.dataset.color = name;
                if (folder.color === name) {
                    swatch.classList.add('selected');
                    swatch.style.borderColor = '#3b82f6'; 
                }
                swatch.addEventListener('click', () => {
                    ALL_ELEMENTS.colorSwatchesContainer.querySelectorAll('.selected').forEach(el => {
                        el.classList.remove('selected');
                        el.style.borderColor = 'transparent';
                    });
                    swatch.classList.add('selected');
                    swatch.style.borderColor = '#3b82f6';
                });
                ALL_ELEMENTS.colorSwatchesContainer.appendChild(swatch);
            });


            // 2. 選擇 SVG 圖示 (修正排版)
            // 強制重設容器的 class，改用 flex wrap 或較寬鬆的 grid
            ALL_ELEMENTS.iconOptionsContainer.className = 'grid grid-cols-5 sm:grid-cols-6 gap-3 mt-2'; 
            ALL_ELEMENTS.iconOptionsContainer.innerHTML = '';
            
            Object.entries(FOLDER_SVGS).forEach(([key, svgPath]) => {
                const iconOption = document.createElement('div');
                // 確保圖示容器大小適中且不會跑版
                iconOption.className = 'icon-option w-11 h-11 sm:w-12 sm:h-12 rounded-lg cursor-pointer flex items-center justify-center bg-[var(--sidebar-bg)] border border-transparent hover:bg-[var(--hover-bg)] transition-all';
                // 這裡顯示 SVG
                iconOption.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
                iconOption.dataset.icon = key;
                
                if (folder.icon === key || (!folder.icon && key === 'default')) {
                    iconOption.classList.add('selected');
                    iconOption.style.borderColor = '#3b82f6';
                    iconOption.style.color = '#3b82f6';
                    iconOption.style.backgroundColor = 'var(--active-bg)'; // 選中時加深背景
                } else {
                    iconOption.style.color = 'var(--text-secondary)';
                }


                iconOption.addEventListener('click', () => {
                    ALL_ELEMENTS.iconOptionsContainer.querySelectorAll('.selected').forEach(el => {
                        el.classList.remove('selected');
                        el.style.borderColor = 'transparent';
                        el.style.color = 'var(--text-secondary)';
                        el.style.backgroundColor = '';
                    });
                    iconOption.classList.add('selected');
                    iconOption.style.borderColor = '#3b82f6';
                    iconOption.style.color = '#3b82f6';
                    iconOption.style.backgroundColor = 'var(--active-bg)';
                });
                ALL_ELEMENTS.iconOptionsContainer.appendChild(iconOption);
            });


            // 3. 選擇文字顏色
            let textColorContainer = document.getElementById('text-color-container');
            if (!textColorContainer) {
                const containerDiv = document.createElement('div');
                containerDiv.id = 'text-color-container';
                containerDiv.className = 'mt-6 border-t border-[var(--border-color)] pt-4';
                containerDiv.innerHTML = `
                    <h3 class="text-sm font-medium mb-3">選擇文字顏色</h3>
                    <div id="text-color-options" class="flex gap-4"></div>
                `;
                ALL_ELEMENTS.iconOptionsContainer.parentElement.after(containerDiv);
                textColorContainer = containerDiv;
            }


            const textColorOptions = document.getElementById('text-color-options');
            textColorOptions.innerHTML = '';
            
            const textColorMap = {
                'gray': { label: '預設灰', bg: '#6b7280', border: 'transparent' },
                'black': { label: '深邃黑', bg: '#111827', border: 'transparent' },
                'white': { label: '純淨白', bg: '#ffffff', border: '#e5e7eb' } 
            };


            Object.entries(textColorMap).forEach(([key, info]) => {
                const btn = document.createElement('button');
                btn.className = 'w-9 h-9 rounded-full cursor-pointer border-2 relative shadow-sm transition-transform hover:scale-110';
                btn.style.backgroundColor = info.bg;
                btn.style.borderColor = info.border;
                btn.dataset.textColor = key;
                btn.title = info.label;


                if (folder.textColor === key || (!folder.textColor && key === 'gray')) {
                    btn.classList.add('selected-text');
                    btn.innerHTML = `<svg class="w-5 h-5 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${key === 'white' ? 'text-black' : 'text-white'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    if (key === 'white') btn.style.borderColor = '#3b82f6';
                    else btn.style.boxShadow = '0 0 0 2px #3b82f6';
                }


                btn.addEventListener('click', () => {
                    textColorOptions.querySelectorAll('.selected-text').forEach(el => {
                        el.classList.remove('selected-text');
                        el.innerHTML = '';
                        el.style.boxShadow = '';
                        if (el.dataset.textColor === 'white') el.style.borderColor = '#e5e7eb';
                    });
                    btn.classList.add('selected-text');
                    btn.innerHTML = `<svg class="w-5 h-5 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 ${key === 'white' ? 'text-black' : 'text-white'}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
                    if (key === 'white') btn.style.borderColor = '#3b82f6';
                    else btn.style.boxShadow = '0 0 0 2px #3b82f6';
                });
                textColorOptions.appendChild(btn);
            });


            toggleModal(ALL_ELEMENTS.folderSettingsModal, true);
        };
        const handleSaveFolderSettings = async () => {
            const folder = folders.find(f => f.id === folderToCustomize);
            if (!folder) return;


            // 1. 取得選中的線條顏色
            const selectedColor = ALL_ELEMENTS.colorSwatchesContainer.querySelector('.selected')?.dataset.color;
            
            // 2. 取得選中的圖示 Key
            const selectedIcon = ALL_ELEMENTS.iconOptionsContainer.querySelector('.selected')?.dataset.icon;
            
            // 3. 取得選中的文字顏色 (新功能)
            const textColorContainer = document.getElementById('text-color-options');
            const selectedTextColor = textColorContainer?.querySelector('.selected-text')?.dataset.textColor;


            if (selectedColor) folder.color = selectedColor;
            if (selectedIcon) folder.icon = selectedIcon;
            if (selectedTextColor) folder.textColor = selectedTextColor;


            await saveAppData();
            renderAll();
            toggleModal(ALL_ELEMENTS.folderSettingsModal, false);
            folderToCustomize = null;
        };
        const createFolderMenu = (folderId, targetButton) => {
            const existingPopover = document.getElementById('history-popover');
            if (existingPopover) {
                existingPopover.remove();
                if (existingPopover.dataset.targetId === targetButton.id) return;
            }
            const rect = targetButton.getBoundingClientRect();
            const popover = document.createElement('div');
            popover.id = 'history-popover';
            popover.className = 'popover absolute w-48 rounded-lg border border-[var(--border-color)] z-50';
            popover.dataset.targetId = targetButton.id;
            popover.style.top = `${rect.bottom}px`;
            popover.style.left = `${rect.left}px`;
            popover.innerHTML = `
                <button data-id="${folderId}" class="rename-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].rename || '重新命名'}</button>
                <button data-id="${folderId}" class="customize-folder-btn w-full text-left px-4 py-2 hover:bg-[var(--hover-bg)] text-sm">${i18n[config.uiLanguage].customize || '自訂'}</button>
                <div class="border-t my-1 border-[var(--border-color)]"></div>
                <button data-id="${folderId}" class="delete-folder-btn w-full text-left px-4 py-2 text-red-600 hover:bg-red-500/10 text-sm">${i18n[config.uiLanguage].deleteFolder || '刪除資料夾'}</button>
            `;
            document.body.appendChild(popover);
            requestAnimationFrame(() => popover.classList.add('visible'));
            popover.querySelector('.rename-folder-btn').addEventListener('click', (e) => { showRenameModal(folderId, 'folder', e); popover.remove(); });
            popover.querySelector('.customize-folder-btn').addEventListener('click', (e) => { showFolderSettingsModal(folderId, e); popover.remove(); });
            popover.querySelector('.delete-folder-btn').addEventListener('click', (e) => { deleteFolder(folderId, e); popover.remove(); });
        };
        const toggleSelectionMode = () => {
    isSelectionMode = !isSelectionMode;
    selectedConversationIds.clear();


    // ✨ 核心修改：不再改變文字，而是切換 'active' CSS 類別
    ALL_ELEMENTS.selectionModeBtn.classList.toggle('active', isSelectionMode);


    // ✨ 優化：同時更新滑鼠懸停時的提示文字
    if (isSelectionMode) {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[config.uiLanguage].cancelBatchSelect || '取消批次選取';
    } else {
        ALL_ELEMENTS.selectionModeBtn.title = i18n[config.uiLanguage].batchSelect || '批次選取';
    }


    renderAll();
};
        const renderBatchActionBar = () => {
            const { batchActionBar, userControls, selectionCount, batchDeleteBtn, batchArchiveBtn, batchMoveBtn } = ALL_ELEMENTS;
            if (isSelectionMode) {
                batchActionBar.classList.remove('hidden');
