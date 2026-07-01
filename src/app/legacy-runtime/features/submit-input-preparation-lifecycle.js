export function createSubmitInputPreparationLifecycle({
  elements,
  getAbortController,
  setAbortController,
  createAbortController,
  getUploadedFiles,
  setUploadedFiles,
  getActiveConversation,
  updateSubmitButtonState,
  getCouncilValidation,
  showNotification,
  renderCouncilControls,
  isCouncilEnabled,
  getCouncilRuntimeTexts,
  addMessageToUI,
  renderHistorySidebar,
  getAutoNaming,
  generateTitleAndSummary,
  saveAppData,
  getAutoWebSearchEnabled,
  shouldPerformWebSearch,
  getAutoSearchNotice,
  renderInputIndicators,
  adjustTextareaHeight,
  renderFilePreviews,
  requestFrame
  ,isImageConversation = () => false
}) {
  const buildUserParts = (userMessage, uploadedFiles) => {
    const userParts = [];
    if (userMessage) {
      userParts.push({ text: userMessage });
    }
    uploadedFiles.forEach(file => {
      userParts.push({
        inlineData: {
          mimeType: file.type,
          data: file.base64.split(',')[1],
          size: file.size,
          name: file.name
        }
      });
    });
    return userParts;
  };

  const prepareSubmitResponse = async () => {
    if (getAbortController()) return { shouldContinue: false, reason: 'already-generating' };
    const userMessage = elements.messageInput.value.trim();
    const uploadedFiles = getUploadedFiles();
    if (!userMessage && uploadedFiles.length === 0) return { shouldContinue: false, reason: 'empty' };

    const conversation = getActiveConversation();
    if (conversation.archived) return { shouldContinue: false, reason: 'archived' };

    const abortController = createAbortController();
    setAbortController(abortController);
    updateSubmitButtonState(true);

    const userParts = buildUserParts(userMessage, uploadedFiles);
    const councilValidation = getCouncilValidation(conversation, uploadedFiles);
    if (!councilValidation.ok) {
      showNotification(councilValidation.message, 'warning');
      setAbortController(null);
      updateSubmitButtonState(false);
      renderCouncilControls();
      return { shouldContinue: false, reason: 'council-validation' };
    }

    const responseUsesCouncil = isCouncilEnabled(conversation);
    if (responseUsesCouncil && !conversation.isWebSearchEnabled) {
      showNotification(getCouncilRuntimeTexts().searchManualNotice, 'warning');
    }

    const userMessageObject = { role: 'user', parts: userParts, createdAt: new Date().toISOString() };
    addMessageToUI(userMessageObject, conversation.messages.length, true);
    conversation.lastUpdatedAt = new Date().toISOString();
    conversation.unsentMessage = '';

    if (conversation.isTemporary) {
      conversation.isTemporary = false;
      conversation.isNaming = true;
      renderHistorySidebar();
      if (getAutoNaming()) {
        generateTitleAndSummary(conversation);
      } else {
        conversation.isNaming = false;
      }
      await saveAppData();
    }

    if (!responseUsesCouncil && getAutoWebSearchEnabled() && conversation.provider === 'gemini' && !conversation.isWebSearchEnabled) {
      try {
        const needsSearch = await shouldPerformWebSearch(userMessage);
        if (needsSearch) {
          conversation.isWebSearchEnabled = true;
          showNotification(getAutoSearchNotice(), 'warning');
        }
        renderInputIndicators();
      } catch (error) {
        console.error('Auto web search check failed:', error);
      }
    }

    elements.messageInput.value = '';
    setUploadedFiles([]);
    adjustTextareaHeight();
    renderFilePreviews();
    const loadingParts = isImageConversation(conversation)
      ? [{
          imageGenerationLoading: true,
          imageAspectRatio: conversation.imageConfig?.aspectRatio || '1:1'
        }]
      : [{ text: '...' }];
    const loadingMessageDiv = addMessageToUI({ role: 'model', parts: loadingParts, createdAt: new Date().toISOString() }, conversation.messages.length, false);
    const contentDiv = loadingMessageDiv.querySelector('[data-image-generation-stage]')
      || loadingMessageDiv.querySelector('.message-content')
      || loadingMessageDiv;
    requestFrame(() => {
      loadingMessageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });

    return {
      abortController,
      contentDiv,
      conversation,
      loadingMessageDiv,
      responseUsesCouncil,
      shouldContinue: true,
      userMessage,
      userMessageObject,
      userParts
    };
  };

  return {
    buildUserParts,
    prepareSubmitResponse
  };
}
