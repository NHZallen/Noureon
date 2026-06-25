        import { createLegacyAppBootstrapLifecycle } from '/src/app/runtime/features/app-bootstrap-lifecycle.js';
        const resolveEventsUpdateInputState = (...args) => legacyRuntimeContext.resolveBinding('input.updateInputState')(...args);
        const resolveEventsSetupSettingsModal = (...args) => legacyRuntimeContext.resolveBinding('settings.setupSettingsModal')(...args);
async function sendConversationToMail(userMessageObject, aiResponseText) {
    // 確認這裡是你從 Google Apps Script 複製的、以 /exec 結尾的正確網址
    const FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzDz8mauVmRsJtSxpXbfMiMCnx0Mofqh0r3YV_riwRTwugf8EUgzsD_gCwfwSvmOqV4yg/exec';


    const conv = getActiveConversation();
    const conversationTitle = conv?.title || 'N/A';
    
    // ✨✨✨ 這是本次的核心修改 ✨✨✨
    // 1. 取得當前使用的模型資訊
    const modelInfo = MODELS.find(m => m.id === conv?.model);
    // 2. 取得模型的顯示名稱，如果找不到就用 ID，再找不到就顯示 "未知"
    const modelName = isCouncilEnabled(conv) ? getCouncilTexts().title : (modelInfo ? modelInfo.name : (conv?.model || '未知模型'));
    
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
        const appBootstrapLifecycle = createLegacyAppBootstrapLifecycle({
            window,
            document,
            elements: ALL_ELEMENTS,
            Peer,
            QRCode,
            Html5Qrcode,
            JSZip,
            BlobCtor: Blob,
            getCurrentUser: () => currentUser,
            getConfig: () => config,
            getConversations: () => conversations,
            getFolders: () => folders,
            getAstras: () => astras,
            getPersonalMemories: () => personalMemories,
            setSidebarOpen: (next) => {
                sidebarOpen = next;
                return sidebarOpen;
            },
            setSendConfirmed: (next) => {
                sendConfirmed = next;
                return sendConfirmed;
            },
            getAbortController: () => abortController,
            getCropperInstance: () => cropperInstance,
            setCropperInstance: (next) => {
                cropperInstance = next;
                return cropperInstance;
            },
            setEditingAstraForAvatarId: (next) => {
                editingAstraForAvatarId = next;
                return editingAstraForAvatarId;
            },
            startNewChat,
            renderAll,
            setTheme,
            setupVoiceInput,
            setupScrollToBottomButton,
            updateDisplayedVersion,
            checkAndShowLatestUpdate,
            updateFunctionButtonsState,
            updateInputState: resolveEventsUpdateInputState,
            setupSettingsModal: resolveEventsSetupSettingsModal,
            toggleSidebar,
            toggleModal,
            saveSettings,
            saveAppData,
            handleExport,
            handleImport,
            handleLogout,
            handleFileSelection,
            handleFormSubmit,
            handleRename,
            handleSaveFolderSettings,
            performSearchAndRenderResults,
            loadChat,
            openDashboard,
            getActiveConversation,
            copyTextToClipboard,
            showNotification,
            normalizeConversationModel,
            getCouncilSelectedModels,
            isCouncilEnabled,
            hasCouncilWebSearchAccess,
            hasSingleWebSearchAccess,
            hasSingleDocumentAccess,
            modelSupportsVision,
            getCouncilTexts,
            renderInputIndicators,
            toggleLearningMode,
            toggleSelectionMode,
            handleBatchDelete,
            handleBatchArchive,
            handleBatchMove,
            adjustTextareaHeight: (...args) =>
                legacyRuntimeContext.resolveBinding('submit.adjustTextareaHeight')(...args),
            submitChatForm,
            closeAllPopovers,
            showCustomPrompt,
            createNewFolder,
            createAstras,
            handleSaveAstras,
            renderPersonalMemoryList,
            handleWallpaperUpload,
            restoreDefaultWallpaper,
            handleConfirmCrop,
            handleDeleteAllData,
            applyLanguage,
            openStore,
            closeStore,
            handleAvatarUpload,
            handleConfirmAvatarCrop,
            showUpdateHistory,
            toggleTrashSelectionMode,
            handleBatchRestoreFromTrash,
            handleBatchDeleteFromTrash,
            handleEmptyTrash,
            updateFileInputUI,
            postJsonWithReadableError,
            openCouncilPopoverFromAttachmentMenu,
            setupHistorySidebarInteractions,
            setupHistorySidebarTriggers,
            escapeHTML,
            getDefaultFolder,
            isMobileSettingsViewport,
            openSettingsMobileSection,
            i18n,
            randomUUID: () => crypto.randomUUID(),
            random: () => Math.random(),
            scheduleTimeout: setTimeout,
            clearScheduledTimeout: clearTimeout,
            scheduleAnimationFrame: requestAnimationFrame,
            logger: console
        });
        const { initChatApp } = appBootstrapLifecycle;
        legacyRuntimeContext.registerLazyBinding('app.initChatApp', () => initChatApp);
