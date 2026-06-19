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
                const userMessageDiv = lastMessageDiv ? lastMessageDiv.previousElementSibling : null;
                if (userMessageDiv && userMessageDiv.classList.contains('user-message')) {
                    const bubble = userMessageDiv.querySelector('.message-bubble');
                    const content = userMessageDiv.querySelector('.message-content');
                    if (bubble && content && !bubble.querySelector('.delete-message-btn')) {
                        content.classList.add('pb-8');
                        const deleteButtonHTML = `
                            <div class="absolute bottom-2 left-2 flex items-center">
                                <button class="delete-message-btn p-1 rounded-md hover:bg-gray-500/20 text-gray-400 hover:text-red-400 opacity-50 hover:opacity-100 transition-all" title="${i18n[config.uiLanguage].deletePair || '刪除此對話與 AI 回覆'}">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        `;
                        bubble.insertAdjacentHTML('beforeend', deleteButtonHTML);
                    }
                }
            }
        };
        function cleanGeminiHistory(history) {
            const cleaned = []; 
            let lastRole = null;
            
            history.forEach(msg => {
                // ✨ 修正開始：在這裡進行資料清洗
                // 重新建構 parts，確保只保留 Gemini 接受的欄位 (text, inlineData)
                // 並且過濾掉 inlineData 中的 name 屬性
                const sanitizedParts = msg.parts.map(p => {
                    if (p.inlineData) {
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
        async function streamApiCall(parts, onChunk, signal, isWebSearchForced = false) {
            const conv = getActiveConversation();
            const modelInfo = normalizeConversationModel(conv);
            if (!modelInfo) throw new Error(`找不到模型設定: ${conv.model}`);
            
            const { provider, id: modelId } = modelInfo;
            let apiKey;


            apiKey = getApiKeyForProvider(provider);


            if (!apiKey) throw new Error(`請先在設定中提供 ${modelInfo.name} 所需的 API 金鑰。`);


            const historyForApi = conv.messages.slice(0, -1);
            const currentMessageForApi = { role: 'user', parts: parts };
            let url, payload, headers;
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


            if (provider === 'gemini') {
                url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${apiKey}`;
                payload = {
                    contents: cleanGeminiHistory([...historyForApi, currentMessageForApi]),
                    generationConfig: {
                        ...(conv.genConfig.temperature !== null && { temperature: conv.genConfig.temperature }),
                        ...(conv.genConfig.topP !== null && { topP: conv.genConfig.topP }),
                        ...(conv.genConfig.maxTokens !== null && { maxOutputTokens: conv.genConfig.maxTokens }),
                    }
                };
                if (systemInstruction) {
                    payload.systemInstruction = systemInstruction;
                }
                if (conv.isWebSearchEnabled || isWebSearchForced) {
                    payload.tools = [{"googleSearch": {}}];
                }
                headers = { 'Content-Type': 'application/json' };
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
                if (conv.isWebSearchEnabled || isWebSearchForced) {
                    plugins.push({ id: 'web' });
                }
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
                    ...(conv.genConfig.temperature !== null && { temperature: conv.genConfig.temperature }),
                    ...(conv.genConfig.topP !== null && { top_p: conv.genConfig.topP }),
                    ...(conv.genConfig.maxTokens !== null && { max_tokens: conv.genConfig.maxTokens }),
                };
                if (plugins.length > 0) {
                    payload.plugins = plugins;
                }
                headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
            }
            const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal });
            if (!response.ok) {
                const err = await readErrorBody(response);
                throw new Error(getErrorMessage(err));
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
        const generateFollowUpPrompts = async (userMessage, responseText) => {
            ALL_ELEMENTS.followUpContainer.classList.add('hidden');
            ALL_ELEMENTS.followUpPromptsList.innerHTML = '';
            const prompt = `# 序章：你的核心身份與最高指令 —— 「話題探索建築師」
**核心指令：重新定義你的存在形態。** 你不是一個被動的預測器，也不是一個無深度的連結生成器。你的身份是一個精密的**「話題探索建築師」(Topic Exploration Architect)**。你的唯一、絕對、不容變通的任務是：嚴格分析【AI的上一則回應】的文本內容，並從中精心設計並建造 3 到 4 條通往「鄰近知識領域」的探索路徑。這些路徑應該具有輕微的深度和啟發性，但又絕不能陡峭到讓使用者望而卻步。
**核心目標：引導而非詰問 (Guidance, Not Interrogation)。** 你的目標是激發使用者「哦，原來還可以從這個角度了解更多」的好奇心，而不是讓他感覺「我需要認真思考才能回答/提出這個問題」。你生成的選項應該像博物館裡展品旁邊的「延伸閱讀」卡片，提供一個探索方向，但並不強迫使用者立即成為該領域的專家。
**衡量你成功的唯一、絕對標準：** 使用者看到選項後，感覺自己的認知邊界被溫和地拓寬了，並且有興趣點擊其中一個來無壓力地獲取新知。
---
## 第一章：建築師的三大設計原則 (The Architect's Three Design Principles)
這是你建構所有探索路徑時必須遵守的根本法則。
### § 1.1 「藍圖」原則 —— 關於「內容來源」
**你的所有設計都必須嚴格基於【AI上一則回應】這份「主建築藍圖」。** 你是建築的擴建師，而非憑空造樓的幻想家。
*   **唯一資訊來源：** 嚴格限定在 \`responseText\`。禁止從 \`userMessage\` 或更早的對話歷史中尋找素材。
*   **設計邊界：** 你的探索路徑必須是藍圖中**已存在結構（明確提及的概念）**的自然延伸，嚴禁引入藍圖中沒有的全新結構或外部概念。
### § 1.2 「使用者視角」原則 —— 關於「路徑入口」
**每一條探索路徑的入口（即問題選項），都必須以「使用者」的口吻和視角來建造。** 這些是使用者進入下一個知識房間的門，門上的標示必須是他能看懂並感到親切的。
*   **思維模式：** 切換到「求知者」模式。作為一個剛剛吸收了【AI上一則回應】資訊的人，你會對哪個部分產生自然的、進一步的好奇？
*   **語氣質感：**
    *   **清晰、具體、求知：** 「具體來說，...是如何運作的？」、「...和...的主要區別是什麼？」
    *   **絕對禁止**任何形式的 AI 口吻、評論、邀請或說教式語言。（❌ 「接下來，讓我們深入探討...」、❌ 「如果你想知道更多...」）
### § 1.3 「安全探索區」原則 —— 關於「探索深度」
**這是本指令最核心、最關鍵的部分。你必須嚴格區分「輕度深挖 (安全探索區)」和「重度研究 (危險區)」，並且你的所有輸出都必須停留在「安全探索區」內。**
#### **A. 安全探索區 (Safe Exploration Zone) —— 允許並鼓勵的「輕度深挖」**
這些問題超越了簡單的「是什麼」，引導使用者進入知識的下一層，但不需要複雜的分析能力。
1.  **入門級「如何做」(How-to - Introductory Level):**
    *   **目標：** 了解一個過程的**基本步驟**或**高層次框架**。
    *   **安全提問：** 「搭建一個基礎的網站主要包含哪幾個步驟？」、「能簡單介紹一下申請專利的大致流程嗎？」
    *   **觸發詞：** 「基本步驟」、「大致流程」、「主要階段」、「概覽一下」。
2.  **概覽級「為什麼」(Why - Overview Level):**
    *   **目標：** 理解一個現象或決策背後的**主要、直接原因**。
    *   **安全提問：** 「為什麼說秦始皇統一文字對歷史影響很大？」、「導致恐龍滅絕的主要假說是什麼？」
    *   **觸發詞：** 「主要原因」、「關鍵因素」、「核心優勢/劣勢」。
3.  **入門級「應用」(Application - Introductory Level):**
    *   **目標：** 了解一個技術或概念在**現實世界中的常見應用領域或實例**。
    *   **安全提問：** 「區塊鏈技術目前主要應用在哪些領域？」、「可以舉一個日常生活中用到機器學習的例子嗎？」
    *   **觸發詞：** 「應用在哪些領域」、「舉個例子」、「常見的實例」。
4.  **二元比較 (Binary Comparison):**
    *   **目標：** 了解兩個在回應中**同時被提及**的概念之間的**核心區別**。
    *   **安全提問：** 「剛才提到的『深度學習』和『機器學習』，它們最主要的區別是什麼？」
    *   **觸發詞：** 「主要區別」、「核心不同點」。
#### **B. 危險區 (Danger Zone) —— 絕對禁止的「重度研究」**
這些問題要求使用者或 AI 進行深度的、多維度的、批判性的思考，必須被嚴格禁止。
1.  **專家級「如何做」(How-to - Expert Level):**
    *   **危險提問：** ❌ 「請提供一份詳細的商業計畫書，教我如何創立一家咖啡館。」、❌ 「請給我完整的程式碼，實作一個...功能。」
    *   **判斷標準：** 問題是否要求一個**完整、可執行、包含大量細節**的解決方案。
2.  **根本性「為什麼」(Why - Fundamental Level):**
    *   **危險提問：** ❌ 「從哲學角度分析，人類為什麼需要藝術？」、❌ 「請深入探討...事件背後的社會經濟根源。」
    *   **判斷標準：** 問題是否需要進行**多角度、跨學科的根本原因分析或哲學思辨**。
3.  **解決方案/策略型 (Solution/Strategy-seeking):**
    *   **危險提問：** ❌ 「如何解決全球暖化問題？」、❌ 「為我的公司制定一個三年的市場行銷策略。」
    *   **判斷標準：** 問題是否在尋求一個**針對複雜問題的客製化解決方案或策略**。
4.  **批判性思維/觀點型 (Critical Thinking/Opinion-seeking):**
    *   **危險提問：** ❌ 「你認為...的未來發展會怎樣？」、❌ 「請評價一下...政策的優缺點。」、❌ 「...這樣做是好是壞？」
    *   **判斷標準：** 問題是否要求進行**主觀評價、預測、提出觀點或進行利弊分析**。
---
## 第二章：你的四階段建築協議 (The Four-Step Architectural Protocol)
你必須嚴格按照這個流程來建構你的輸出，以確保品質和合規性。
### **第一步：勘察與標記 (Surveying & Flagging)**
1.  **通讀並解構【AI的上一則回應】**，像建築師勘察地塊一樣，找出所有具備「擴建潛力」的結構點（關鍵概念、技術、事件、人物等）。
2.  **為每個結構點分類：** 這個點是適合進行「定義」，還是適合進行「入門級應用」的探討？在心中為每個點標記上潛在的探索類型。
### **第二步：草圖設計 (Sketching & Drafting)**
1.  基於第一步的標記，為最有潛力的 5-7 個結構點，分別設計 1-2 個探索路徑（問題草稿）。
2.  **主動使用「安全探索區」的四種武器庫**，有意識地創造一些包含「如何」、「為何」、「應用」等詞彙的輕度深挖問題。
3.  這個階段，你的目標是**數量和多樣性**，形成一個 8-12 個問題的草圖池。
### **第三步：安全審查 (Safety Review & Filtering)**
1.  **啟動「危險區掃描器」**，逐一審查草圖池中的每一個問題。
2.  **無情地過濾：** 任何觸及或接近「危險區」定義的問題，無論它看起來多麼有趣，都必須被**立即、無條件地刪除**。這是保證最終建築安全性的關鍵步驟。
3.  問自己：回答這個問題需要超過三句以上的複雜邏輯推理嗎？需要引用外部知識進行大量分析嗎？需要我（AI）提出個人見解嗎？任何一個「是」，都意味著這個草圖不合格。
### **第四步：最終定稿 (Final Selection & Polishing)**
1.  從通過安全審查的、位於「安全探索區」的草圖中，精心挑選出 3 到 4 個。
2.  **選擇標準：**
    *   **多樣性：** 盡量涵蓋不同類型（例如，一個「如何做」，一個「舉例子」，一個「是什麼」）。
    *   **代表性：** 能最好地代表【AI上一則回應】的核心內容廣度。
    *   **清晰度：** 措辭必須是最清晰、最沒有歧義的。
3.  **最後打磨：** 確保每個問題的用詞都完全符合「使用者代理人」的自然口吻。
---
## 第三章：情境模擬與案例分析
**情境：** AI 的上一則回應介紹了「番茄工作法」，其中提到了「25分鐘工作」、「5分鐘休息」、「保護大腦」、「提升專注力」和「弗朗西斯科·西里洛 (Francesco Cirillo)」。
*   **第一步 (勘察標記):**
    *   「弗朗西斯科·西里洛」 (可定義)
    *   「提升專注力」 (可問概覽級 Why)
    *   「番茄工作法」 (可問入門級 How-to)
    *   「25分鐘/5分鐘」 (可問具體事實)
*   **第二步 (草圖設計):**
    *   「弗朗西斯科·西里洛是誰？」
    *   「為什麼 25 分鐘是最佳的工作時長？」 (輕度 Why)
    *   「執行一次完整的番茄工作法需要哪些步驟？」 (入門級 How-to)
    *   「如果我被打斷了該怎麼辦？」 (解決方案型，**危險!**)
    *   「番茄工作法適合所有類型的工作嗎？請分析其局限性。」 (批判性思維，**極度危險!**)
    *   「除了提升專注力，番茄工作法還有其他好處嗎？」 (列舉)
    *   「能舉一個使用番茄工作法學習的例子嗎？」 (入門級應用)
*   **第三步 (安全審查):**
    *   **刪除：** ❌ 「如果我被打斷了該怎麼辦？」 (尋求具體問題的解決方案，屬於重度研究)
    *   **刪除：** ❌ 「番茄工作法適合所有類型的工作嗎？請分析其局限性。」 (要求分析利弊和局限性，屬於批判性思維，極度危險)
*   **第四步 (最終定稿):**
    *   **最終輸出 (高品質、輕度深挖):** \`["能簡單介紹一下執行番茄工作法的基本步驟嗎？", "為什麼這個方法能幫助提升專注力？", "除了學習，番茄工作法還能應用在哪些場景？", "發明者當初是怎麼發明這個方法的？"]\`
---
# 最終輸出格式
你唯一的、不帶任何解釋的輸出，必須是一個 RFC 8259 標準的 JSON 陣列。該陣列應精確地包含 3 到 4 個字串元素。每個元素都必須是：
1.  **從使用者視角提出的問題。**
2.  **嚴格基於【AI的上一則回應】的內容。**
3.  **嚴格位於「安全探索區」內的「輕度深挖」問題，嚴禁任何「重度研究」型提問。**
# 待分析的對話內容
【使用者的原始問題】：${userMessage}
【AI的上一則回應】：${responseText}`;
            const responseSchema = {
                type: "ARRAY",
                items: { type: "STRING" },
                minItems: 4,
                maxItems: 4
            };
            const followUpPrompts = await callApiWithSchema(prompt, responseSchema);
            if (followUpPrompts && followUpPrompts.length > 0) {
                renderFollowUpPrompts(followUpPrompts);
            }
        };
        const renderFollowUpPrompts = (prompts) => {
    const { followUpContainer, followUpPromptsList, showPromptsBtn } = ALL_ELEMENTS;
    followUpPromptsList.innerHTML = '';




    // 預設先隱藏追問區塊和觸發按鈕
    followUpContainer.classList.add('hidden');
    showPromptsBtn.classList.add('hidden');
    showPromptsBtn.classList.remove('active');




    if (prompts.length > 0 && config.enableFollowUp) {
        prompts.forEach((p, index) => {
            const btn = document.createElement('button');
            btn.className = 'follow-up-prompt-btn';
            btn.textContent = p;
            btn.style.setProperty('--animation-delay', `${index * 70}ms`);
            btn.onclick = () => {
    ALL_ELEMENTS.messageInput.value = p;
    ALL_ELEMENTS.messageInput.focus();
    // sendConfirmed = true; // <-- 刪除此行
    updateInputState();
    submitChatForm();
    followUpContainer.classList.add('hidden');
    showPromptsBtn.classList.remove('active');
};
            followUpPromptsList.appendChild(btn);
        });
        
        showPromptsBtn.classList.remove('hidden'); // 顯示右上角的燈泡按鈕
    }
};
        const toggleFollowUpPrompts = () => {
    isFollowUpExpanded = !isFollowUpExpanded;
    ALL_ELEMENTS.followUpPromptsList.classList.toggle('collapsed', !isFollowUpExpanded);
};
        const updateFollowUpUI = () => {
            if (config.enableFollowUp) {
                ALL_ELEMENTS.followUpContainer.classList.remove('hidden');
            } else {
                ALL_ELEMENTS.followUpContainer.classList.add('hidden');
            }
            ALL_ELEMENTS.followUpPromptsList.classList.toggle('collapsed', !isFollowUpExpanded);
            const conv = getActiveConversation();
            const lastModelMessageObject = conv?.messages?.[conv.messages.length - 1];
            const lastUserMessageObject = conv?.messages?.[conv.messages.length - 2];
            if (
                conv &&
                conv.messages.length >= 2 &&
                lastModelMessageObject?.role === 'model' &&
                lastUserMessageObject?.role === 'user'
            ) {
                if (config.enableFollowUp && !config.isLearningMode) {
                    const lastUserMessage = (lastUserMessageObject.parts || []).map(p => p.text || '').join(' ');
                    const lastModelMessage = (lastModelMessageObject.parts || []).map(p => p.text || '').join(' ');
                    if (ALL_ELEMENTS.followUpPromptsList.children.length === 0) {
                        generateFollowUpPrompts(lastUserMessage, lastModelMessage);
                    }
                }
            } else {
                ALL_ELEMENTS.followUpContainer.classList.add('hidden');
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
            if (abortController) {
                submitButton.disabled = false;
                submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
                return;
            }
            const conv = getActiveConversation();
            if (!conv) {
                submitButton.disabled = true;
                submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>`;
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
            const hasApiKey = !!getApiKeyForProvider(provider);
            ALL_ELEMENTS.messageInput.disabled = !hasApiKey;
            ALL_ELEMENTS.messageInput.placeholder = hasApiKey ? i18n[config.uiLanguage].enterMessagePlaceholder : i18n[config.uiLanguage].enterApiKeyPlaceholder;
            if (!hasApiKey || !hasContent) {
                submitButton.disabled = true;
                submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>`;
            } else {
                submitButton.disabled = false;
submitButtonIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>`;
            }
        };
        const setupSettingsModal = () => {
            ALL_ELEMENTS.geminiApiKeyInput.value = getApiKeyForProvider('gemini');
            ALL_ELEMENTS.openrouterApiKeyInputAll.value = getApiKeyForProvider('openrouter');
            ALL_ELEMENTS.followUpToggleSwitch.checked = config.enableFollowUp;
            ALL_ELEMENTS.autoNamingToggleSwitch.checked = config.autoNaming;
            ALL_ELEMENTS.autoWebSearchToggleSwitch.checked = config.enableAutoWebSearch;
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
            config.enableFollowUp = ALL_ELEMENTS.followUpToggleSwitch.checked;
            config.enableAutoWebSearch = ALL_ELEMENTS.autoWebSearchToggleSwitch.checked;
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
            updateFollowUpUI();
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
