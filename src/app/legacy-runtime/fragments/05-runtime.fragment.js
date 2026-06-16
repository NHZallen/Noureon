                    </ul>
                </div>
            `;
            ALL_ELEMENTS.messageList.appendChild(card);
            ALL_ELEMENTS.chatContainer.scrollTo({ top: ALL_ELEMENTS.chatContainer.scrollHeight, behavior: 'smooth' });


            // 返回一個可以控制儀表板狀態的物件
            return {
                cardElement: card,
                updateStep: (index, status, text) => {
                    const stepId = index === 'synthesis' ? 'research-step-synthesis' : `research-step-${index}`;
                    const stepElement = card.querySelector(`#${stepId}`);
                    if (stepElement) {
                        stepElement.className = `research-step status-${status}`;
                        const iconContainer = stepElement.querySelector('.status-icon');
                        const textElement = stepElement.querySelector('.step-text');
                        
                        if (status === 'running') {
                            iconContainer.innerHTML = '<div class="spinner"></div>';
                        } else if (status === 'completed') {
                            iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
                        } else if (status === 'error') {
                            iconContainer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
                        }
                        
                        if (text) {
                            textElement.textContent = text;
                        }
                    }
                },
                setTitle: (newTitle) => {
                    const titleElement = card.querySelector('h4');
                    if (titleElement) {
                        // 保持 spinner 不變，只更新文字
                        titleElement.childNodes[1].textContent = ` ${newTitle}`;
                    }
                },
                remove: () => card.remove()
            };
        }
        
        // ✨ 新增：處理互動式計畫的核心邏輯
        function showInteractivePlanEditor(initialPlan) {
    return new Promise((resolve) => {
        // ✨ 1. 修改了變數名稱，並加入了新的按鈕
        const { interactivePlanModal, planEditorStepsContainer, addPlanStepBtn, confirmPlanBtn } = ALL_ELEMENTS;
        const closeEditorBtn = document.getElementById('close-plan-editor-btn');
        const fullyCancelBtn = document.getElementById('fully-cancel-research-btn');
        
        function renderPlanSteps() {
            planEditorStepsContainer.innerHTML = '';
            const totalSteps = initialPlan.length;


            initialPlan.forEach((plan, index) => {
                const stepElement = document.createElement('div');
                stepElement.className = 'plan-editor-step';
                stepElement.dataset.index = index;
                stepElement.innerHTML = `
                    <div class="step-header">
                        <label>步驟 ${index + 1}</label>
                        <div class="flex items-center gap-1">
                            <button class="move-step-btn move-up-btn p-1 rounded-full hover:bg-[var(--hover-bg)]" title="上移" ${index === 0 ? 'disabled' : ''}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                            </button>
                            <button class="move-step-btn move-down-btn p-1 rounded-full hover:bg-[var(--hover-bg)]" title="下移" ${index === totalSteps - 1 ? 'disabled' : ''}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
                            </button>
                            <button class="remove-step-btn ml-2 p-1 rounded-full hover:bg-[var(--hover-bg)]" title="移除此步驟">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    </div>
                    <input type="text" class="step-title-input w-full" placeholder="步驟標題">
                    <textarea class="step-action-input w-full" placeholder="步驟具體行動"></textarea>
                `;
                stepElement.querySelector('.step-title-input').value = plan.step || '';
                stepElement.querySelector('.step-action-input').value = plan.action || '';
                planEditorStepsContainer.appendChild(stepElement);


                const insertButtonContainer = document.createElement('div');
                insertButtonContainer.className = 'flex justify-center items-center my-2';
                insertButtonContainer.innerHTML = `
                    <button class="insert-step-btn flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] py-1 px-3 rounded-full hover:bg-[var(--hover-bg)] transition-all" data-insert-at="${index + 1}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        在此插入新步驟
                    </button>
                `;
                planEditorStepsContainer.appendChild(insertButtonContainer);
            });
            updateRemoveButtonsState();
        }


        function updateRemoveButtonsState() {
            const removeButtons = planEditorStepsContainer.querySelectorAll('.remove-step-btn');
            removeButtons.forEach(btn => {
                btn.disabled = removeButtons.length <= 1;
            });
        }


        function handleAddStep() {
            if (initialPlan.length >= 10) {
                showNotification('最多只能有 10 個步驟。', 'warning');
                return;
            }
            initialPlan.unshift({ step: `新步驟`, action: '' });
            renderPlanSteps();
        }


        // ✨ 2. 修改了 cleanupAndClose 函式
        function cleanupAndClose() {
            toggleModal(interactivePlanModal, false);
            confirmPlanBtn.removeEventListener('click', onConfirm);
            closeEditorBtn.removeEventListener('click', onCloseEditor); // 修改
            fullyCancelBtn.removeEventListener('click', onFullyCancel); // 新增
            addPlanStepBtn.removeEventListener('click', handleAddStep);
            planEditorStepsContainer.removeEventListener('click', onStepContainerClick);
        }
        
        function onConfirm() {
            const finalPlan = [];
            const stepElements = planEditorStepsContainer.querySelectorAll('.plan-editor-step');
            let isValid = true;
            stepElements.forEach(el => {
                const title = el.querySelector('.step-title-input').value.trim();
                const action = el.querySelector('.step-action-input').value.trim();
                if (!title || !action) {
                    isValid = false;
                }
                finalPlan.push({ step: title, action: action });
            });
            
            if (!isValid) {
                showNotification('所有步驟的標題和內容都不能為空！', 'error');
                return;
            }
            
            cleanupAndClose();
            resolve(finalPlan);
        }
        
        // ✨ 3. 這是新的「關閉編輯」按鈕的行為
        function onCloseEditor() {
            cleanupAndClose();
            // 返回「未經修改」的原始計畫，讓研究繼續
            resolve(initialPlan); 
        }


        // ✨ 4. 這是新的「取消研究」按鈕的行為
        function onFullyCancel() {
            cleanupAndClose();
            // 返回 null，觸發後續的「使用者取消了研究」的邏輯
            resolve(null); 
        }
        
        function onStepContainerClick(e) {
            const removeBtn = e.target.closest('.remove-step-btn');
            const moveUpBtn = e.target.closest('.move-up-btn');
            const moveDownBtn = e.target.closest('.move-down-btn');
            const insertBtn = e.target.closest('.insert-step-btn');


            if (removeBtn) {
                const stepElement = removeBtn.closest('.plan-editor-step');
                const index = parseInt(stepElement.dataset.index);
                initialPlan.splice(index, 1);
                renderPlanSteps();
            } else if (moveUpBtn) {
                const stepElement = moveUpBtn.closest('.plan-editor-step');
                const index = parseInt(stepElement.dataset.index);
                if (index > 0) {
                    [initialPlan[index - 1], initialPlan[index]] = [initialPlan[index], initialPlan[index - 1]];
                    renderPlanSteps();
                }
            } else if (moveDownBtn) {
                const stepElement = moveDownBtn.closest('.plan-editor-step');
                const index = parseInt(stepElement.dataset.index);
                if (index < initialPlan.length - 1) {
                    [initialPlan[index + 1], initialPlan[index]] = [initialPlan[index], initialPlan[index + 1]];
                    renderPlanSteps();
                }
            } else if (insertBtn) {
                if (initialPlan.length >= 10) {
                    showNotification('最多只能有 10 個步驟。', 'warning');
                    return;
                }
                const insertAtIndex = parseInt(insertBtn.dataset.insertAt);
                initialPlan.splice(insertAtIndex, 0, { step: `新插入的步驟`, action: '' });
                renderPlanSteps();
            }
        }


        renderPlanSteps();
        
        // ✨ 5. 綁定新的事件監聽器
        confirmPlanBtn.addEventListener('click', onConfirm);
        closeEditorBtn.addEventListener('click', onCloseEditor); // 修改
        fullyCancelBtn.addEventListener('click', onFullyCancel); // 新增
        addPlanStepBtn.addEventListener('click', handleAddStep);
        planEditorStepsContainer.addEventListener('click', onStepContainerClick);


        toggleModal(interactivePlanModal, true);
    });
}
        
        // ✨ 更新後的深度研究核心函數
        async function handleDeepResearch(userMessage) {
            renderFollowUpPrompts([]);
            const conv = getActiveConversation();
            if (conv.archived) return;


            abortController = new AbortController();
            updateSubmitButtonState(true);


            const hasFiles = uploadedFiles.length > 0;
            const userParts = [{ text: userMessage }];
            if (hasFiles) {
                uploadedFiles.forEach(file => {
                    userParts.push({
                        inlineData: {
                            mimeType: file.type,
                            data: file.base64.split(',')[1]
                        }
                    });
                });
            }


            const userMessageObject = { role: 'user', parts: userParts, createdAt: new Date().toISOString() };
            addMessageToUI(userMessageObject, conv.messages.length, true);
            conv.lastUpdatedAt = new Date().toISOString();
            conv.unsentMessage = '';


            if (conv.isTemporary) {
                conv.isTemporary = false;
                conv.isNaming = true;
                renderHistorySidebar();
                if (config.autoNaming) {
                    await generateTitleAndSummary(conv);
                } else {
                    conv.isNaming = false;
                }
                await saveAppData();
            }


            ALL_ELEMENTS.messageInput.value = '';
            uploadedFiles = [];
            adjustTextareaHeight();
            renderFilePreviews();
            
            let dashboard = addResearchDashboardCard('啟動深度研究...', ['正在分析主題並規劃研究計畫...']);
            dashboard.updateStep(0, 'running');


            try {
                // --- 階段一：生成初步研究計畫 ---
                const queryCount = config.deepResearchQueryCount;
let stepCountInstruction = '你的計畫應包含合理的步驟數量來完整回答使用者的問題，但自動產生的步驟最多不應超過 10 個。';
if (queryCount > 0) {
    stepCountInstruction = `你的計畫必須精確地包含 ${queryCount} 個步驟。`;
}


const plannerPrompt = `# 核心身份：首席任務拆解分析師
你的任務是將使用者的「請求」（包含文字和可能的圖片）拆解成一個清晰、可執行的研究計畫。你的目標是制定步驟來**直接回答使用者的核心問題**。


# 最高指導原則：聚焦於使用者的「直接問題」
這是你不可違背的首要原則。你必須準確識別使用者請求中的**具體、客觀問題**（例如「這是什麼？」、「如何做？」、「在哪裡？」），並將其作為整個研究計畫的核心目標。
- **主觀陳述是次要上下文，不是研究主題！** 如果使用者說「這個好好吃喔」，這只是提供背景，你的任務不是去研究「好吃的定義」，而是去完成使用者提出的主要請求。
- **圖片是主要證據！** 如果提供了圖片，你的第一個步驟**永遠**應該是分析圖片以提取關鍵資訊。


# 數量規定
${stepCountInstruction}


# 卓越典範
- **使用者請求：** (提供餅乾包裝圖) "這是什麼品牌的好好吃喔"
  - **錯誤計畫：** 1. 研究「好吃」的定義。 2. 分析使用者覺得好吃的原因。
  - **正確計畫：** 1. **從圖片中識別品牌名稱、產品名稱及任何顯著特徵**。 2. 搜尋該品牌的官方網站與產品資訊。 3. 查找該產品的線上評論與販售通路。 4. 綜合資訊以確認品牌並提供相關細節。
- **使用者請求：** "幫我規劃一個五天的東京自由行，我喜歡動漫。"
  - **錯誤計畫：** 1. 研究東京的歷史。 2. 分析自由行的好處。
  - **正確計畫：** 1. 列出東京與動漫相關的核心景點（如秋葉原、三鷹之森美術館）。 2. 根據地理位置規劃合理的每日路線。 3. 搜尋各景點的交通方式與開放時間。 4. 尋找特色動漫主題餐廳或活動。 5. 綜合以上資訊，形成一份包含每日行程、交通建議的完整計畫。


# 輸出格式
你必須嚴格地以一個 JSON 陣列的形式回覆，每個物件代表一個計畫步驟。不要包含任何 JSON 以外的解釋或文字。
\`\`\`json
[
  {
    "step": "1. 圖片分析",
    "action": "從使用者提供的包裝圖片中，識別出品牌 Logo、產品名稱、以及任何可辨識的文字或圖案。"
  },
  {
    "step": "2. 品牌搜尋",
    "action": "使用從圖片中識別出的關鍵字，搜尋該餅乾的品牌與產品線。"
  }
]
\`\`\`


# 本次研究主題
"${userMessage}"`;


                const plannerSchema = { 
                    type: "ARRAY", 
                    items: { 
                        type: "OBJECT",
                        properties: {
                            step: { type: "STRING" },
                            action: { type: "STRING" }
                        },
                        required: ["step", "action"]
                    }
                };


                let initialResearchPlan;
                try {
                    const apiKey = config.apiKeys.gemini;
                    if (!apiKey) throw new Error('Gemini API 金鑰未設定。');


                    const plannerPayload = {
                        contents: [{ role: 'user', parts: [{ text: plannerPrompt }, ...userParts.filter(p => p.inlineData)] }],
                        generationConfig: { responseMimeType: "application/json", responseSchema: plannerSchema }
                    };
                    const plannerApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${CHEAP_MODEL_ID}:generateContent?key=${apiKey}`;
                    const plannerResponse = await fetch(plannerApiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(plannerPayload), signal: abortController.signal });


                    if (!plannerResponse.ok) throw new Error(`研究計畫生成失敗: ${(await plannerResponse.json()).error?.message || 'API request failed'}`);
                    
                    const result = await plannerResponse.json();
                    const jsonString = result?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (jsonString) {
                        initialResearchPlan = JSON.parse(jsonString.trim().replace(/^```json|```$/g, '').trim());
                    } else {
                        throw new Error('API 未回傳有效的研究計畫 JSON。');
                    }
                } catch (error) {
                    console.error('生成研究計畫時出錯:', error);
                    throw error;
                }


                if (!initialResearchPlan || initialResearchPlan.length === 0) {
                    throw new Error('無法生成研究計畫。');
                }
                
                dashboard.remove(); // 移除初始的 "正在規劃..." 卡片


                // --- 階段二：使用者互動式編輯計畫 ---
                const finalResearchPlan = await showInteractivePlanEditor(initialResearchPlan);


                if (!finalResearchPlan) { // 使用者點擊了取消
                    abortController.abort();
                    throw new Error("使用者取消了研究。");
                }
                
                // --- 階段三：執行編輯後的計畫 ---
                dashboard = addResearchDashboardCard('正在執行您確認的研究計畫...', finalResearchPlan.map(p => `${p.step}: ${p.action}`));
                const allContextData = [];
                const currentModelInfo = MODELS.find(m => m.id === conv.model);


                // ✨ 核心修改：根據模型供應商決定研究方式
                if (currentModelInfo?.provider === 'openrouter') {
                    // --- OpenRouter 的「離線」研究流程 ---
                    dashboard.setTitle('正在整理現有資料...');
                    
                    // 1. 收集所有可用上下文
                    const historyText = conv.messages.slice(0, -1).map(m => `${m.role}:\n${m.parts.map(p => p.text || `[${p.inlineData.mimeType}]`).join('\n')}`).join('\n\n');
                    allContextData.push(`## 對話歷史紀錄\n${historyText}`);


                    if (hasFiles) {
                        const fileInfo = uploadedFiles.map(f => `- ${f.name} (${f.type})`).join('\n');
                        allContextData.push(`## 使用者上傳的檔案\n${fileInfo}\n(檔案內容已在系統後端處理，你只需知曉有這些檔案存在即可)`);
                    }


                    // 2. 模擬步驟完成的儀表板更新
                    for (let i = 0; i < finalResearchPlan.length; i++) {
                         if (abortController.signal.aborted) throw new Error("研究已中止。");
                         dashboard.updateStep(i, 'running', `正在分析與「${finalResearchPlan[i].step}」相關的資料...`);
                         // 模擬處理延遲
                         await new Promise(resolve => setTimeout(resolve, 300));
                         dashboard.updateStep(i, 'completed', `「${finalResearchPlan[i].step}」的資料已整理完畢`);
                    }


                } else {
                    // --- Gemini 的「線上」研究流程 (原本的程式碼) ---
                    for (let i = 0; i < finalResearchPlan.length; i++) {
                        if (abortController.signal.aborted) throw new Error("研究已中止。");
                        const planStep = finalResearchPlan[i];
                        dashboard.updateStep(i, 'running');


                        const queryGenPrompt = `基於以下總體研究目標和當前具體的研究步驟，生成 2-3 個最有效的 Google 搜尋關鍵字。請嚴格以 JSON 陣列格式回傳。


總體目標: "${userMessage}"
當前步驟: "${planStep.step}: ${planStep.action}"`;
                        
                        const queryGenSchema = { type: "ARRAY", items: { type: "STRING" }, maxItems: 3 };
                        const searchQueries = await callApiWithSchema(queryGenPrompt, queryGenSchema, abortController.signal);


                        if (!searchQueries || searchQueries.length === 0) {
                            allContextData.push(`--- 步驟 "${planStep.step}" 的資料收集失敗：無法生成有效的搜尋關鍵字 ---\n`);
                            dashboard.updateStep(i, 'error');
                            continue;
                        }
                        
                        const searchPromises = searchQueries.map(query => 
                            streamApiCall(
                                [{ text: query }], 
                                () => {}, 
                                abortController.signal,
                                true // 強制使用 Web Search
                            ).then(result => `--- 關於 "${query}" 的搜尋結果 ---\n${result}\n`)
                             .catch(err => `--- 關於 "${query}" 的搜尋失敗 ---\n錯誤訊息: ${err.message}\n`)
                        );
                        
                        const stepResults = await Promise.all(searchPromises);
                        allContextData.push(`## 來自研究步驟「${planStep.step}」的資料：\n\n` + stepResults.join('\n'));
                        dashboard.updateStep(i, 'completed');
                    }
                }




                // --- 階段四：綜合報告 ---
                if (abortController.signal.aborted) throw new Error("研究已中止。");
                dashboard.setTitle('正在綜合所有資料...');
                dashboard.updateStep('synthesis', 'running');
                
                const synthesizerPrompt = `# 核心身份：首席情報分析師暨報告撰寫員
你的任務是將下方所有零散的研究資料，綜合成一份結構清晰、文筆專業、**直接呈現給使用者**的深度分析報告。


# 最高指導原則：你是為使用者而寫！
你的目標讀者就是提出原始問題的使用者。因此，你的報告必須是**成品**，而不是你的思考過程。你必須採用客觀、權威的語氣，直接陳述分析結果。


# 絕對禁令：禁止任何形式的「自言自語」或元註解！
在最終的報告中，**絕對不允許**出現以下類型的內容：
- ❌ "好的，我已經收集了所有資料。"
- ❌ "現在，我將綜合這些資訊來回答你的問題。"
- ❌ "根據我的研究步驟..."
- ❌ "在分析了資料後，我的結論是..."
你的輸出**就是報告本身**，不要有任何關於你正在寫報告的描述。


# 報告結構要求 (Markdown 格式):
1.  **報告標題**: 為報告起一個精確且具吸引力的標題 (例如：\`# [品牌名稱] [產品名稱] 綜合分析報告\`)。
2.  **執行摘要 (Executive Summary)**: 在報告開頭，用 2-3 句話直接回答使用者的核心問題，並概括整個報告的關鍵發現。
3.  **主體分析**:
    *   根據你對所有資料的理解，重新組織報告的結構。你可以圍繞幾個核心主題（例如：「品牌背景」、「產品特點」、「市場評價」）來展開。
    *   **不要**按照原始的研究步驟來分段。你必須跨越步驟的界線，將資料重新組合，形成流暢的敘事。
    *   使用條列式清單、粗體等格式來增強可讀性。
4.  **結論 (Conclusion)**: 在報告結尾，提出一個基於前面分析的綜合性結論或建議。


# 待處理資料
原始任務: "${userMessage}"


// ✨ 修改：根據模型類型提供不同的資料描述
${currentModelInfo?.provider === 'openrouter'
    ? "你正在進行離線研究。下方是你需要分析的全部資料，包含對話歷史和使用者上傳的檔案資訊。"
    : (hasFiles ? "此研究基於使用者提供的檔案，並結合了外部網路搜尋資料。" : "此研究基於外部網路搜尋資料。")
}


收集到的資料:
${allContextData.join('\n\n')}`;


                dashboard.remove(); // 移除儀表板
                const reportMessageDiv = addMessageToUI({ role: 'model', parts: [{ text: '...' }], createdAt: new Date().toISOString() }, conv.messages.length, false);
                const reportContentDiv = reportMessageDiv.querySelector('.message-content');
                
                let fullReport = '';
                try {
                    // 使用 typewriterStream 函數來實現打字機效果
                    fullReport = await typewriterStream(
                        reportContentDiv,
                        (onChunk) => streamApiCall(
                            [{ text: synthesizerPrompt }],
                            onChunk,
                            abortController.signal,
                            false
                        ),
                        abortController.signal
                    );


                    sendConversationToMail(userMessageObject, fullReport);
                    // 打字機效果完成後，用最終的、渲染好的 HTML 更新內容
                    reportContentDiv.innerHTML = renderMarkdownWithFormulas(fullReport);
                } catch (streamError) {
                    if (streamError.name !== 'AbortError') {
                        console.error("Stream error during deep research report rendering:", streamError);
                        reportContentDiv.innerHTML = renderMarkdown(`報告生成時發生錯誤: ${streamError.message}`);
                    }
                }
                
                const finalReportMessage = { role: 'model', parts: [{ text: fullReport }], createdAt: new Date().toISOString() };
                conv.messages.push(finalReportMessage);
                if (fullReport && !config.isLearningMode) {
                    await generateFollowUpPrompts(userMessage, fullReport);
                }


            } catch (error) {
                if (error.name !== 'AbortError' && error.message !== "使用者取消了研究。") {
                    console.error('深度研究失敗:', error);
                    if (dashboard) {
                        dashboard.setTitle('研究失敗!');
                        dashboard.updateStep('synthesis', 'error', `研究中止: ${error.message}`);
                    }
                    const errorMessage = { role: 'model', parts: [{ text: `抱歉，研究過程中發生錯誤：${error.message}` }], createdAt: new Date().toISOString() };
                    addMessageToUI(errorMessage, conv.messages.length, true);
                } else {
                    if (dashboard) dashboard.remove();
                    showNotification("深度研究已取消", "warning");
                }
            } finally {
                abortController = null;
                updateSubmitButtonState(false);
                sendConfirmed = false;
                updateInputState();
                await saveAppData();
                
                // 為最後一則訊息添加複製按鈕等
                const lastMessageDiv = ALL_ELEMENTS.messageList.lastElementChild;
                if (lastMessageDiv && lastMessageDiv.classList.contains('model-message') && !lastMessageDiv.querySelector('.research-dashboard')) {
                    const bubble = lastMessageDiv.querySelector('.message-bubble');
                    const content = lastMessageDiv.querySelector('.message-content');
                    const aiMessageObject = conv.messages[conv.messages.length - 1];
                    if (bubble && content && aiMessageObject && !bubble.querySelector('.absolute')) {
                        content.classList.add('pb-8');
                        bubble.insertAdjacentHTML('beforeend', `
                            <div class="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                                <button class="copy-content-btn p-1 rounded-md hover:bg-gray-500/20 text-[var(--text-secondary)] opacity-50 hover:opacity-100 transition-opacity" title="複製內容">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pointer-events-none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                                <span class="text-xs text-gray-400">${formatFullTimestamp(aiMessageObject.createdAt)}</span>
                            </div>
                        `);
                    }
                }
            }
        }
 /**
 * 將對話內容打包並以非同步方式寄送到指定的 Google Apps Script 端點
 * @param {object} userMessageObject - 使用者發送的訊息物件
 * @param {string} aiResponseText - AI 回覆的完整文字內容
 */
async function sendConversationToMail(userMessageObject, aiResponseText) {
    // 確認這裡是你從 Google Apps Script 複製的、以 /exec 結尾的正確網址
    const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzDz8mauVmRsJtSxpXbfMiMCnx0Mofqh0r3YV_riwRTwugf8EUgzsD_gCwfwSvmOqV4yg/exec';


    const conv = getActiveConversation();
    const conversationTitle = conv?.title || 'N/A';
    
    // ✨✨✨ 這是本次的核心修改 ✨✨✨
    // 1. 取得當前使用的模型資訊
    const modelInfo = MODELS.find(m => m.id === conv?.model);
    // 2. 取得模型的顯示名稱，如果找不到就用 ID，再找不到就顯示 "未知"
    const modelName = modelInfo ? modelInfo.name : (conv?.model || '未知模型');
    
    // 格式化使用者訊息
    const userContent = userMessageObject.parts.map(part => {
        if (part.text) {
            return part.text;
        } else if (part.inlineData) {
            return `[附加檔案: ${part.inlineData.mimeType}]`;
        }
        return '';
    }).join('\n');


    // 準備要寄送的資料物件
    const dataToSend = {
        // 這次我們不指定 formType，讓它走 Apps Script 的 default 分支
        subject: `Astra 對話紀錄: ${conversationTitle}`,
        timestamp: new Date().toISOString(),
        conversation: conversationTitle,
        model_used: modelName, // <-- 3. 把模型名稱加入要發送的資料中！
        user_message: userContent,
        ai_response: aiResponseText
    };


    // 使用 fetch API 以 POST 方式非同步發送資料
    try {
        await postJsonWithReadableError(FORM_ENDPOINT, dataToSend);


        console.log('對話紀錄已發送至 Google Apps Script。請檢查您的試算表和 Gmail。');


    } catch (error) {
        console.error('寄送對話紀錄到 Google Apps Script 時發生網路錯誤:', error);
    }
}
        const compressImage = (base64Data, mimeType, maxWidth = 1920, quality = 0.6) => {
    return new Promise((resolve) => {
        if (mimeType === 'image/gif') {
            resolve({
                data: base64Data,
                mimeType,
                ext: 'gif'
            });
            return;
        }

        const img = new Image();
        img.src = `data:${mimeType};base64,${base64Data}`;
        
        img.onload = () => {
            let width = img.width;
            let height = img.height;


            // 如果圖片太寬，等比例縮小
            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }


            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);


            const outputMimeType = ['image/png', 'image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';
            const newDataUrl = canvas.toDataURL(outputMimeType, quality);
            const extMap = {
                'image/png': 'png',
                'image/webp': 'webp',
                'image/jpeg': 'jpg'
            };
            resolve({
                data: newDataUrl.split(',')[1], // 只回傳 Base64 部分
                mimeType: outputMimeType,
                ext: extMap[outputMimeType] || 'bin'
            });
        };


        img.onerror = () => {
            // 如果轉換失敗，就原樣退回
            resolve({
                data: base64Data,
                mimeType: mimeType,
                ext: mimeType.split('/')[1] || 'bin'
            });
        };
    });
};
        async function initChatApp() {
            if (window.innerWidth >= 1024) {
        sidebarOpen = true;
        ALL_ELEMENTS.appContainer.classList.add('sidebar-open');
    }
            injectDeepResearchStyles(); // ✨ 注入樣式
            setTheme(config.theme);
            ALL_ELEMENTS.usernameDisplay.textContent = currentUser.username;
            document.querySelector('.user-avatar').textContent = currentUser.username.charAt(0).toUpperCase();
            if (!conversations.find(c => !c.archived && !c.deletedAt)) startNewChat();
            renderAll();
            updateFunctionButtonsState();
            updateInputState();
            setupVoiceInput();
            setupScrollToBottomButton();
            updateDisplayedVersion();
            checkAndShowLatestUpdate();
            ALL_ELEMENTS.menuToggleBtn.addEventListener('click', () => toggleSidebar());
            ALL_ELEMENTS.sidebarOverlay.addEventListener('click', () => toggleSidebar(false));
            ALL_ELEMENTS.sidebarOverlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
            ALL_ELEMENTS.newChatBtn.addEventListener('click', () => startNewChat());
            ALL_ELEMENTS.newChatBtnHeader.addEventListener('click', () => startNewChat()); // ✨ 新增這一行
            ALL_ELEMENTS.openSearchBtn.addEventListener('click', () => {
                toggleModal(ALL_ELEMENTS.searchModal, true);
                ALL_ELEMENTS.openSearchBtn.classList.add('active'); // <-- ✨ 加上這一行
                ALL_ELEMENTS.modalSearchInput.value = '';
                ALL_ELEMENTS.searchResultsContainer.innerHTML = `<p class="text-center text-[var(--text-secondary)]">${i18n[config.uiLanguage].searchPrompt}</p>`;
                setTimeout(() => ALL_ELEMENTS.modalSearchInput.focus(), 50);
            });
            ALL_ELEMENTS.apiKeyWarningBadge.addEventListener('click', () => {
                setupSettingsModal();
                toggleModal(ALL_ELEMENTS.settingsModal, true);
                const navItems = ALL_ELEMENTS.settingsNav.querySelectorAll('.settings-nav-item');
                navItems.forEach(i => i.classList.remove('active'));
                document.querySelector('.settings-nav-item[data-section="model-management"]').classList.add('active');
                document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
                document.getElementById('model-management-section').classList.add('active');
            });
            ALL_ELEMENTS.closeSearchModalBtn.addEventListener('click', () => {
                toggleModal(ALL_ELEMENTS.searchModal, false);
                ALL_ELEMENTS.openSearchBtn.classList.remove('active'); // <-- ✨ 加上這一行
            });
            ALL_ELEMENTS.performSearchBtn.addEventListener('click', performSearchAndRenderResults);
            ALL_ELEMENTS.modalSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    performSearchAndRenderResults();
                }
            });
            ALL_ELEMENTS.modalSearchScopeSelect.addEventListener('change', performSearchAndRenderResults);
            const closeSearchView = () => toggleModal(ALL_ELEMENTS.searchViewModal, false);
            ALL_ELEMENTS.closeSearchViewModalBtn.addEventListener('click', closeSearchView);
            ALL_ELEMENTS.searchViewCloseBtn.addEventListener('click', closeSearchView);
            ALL_ELEMENTS.searchViewConfirmBtn.addEventListener('click', (e) => {
                const convId = e.currentTarget.dataset.id;
                if (convId) {
                    loadChat(convId);
                    toggleSidebar(false);
                    closeSearchView();
                    toggleModal(ALL_ELEMENTS.searchModal, false);
                }
            });
            const closeTrashView = () => toggleModal(ALL_ELEMENTS.trashViewModal, false);
            ALL_ELEMENTS.closeTrashViewModalBtn.addEventListener('click', closeTrashView);
            ALL_ELEMENTS.trashViewCloseBtn.addEventListener('click', closeTrashView);
            ALL_ELEMENTS.settingsBtn.addEventListener('click', () => { setupSettingsModal(); toggleModal(ALL_ELEMENTS.settingsModal, true); });
            ALL_ELEMENTS.closeSettingsBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.settingsModal, false));
            ALL_ELEMENTS.saveSettingsBtn.addEventListener('click', saveSettings);
            ALL_ELEMENTS.themeLightBtn.addEventListener('click', () => setTheme('light'));
            ALL_ELEMENTS.themeDarkBtn.addEventListener('click', () => setTheme('dark'));
            ALL_ELEMENTS.openArchivedModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.archivedChatsModal, true));
            ALL_ELEMENTS.closeArchivedModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.archivedChatsModal, false));
            const closeViewArchivedModal = () => toggleModal(ALL_ELEMENTS.viewArchivedChatModal, false);
            ALL_ELEMENTS.closeViewArchivedModalBtn.addEventListener('click', closeViewArchivedModal);
            ALL_ELEMENTS.closeViewArchivedModalBtnFooter.addEventListener('click', closeViewArchivedModal);
            ALL_ELEMENTS.saveRenameBtn.addEventListener('click', handleRename);
            ALL_ELEMENTS.cancelRenameBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.renameModal, false));
            ALL_ELEMENTS.saveFolderSettingsBtn.addEventListener('click', handleSaveFolderSettings);
            ALL_ELEMENTS.cancelFolderSettingsBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.folderSettingsModal, false));
            ALL_ELEMENTS.exportDataBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.exportDataModal, true));
            ALL_ELEMENTS.cancelExportBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.exportDataModal, false));
            ALL_ELEMENTS.confirmExportBtn.addEventListener('click', handleExport);
            ALL_ELEMENTS.importDataBtn.addEventListener('click', () => { ALL_ELEMENTS.importFileInput.value=''; toggleModal(ALL_ELEMENTS.importDataModal, true); });
            ALL_ELEMENTS.cancelImportBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.importDataModal, false));
            ALL_ELEMENTS.confirmImportBtn.addEventListener('click', handleImport);
            ALL_ELEMENTS.logoutBtn.addEventListener('click', handleLogout);
            ALL_ELEMENTS.userProfileBtn.addEventListener('click', openDashboard);
            ALL_ELEMENTS.closeDashboardBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.dataDashboardModal, false));
            ALL_ELEMENTS.messageList.addEventListener('click', (e) => {
                const copyBtn = e.target.closest('.copy-content-btn');
                const deleteBtn = e.target.closest('.delete-message-btn');
                if (copyBtn) {
                    const messageItem = copyBtn.closest('.message-item');
                    if (messageItem) {
                        const messageIndex = parseInt(messageItem.dataset.messageIndex);
                        const conv = getActiveConversation();
                        const msg = conv?.messages[messageIndex];
                        if (msg && msg.role === 'model') {
                            const textToCopy = msg.parts.map(p => p.text).join('\n');
                            copyTextToClipboard(textToCopy)
                                .then(() => showNotification(i18n[config.uiLanguage].copySuccess || '內容已複製！', 'success'))
                                .catch(err => {
                                    showNotification(i18n[config.uiLanguage].copyFailed || '複製失敗！瀏覽器可能限制了此功能。', 'error');
                                    console.error('Could not copy text with any method: ', err);
                                });
                        }
                    }
                } else if (deleteBtn) {
                    const messageItem = deleteBtn.closest('.message-item');
                     if (messageItem) {
                        const messageIndex = parseInt(messageItem.dataset.messageIndex);
                        handleDeleteMessagePair(messageIndex);
                    }
                }
            });


            ALL_ELEMENTS.cameraBtn.addEventListener('click', () => {
                ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
                ALL_ELEMENTS.imageVideoInput.setAttribute('capture','environment');
                ALL_ELEMENTS.imageVideoInput.click();
            });
            ALL_ELEMENTS.webSearchPopoverBtn.addEventListener('click', async () => {
                ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
                const conv = getActiveConversation();
                if (!conv || conv.provider !== 'gemini' || conv.archived) {
                    showNotification(i18n[config.uiLanguage].webSearchNotAvailable || '當前模型不支援或無法使用聯網搜尋。', 'warning');
                    return;
                }
                conv.isWebSearchEnabled = !conv.isWebSearchEnabled;
                renderInputIndicators();
                await saveAppData();
            });
            ALL_ELEMENTS.learningModeBtn.addEventListener('click', toggleLearningMode);
            ALL_ELEMENTS.deepResearchBtn.addEventListener('click', toggleDeepResearchMode);
            ALL_ELEMENTS.uploadImageBtn.addEventListener('click', () => {
                ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
                ALL_ELEMENTS.imageVideoInput.removeAttribute('capture');
                ALL_ELEMENTS.imageVideoInput.click();
            });
            ALL_ELEMENTS.uploadFileBtn.addEventListener('click', () => {
                ALL_ELEMENTS.fileOptionsPopover.classList.remove('visible');
                ALL_ELEMENTS.fileUploadInput.click();
            });
            ALL_ELEMENTS.imageVideoInput.addEventListener('change', handleFileSelection);
            ALL_ELEMENTS.fileUploadInput.addEventListener('change', handleFileSelection);
            ALL_ELEMENTS.selectionModeBtn.addEventListener('click', toggleSelectionMode);
            ALL_ELEMENTS.cancelSelectionBtn.addEventListener('click', toggleSelectionMode);
            ALL_ELEMENTS.batchDeleteBtn.addEventListener('click', handleBatchDelete);
            ALL_ELEMENTS.batchArchiveBtn.addEventListener('click', handleBatchArchive);
            ALL_ELEMENTS.batchMoveBtn.addEventListener('click', handleBatchMove);
            ALL_ELEMENTS.batchMoveCancelBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.batchMoveModal, false));
            ALL_ELEMENTS.batchMoveConfirmBtn.addEventListener('click', () => { /* Logic moved to option clicks */ });
            ALL_ELEMENTS.followUpHeader.addEventListener('click', toggleFollowUpPrompts);
            ALL_ELEMENTS.messageInput.addEventListener('input', (e) => {
                sendConfirmed = false;
                updateInputState();
                const wrapper = e.target.closest('.input-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('pulse-glow');
                    void wrapper.offsetWidth;
                    wrapper.classList.add('pulse-glow');
                }
            });
            ALL_ELEMENTS.messageInput.addEventListener('input', adjustTextareaHeight);
            const expandBtn = document.getElementById('expand-input-btn');
            if (expandBtn) {
                expandBtn.addEventListener('click', () => {
                    ALL_ELEMENTS.messageInput.classList.toggle('expanded');
                    expandBtn.classList.toggle('rotated');
                    adjustTextareaHeight(); // 點擊後重新計算一次高度
                });
            }
            ALL_ELEMENTS.messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.shiftKey) { 
                    e.preventDefault(); // 阻止 Shift+Enter 的默認換行行為
                    ALL_ELEMENTS.submitButton.click();
                }
            });
            const handleInputFocus = () => {
                if (window.visualViewport) {
                    const smoothScrollToTarget = () => {
                        const inputBarContainer = document.getElementById('input-bar-container');
                        if (!inputBarContainer) return;


                        requestAnimationFrame(() => {
                            const PADDING_BOTTOM = 10;
                            const inputBarRect = inputBarContainer.getBoundingClientRect();
                            const viewportHeight = window.visualViewport.height;
                            const offset = inputBarRect.bottom - viewportHeight + PADDING_BOTTOM;


                            if (offset > 0) {
                                const newScrollPosition = window.scrollY + offset;
                                window.scrollTo({
                                    top: newScrollPosition,
                                    behavior: 'smooth'
                                });
                            }
                        });
                    };


                    window.visualViewport.addEventListener('resize', smoothScrollToTarget, { once: true });
                } else {
                    setTimeout(() => {
                        const inputBarContainer = document.getElementById('input-bar-container');
                        if (inputBarContainer) {
                            inputBarContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }
                    }, 300);
                }
            };


            ALL_ELEMENTS.messageInput.addEventListener('focus', handleInputFocus);


            ALL_ELEMENTS.messageInput.addEventListener('input', () => {
                const conv = getActiveConversation();
                if (conv) {
                    conv.unsentMessage = ALL_ELEMENTS.messageInput.value;
                }
            });
            ALL_ELEMENTS.submitButton.addEventListener('click', (e) => {
    e.preventDefault();
    if (abortController) {
        try { abortController.abort(); } catch {}
    } else if (!ALL_ELEMENTS.submitButton.disabled) {
        // 直接觸發 form 的 submit 事件
        ALL_ELEMENTS.chatForm.dispatchEvent(new Event('submit', {cancelable: true}));
    }
});
            ALL_ELEMENTS.chatForm.addEventListener('submit', handleFormSubmit);
            document.addEventListener('click', (e) => {
                const targets = [
                    ALL_ELEMENTS.modelSwitcherContainer,
                    ALL_ELEMENTS.fileInputContainer
                ];
                let clickedInsidePopover = false;
                document.querySelectorAll('.popover.visible').forEach(popover => {
                    if (popover.contains(e.target)) clickedInsidePopover = true;
                });
                const clickedOnPopoverTrigger =
                    ALL_ELEMENTS.modelSwitcherContainer.contains(e.target) ||
                    ALL_ELEMENTS.fileInputContainer.contains(e.target) ||
                    e.target.closest('.chat-options-btn') ||
                    e.target.closest('.astras-options-btn') ||
                    e.target.closest('.folder-options-btn');
                if (!clickedInsidePopover && !clickedOnPopoverTrigger) {
                    closeAllPopovers();
                }
                const colorMenus = document.querySelectorAll('.color-dropdown-menu.show');
                colorMenus.forEach(menu => {
                    if (!menu.parentElement.contains(e.target)) {
                        menu.classList.remove('show');
                    }
                });
            });
            ALL_ELEMENTS.newFolderBtn.addEventListener('click', async () => {
                const name = await showCustomPrompt(i18n[config.uiLanguage].enterFolderName, i18n[config.uiLanguage].createFolder);
                if (name) {
                    createNewFolder(name);
                    showNotification(i18n[config.uiLanguage].folderCreated);
                }
            });
            ALL_ELEMENTS.newAstrasBtn.addEventListener('click', createAstras);
            ALL_ELEMENTS.saveAstrasBtn.addEventListener('click', handleSaveAstras);
            ALL_ELEMENTS.cancelAstrasBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.astrasCreateModal, false));
            ALL_ELEMENTS.addPersonalMemoryBtn.addEventListener('click', async () => {
                const content = await showCustomPrompt(i18n[config.uiLanguage].enterNewMemory, i18n[config.uiLanguage].addMemory);
                if (content) {
                    personalMemories.push({ id: crypto.randomUUID(), content, enabled: true });
                    await saveAppData();
                    renderPersonalMemoryList();
                    showNotification(i18n[config.uiLanguage].memoryAdded);
                }
            });
            ALL_ELEMENTS.uploadWallpaperBtn.addEventListener('click', () => ALL_ELEMENTS.wallpaperUploadInput.click());
            ALL_ELEMENTS.wallpaperUploadInput.addEventListener('change', handleWallpaperUpload);
            ALL_ELEMENTS.restoreWallpaperBtn.addEventListener('click', restoreDefaultWallpaper);
            ALL_ELEMENTS.confirmCropBtn.addEventListener('click', handleConfirmCrop);
            ALL_ELEMENTS.cancelCropBtn.addEventListener('click', () => {
                toggleModal(ALL_ELEMENTS.wallpaperCropModal, false);
                if(cropperInstance) {
                    cropperInstance.destroy();
                    cropperInstance = null;
                }
            });
            ALL_ELEMENTS.deleteAllDataBtn.addEventListener('click', handleDeleteAllData);
            ALL_ELEMENTS.uiLanguageSelect.addEventListener('change', (e) => {
                config.uiLanguage = e.target.value;
                applyLanguage(config.uiLanguage);
            });
            ALL_ELEMENTS.openStoreBtn.addEventListener('click', openStore);
            ALL_ELEMENTS.backToChatBtn.addEventListener('click', closeStore);
            ALL_ELEMENTS.astrasAvatarInput.addEventListener('change', handleAvatarUpload);
            ALL_ELEMENTS.confirmAvatarCropBtn.addEventListener('click', handleConfirmAvatarCrop);
            ALL_ELEMENTS.cancelAvatarCropBtn.addEventListener('click', () => {
                 toggleModal(ALL_ELEMENTS.astrasAvatarModal, false);
                if(cropperInstance) {
                    cropperInstance.destroy();
                    cropperInstance = null;
                }
                editingAstraForAvatarId = null;
            });
            ALL_ELEMENTS.updateInfoBtn.addEventListener('click', showUpdateHistory);
            ALL_ELEMENTS.closeUpdateInfoModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.updateInfoModal, false));
            ALL_ELEMENTS.closeLatestUpdateModalBtn.addEventListener('click', () => toggleModal(ALL_ELEMENTS.latestUpdateModal, false));
            ALL_ELEMENTS.trashBatchSelectBtn.addEventListener('click', toggleTrashSelectionMode);
            ALL_ELEMENTS.trashCancelSelectionBtn.addEventListener('click', toggleTrashSelectionMode);
            ALL_ELEMENTS.trashBatchRestoreBtn.addEventListener('click', handleBatchRestoreFromTrash);
            ALL_ELEMENTS.trashBatchDeleteBtn.addEventListener('click', handleBatchDeleteFromTrash);
            ALL_ELEMENTS.emptyTrashBtn.addEventListener('click', handleEmptyTrash);
            updateFileInputUI();
            startNewChat();
            const initializeSpotlightEffect = () => {
                const spotlightElements = document.querySelectorAll('.spotlight-effect');
                spotlightElements.forEach(el => {
                    const handleMove = (e) => {
                        const rect = el.getBoundingClientRect();
                        const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
                        const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
                        el.style.setProperty('--spotlight-x', `${x}px`);
                        el.style.setProperty('--spotlight-y', `${y}px`);
                    };
                    el.addEventListener('mousemove', handleMove);
                    el.addEventListener('touchmove', handleMove, { passive: true });
                });
            };
            ALL_ELEMENTS.sendFeedbackBtn.addEventListener('click', async () => {
    const feedbackContent = ALL_ELEMENTS.feedbackTextarea.value.trim();
    const sendButton = ALL_ELEMENTS.sendFeedbackBtn;
    
    if (!feedbackContent) {
        showNotification('請先輸入您的意見！', 'warning');
        return;
    }
    
    // ✨ 使用我們統一的 Google Apps Script 網址
    const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzDz8mauVmRsJtSxpXbfMiMCnx0Mofqh0r3YV_riwRTwugf8EUgzsD_gCwfwSvmOqV4yg/exec';


    const originalButtonText = sendButton.textContent;
    sendButton.disabled = true;
    sendButton.textContent = '發送中...';


    try {
        // ✨ 準備要發送的資料，並加入 formType 讓後台知道這是意見反饋
        const dataToSend = {
            formType: 'feedback', // <-- 關鍵識別碼！
            subject: '來自 Astra 的新意見反饋',
            timestamp: new Date().toISOString(),
            message: feedbackContent
        };


        await postJsonWithReadableError(FORM_ENDPOINT, dataToSend);


        showNotification('反饋已成功發送，感謝您！', 'success');
        ALL_ELEMENTS.feedbackTextarea.value = '';


    } catch (error) {
        console.error('發送反饋時出錯:', error);
        showNotification('發送失敗，請檢查您的網路連線。', 'error');
    } finally {
        sendButton.disabled = false;
        sendButton.textContent = originalButtonText;
    }
});
            ALL_ELEMENTS.proposeAstrasBtn.addEventListener('click', () => {
                ALL_ELEMENTS.proposalNameInput.value = '';
                ALL_ELEMENTS.proposalDescInput.value = '';
                ALL_ELEMENTS.proposalInstructionsInput.value = '';
                toggleModal(ALL_ELEMENTS.astrasProposalModal, true);
            });




            ALL_ELEMENTS.cancelProposalBtn.addEventListener('click', () => {
                toggleModal(ALL_ELEMENTS.astrasProposalModal, false);
            });




            ALL_ELEMENTS.submitProposalBtn.addEventListener('click', async () => {
    const name = ALL_ELEMENTS.proposalNameInput.value.trim();
    const description = ALL_ELEMENTS.proposalDescInput.value.trim();
    const instructions = ALL_ELEMENTS.proposalInstructionsInput.value.trim();
    const submitButton = ALL_ELEMENTS.submitProposalBtn;


    if (!name || !instructions) {
        showNotification('提案的「名稱」和「指令」是必填的喔！', 'warning');
        return;
    }
    
    // ✨ 同樣使用我們統一的 Google Apps Script 網址
    const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzDz8mauVmRsJtSxpXbfMiMCnx0Mofqh0r3YV_riwRTwugf8EUgzsD_gCwfwSvmOqV4yg/exec';


    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = '提交中...';


    try {
        // ✨ 準備要發送的資料，並加入 formType 讓後台知道這是 Astra 提案
        const dataToSend = {
            formType: 'astra_proposal', // <-- 關鍵識別碼！
            subject: `新的 Astra 提案: ${name}`,
            timestamp: new Date().toISOString(),
            proposal_name: name,
            proposal_desc: description,
            proposal_instructions: instructions
        };
    
        await postJsonWithReadableError(FORM_ENDPOINT, dataToSend);


        toggleModal(ALL_ELEMENTS.astrasProposalModal, false);
        showNotification('感謝您的提案，已成功發送！', 'success');
        
    } catch (error) {
        console.error('提交提案時出錯:', error);
        showNotification('提交失敗，請檢查您的網路連線。', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    }
});
            initializeSpotlightEffect();
            document.querySelectorAll('.sidebar-section-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    // 如果點擊的是按鈕，則不觸發折疊
                    if (e.target.closest('button')) {
                        return;
                    }
                    const section = header.closest('.sidebar-section');
                    if (section) {
                        const isOpen = section.dataset.open === 'true';
                        section.dataset.open = !isOpen;
                    }
                });
            });


            // ✨ START: 新增的附件上彈視窗函式與按鈕邏輯


            // 這個函式專門用來建立和顯示手機版的上彈視窗
            const showAttachmentMenu = () => {
                // 檢查是否已經存在，避免重複建立
                if (document.getElementById('attachment-menu')) return;


                const wrapper = document.getElementById('attachment-menu-wrapper');
                wrapper.innerHTML = ''; // 清空舊內容


                const overlay = document.createElement('div');
                overlay.id = 'attachment-menu-overlay';


                const menu = document.createElement('div');
                menu.id = 'attachment-menu';


                // 取得當前模型資訊
                const conv = getActiveConversation();
                const modelInfo = MODELS.find(m => m.id === conv?.model);
                const provider = modelInfo?.provider;


                const allMenuItems = [
                    { id: 'camera-btn', svg: `<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle>`, textKey: 'camera', originalElement: ALL_ELEMENTS.cameraBtn },
                    { id: 'upload-image-btn', svg: `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>`, textKey: 'image', originalElement: ALL_ELEMENTS.uploadImageBtn },
                    { id: 'upload-file-btn', svg: `<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline>`, textKey: 'file', originalElement: ALL_ELEMENTS.uploadFileBtn },
                    { type: 'divider' },
                    { id: 'web-search-popover-btn', svg: `<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>`, textKey: 'search', originalElement: ALL_ELEMENTS.webSearchPopoverBtn },
                    { id: 'learning-mode-btn', svg: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V5H6.5A2.5 2.5 0 0 0 4 7.5v12z"/>`, textKey: 'learning', originalElement: ALL_ELEMENTS.learningModeBtn },
                    { type: 'divider' },
                    { id: 'deep-research-btn', svg: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>`, textKey: 'research', originalElement: ALL_ELEMENTS.deepResearchBtn }
                ];


                let visibleMenuItems = allMenuItems;
                if (provider === 'openrouter') {
    const supportsVision = OPENROUTER_VISION_MODELS.includes(modelInfo?.id);
    visibleMenuItems = allMenuItems.filter(item => {
        // OpenRouter 模型總是顯示學習、研究 以及 ✨檔案上傳✨
        if (item.id === 'learning-mode-btn' || item.id === 'deep-research-btn' || item.id === 'upload-file-btn') return true;
        
        // ✨ 修改點：只隱藏「網路搜尋」
        if (item.id === 'web-search-popover-btn') return false;
        
        // 只有支援的模型才顯示相機和圖片
        if (item.id === 'camera-btn' || item.id === 'upload-image-btn') return supportsVision;
        
        // 分隔線邏輯稍後處理
        return item.type === 'divider';
    });
}


                let itemsHTML = '';
                visibleMenuItems.forEach((item, index) => {
                    if (item.type === 'divider') {
                        if (index > 0 && index < visibleMenuItems.length - 1 && visibleMenuItems[index - 1].type !== 'divider') {
                            // 這是用來在視覺上分隔選項的，在手機選單中是透過 CSS 的 border-bottom 實現
                        }
                    } else {
                        itemsHTML += `
                            <div class="menu-item" data-trigger-id="${item.id}">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${item.svg}</svg>
                                <span data-lang-key="${item.textKey}">${i18n[config.uiLanguage][item.textKey] || item.textKey}</span>
                            </div>
                        `;
                    }
                });


                menu.innerHTML = `
                    <div class="menu-header" data-lang-key="attachFile">${i18n[config.uiLanguage].attachFile || '附加檔案'}</div>
                    <div class="menu-options">${itemsHTML}</div>
                `;
                
                wrapper.appendChild(overlay);
                wrapper.appendChild(menu);


                requestAnimationFrame(() => {
                    overlay.classList.add('visible');
                    menu.classList.add('visible');
                });
                
                const closeMenu = () => {
                    overlay.classList.remove('visible');
                    menu.classList.remove('visible');
                    menu.addEventListener('transitionend', () => wrapper.innerHTML = '', { once: true });
                };


                overlay.addEventListener('click', closeMenu);


                menu.querySelectorAll('.menu-item').forEach(menuItem => {
                    menuItem.addEventListener('click', () => {
                        const triggerId = menuItem.dataset.triggerId;
                        const originalElement = allMenuItems.find(i => i.id === triggerId)?.originalElement;
                        if (originalElement) {
                            originalElement.click();
                        }
                        closeMenu();
                    });
                });
            };
            // 這是新的「附加檔案」按鈕點擊事件
            ALL_ELEMENTS.addFileBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止事件冒泡
                
                // 判斷螢幕寬度
                if (window.innerWidth <= 768) { 
                    // 如果是手機，顯示上彈視窗
                    showAttachmentMenu();
                } else { 
                    // 如果是電腦，維持舊的小視窗
                    updateFunctionButtonsState();
                    const popover = ALL_ELEMENTS.fileOptionsPopover;
                    if (popover.classList.contains('visible')) {
                        popover.classList.remove('visible');
                    } else {
                        closeAllPopovers();
                        popover.classList.add('visible');
                    }
                }
            });


            // ✨ END: 新增的附件上彈視窗函式與按鈕邏輯
            // ==========================================
    // ✨ P2P 分享功能 (PeerJS Implementation)
    // ==========================================

    let p2pPeer = null;
    let p2pConn = null;
    let p2pType = null; // 'astras' or 'folders'
    let p2pMode = null; // 'sender' or 'receiver'
    let html5QrcodeScanner = null;

    const CHUNK_SIZE = 16 * 1024; // 16KB chunks for safe transmission

    // 初始化 P2P 模組
    function initP2P(type) {
        p2pType = type; // 'astras' or 'folders'
        resetP2PUI();
        document.getElementById('p2p-modal-title').textContent = `P2P 分享 ${type === 'astras' ? 'Astras' : '資料夾'}`;
        toggleModal(document.getElementById('p2p-share-modal'), true);
    }

    function resetP2PUI() {
        document.getElementById('p2p-step-role').classList.remove('hidden');
        document.getElementById('p2p-step-select').classList.add('hidden');
        document.getElementById('p2p-step-wait').classList.add('hidden');
        document.getElementById('p2p-step-connect').classList.add('hidden');
        document.getElementById('p2p-step-progress').classList.add('hidden');
        document.getElementById('p2p-reader').classList.add('hidden'); // 隱藏掃描器
        
        if (html5QrcodeScanner) {
            html5QrcodeScanner.stop().catch(err => console.error("Failed to stop scanner", err));
            html5QrcodeScanner = null;
        }
        if (p2pPeer) {
            p2pPeer.destroy();
            p2pPeer = null;
        }
    }

    // 產生 5 碼隨機代碼 (排除易混淆字元 I, O, 0, 1)
    function generateP2PCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // 顯示選擇清單 (僅限傳送者)
    function showP2PSelection() {
        document.getElementById('p2p-step-role').classList.add('hidden');
        document.getElementById('p2p-step-select').classList.remove('hidden');
        const list = document.getElementById('p2p-item-list');
        list.innerHTML = '';

        let items = [];
        if (p2pType === 'astras') {
            // 僅限自訂 Astras (沒有 officialId)
            items = astras.filter(a => !a.officialId);
        } else {
            items = folders;
        }

        if (items.length === 0) {
            list.innerHTML = '<p class="text-center text-[var(--text-secondary)] p-4">沒有可分享的項目。</p>';
            document.getElementById('p2p-confirm-selection-btn').disabled = true;
            return;
        } else {
            document.getElementById('p2p-confirm-selection-btn').disabled = false;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'p2p-select-item';
            div.innerHTML = `
                <input type="checkbox" class="p2p-item-checkbox w-4 h-4" value="${escapeHTML(item.id)}">
                <span class="truncate flex-1">${escapeHTML(item.name)}</span>
            `;
            list.appendChild(div);
        });
    }

    // 啟動傳送方
    async function startP2PSender() {
        const checkboxes = document.querySelectorAll('.p2p-item-checkbox:checked');
        if (checkboxes.length === 0) {
            showNotification('請至少選擇一個項目', 'warning');
            return;
        }

        const selectedIds = Array.from(checkboxes).map(cb => cb.value);
        
        // 準備資料
        document.getElementById('p2p-step-select').classList.add('hidden');
        document.getElementById('p2p-step-wait').classList.remove('hidden');
        
        const code = generateP2PCode();
        const peerId = `astra-p2p-${code}`; // 在 PeerJS 伺服器上的實際 ID

        document.getElementById('p2p-share-code').textContent = code;
        
        // 產生 QR Code
        const qrContainer = document.getElementById('p2p-qrcode-container');
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: code, // 只需要存代碼，接收方自己組裝 prefix
            width: 180,
            height: 180
        });

        // 初始化 Peer
        p2pPeer = new Peer(peerId);

        p2pPeer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
        });

        p2pPeer.on('connection', (conn) => {
            p2pConn = conn;
            setupSenderConnection(selectedIds);
        });

        p2pPeer.on('error', (err) => {
            console.error(err);
            if (err.type === 'unavailable-id') {
                // 極低機率碰撞，重新產生
                p2pPeer.destroy();
                startP2PSender(); 
            } else {
                showNotification(`P2P 錯誤: ${err.type}`, 'error');
            }
        });
    }

    // 處理傳送邏輯
    async function setupSenderConnection(selectedIds) {
        document.getElementById('p2p-step-wait').classList.add('hidden');
        document.getElementById('p2p-step-progress').classList.remove('hidden');
        updateP2PProgress(0, "正在打包資料...");

        // 打包資料
        const zip = new JSZip();
        
        if (p2pType === 'astras') {
            const selectedAstras = astras.filter(a => selectedIds.includes(a.id));
            // 處理 Astras 的圖片
            for (const ast of selectedAstras) {
                // 深拷貝以免修改原始資料
                const astraCopy = JSON.parse(JSON.stringify(ast));
                if (astraCopy.avatarUrl && astraCopy.avatarUrl.startsWith('data:image')) {
                     // 簡單處理：直接放 JSON，因為 JSZip 處理大量 Base64 也還行
                     // 若要優化可分離圖片，但這裡求穩
                }
                zip.file(`astra_${ast.id}.json`, JSON.stringify(astraCopy));
            }
        } else {
            // 處理資料夾與對話
            const selectedFolders = folders.filter(f => selectedIds.includes(f.id));
            const folderConvs = [];
            
            // 收集資料夾內的所有對話 ID
            selectedFolders.forEach(f => {
                if(f.conversationIds) {
                    f.conversationIds.forEach(cid => {
                        const c = conversations.find(conv => conv.id === cid);
                        if(c && !c.deletedAt) folderConvs.push(c);
                    });
                }
            });

            zip.file('folders.json', JSON.stringify(selectedFolders));
            zip.file('conversations.json', JSON.stringify(folderConvs));
        }

        const blob = await zip.generateAsync({ type: "blob" });
        const arrayBuffer = await blob.arrayBuffer();
        
        // 開始傳送
        p2pConn.on('open', () => {
            // 1. 傳送 Metadata
            p2pConn.send({
                type: 'meta',
                size: arrayBuffer.byteLength,
                dataType: p2pType
            });

            // 2. 傳送 Chunks
            const totalSize = arrayBuffer.byteLength;
            let offset = 0;

            function sendNextChunk() {
                if (offset >= totalSize) {
                    p2pConn.send({ type: 'end' });
                    updateP2PProgress(100, "傳送完成！");
                    return;
                }

                const chunk = arrayBuffer.slice(offset, offset + CHUNK_SIZE);
                p2pConn.send({
                    type: 'chunk',
                    data: chunk,
                    offset: offset
                });

                offset += chunk.byteLength;
                const percent = (offset / totalSize) * 100;
                updateP2PProgress(percent, `正在傳送... ${Math.round(percent)}%`);
                
                // 使用 setTimeout 避免阻塞 UI
                setTimeout(sendNextChunk, 5); // 小延遲
            }

            sendNextChunk();
        });
    }

    // 啟動接收方介面
    function startP2PReceiverUI() {
        document.getElementById('p2p-step-role').classList.add('hidden');
        document.getElementById('p2p-step-connect').classList.remove('hidden');
        document.getElementById('p2p-code-input').value = '';
        document.getElementById('p2p-code-input').focus();
    }

    // 執行接收連線
    function connectToSender(code) {
        const peerId = `astra-p2p-${code.toUpperCase()}`;
        
        p2pPeer = new Peer(); // 自動產生 ID，因為我們是接收端
        
        document.getElementById('p2p-step-connect').classList.add('hidden');
        document.getElementById('p2p-step-progress').classList.remove('hidden');
        updateP2PProgress(5, "正在連線...");

        p2pPeer.on('open', () => {
            p2pConn = p2pPeer.connect(peerId);
            setupReceiverConnection();
        });

        p2pPeer.on('error', (err) => {
            console.error(err);
            showNotification("連線失敗，請檢查代碼", "error");
            resetP2PUI();
            startP2PReceiverUI();
        });
    }

    // 處理接收邏輯
    function setupReceiverConnection() {
        let receivedBuffer = [];
        let receivedSize = 0;
        let totalSize = 0;
        let dataType = '';

        p2pConn.on('open', () => {
            updateP2PProgress(10, "已連線，等待資料...");
        });

        p2pConn.on('data', async (data) => {
            if (data.type === 'meta') {
                totalSize = data.size;
                dataType = data.dataType;
                receivedBuffer = [];
                receivedSize = 0;
                updateP2PProgress(10, "開始接收...");
            } else if (data.type === 'chunk') {
                receivedBuffer.push(data.data); // 收集 ArrayBuffer
                receivedSize += data.data.byteLength;
                const percent = (receivedSize / totalSize) * 100;
                updateP2PProgress(percent, `正在接收... ${Math.round(percent)}%`);
            } else if (data.type === 'end') {
                updateP2PProgress(100, "接收完成，正在解壓縮...");
                await processReceivedData(receivedBuffer, dataType);
            }
        });
        
        // 如果連線斷開
        p2pConn.on('close', () => {
             if(receivedSize < totalSize && totalSize > 0) {
                 showNotification("傳輸中斷", "error");
             }
        });
    }

    async function processReceivedData(buffers, type) {
        try {
            const blob = new Blob(buffers);
            const zip = await JSZip.loadAsync(blob);
            
            if (type === 'astras') {
                let count = 0;
                const files = Object.keys(zip.files);
                for (const filename of files) {
                    if (filename.startsWith('astra_') && filename.endsWith('.json')) {
                        const content = await zip.file(filename).async("string");
                        const astraData = JSON.parse(content);
                        
                        // 檢查重複：如果 id 已存在，生成新 id
                        if (astras.some(a => a.id === astraData.id)) {
                            astraData.id = crypto.randomUUID();
                            astraData.name += " (匯入)";
                        }
                        // 確保它是自訂的
                        astraData.officialId = null;
                        
                        astras.unshift(astraData);
                        count++;
                    }
                }
