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
  canAutoEnableWebSearch = () => true,
  getAutoSearchNotice,
  renderInputIndicators,
  adjustTextareaHeight,
  renderFilePreviews,
  requestFrame
  ,isImageConversation = () => false,
  requiresSingleImageInput = () => false,
  getQuoteReference = () => null,
  buildQuotedUserParts = ({ question }) => question ? [{ text: question }] : [],
  clearQuoteReference = () => {}
}) {
  const buildUserParts = (userMessage, uploadedFiles) => {
    const userParts = [];
    if (userMessage) {
      userParts.push({ text: userMessage });
    }
    uploadedFiles.forEach(file => {
      const inlineData = {
        mimeType: file.type,
        data: file.base64.split(',')[1],
        size: file.size,
        name: file.name
      };
      if (file.targetedEdit) inlineData.targetedEdit = true;
      userParts.push({
        inlineData
      });
    });
    return userParts;
  };

  const prepareSubmitResponse = async ({
    userMessage: suppliedMessage,
    uploadedFiles: suppliedFiles,
    quoteReference: suppliedQuoteReference,
    preserveComposer = false
  } = {}) => {
    if (getAbortController()) return { shouldContinue: false, reason: 'already-generating' };
    const composerMessage = String(suppliedMessage ?? elements.messageInput.value).trim();
    const quoteReference = suppliedQuoteReference === undefined
      ? getQuoteReference()
      : suppliedQuoteReference;
    const hasQuoteReference = Boolean(String(quoteReference?.text || '').trim());
    const uploadedFiles = Array.isArray(suppliedFiles) ? suppliedFiles : getUploadedFiles();
    if (!composerMessage && !hasQuoteReference && uploadedFiles.length === 0) {
      return { shouldContinue: false, reason: 'empty' };
    }

    const conversation = getActiveConversation();
    if (conversation.archived) return { shouldContinue: false, reason: 'archived' };
    if (requiresSingleImageInput(conversation) && (
      uploadedFiles.length > 1 || uploadedFiles.some(file => !file.type?.startsWith('image/'))
    )) {
      showNotification('Step Image Edit 2 每次只能使用一張圖片附件。', 'warning');
      return { shouldContinue: false, reason: 'stepfun-image-input' };
    }

    const abortController = createAbortController();
    setAbortController(abortController);
    updateSubmitButtonState(true);

    const userParts = hasQuoteReference
      ? buildQuotedUserParts({ question: composerMessage, quoteReference })
      : buildUserParts(composerMessage, []);
    userParts.push(...buildUserParts('', uploadedFiles));
    const userMessage = userParts
      .filter(part => part?.text)
      .map(part => part.text)
      .join('\n');
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
    const userMessageDiv = addMessageToUI(userMessageObject, conversation.messages.length, true);
    requestFrame(() => {
      userMessageDiv?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
    });
    conversation.lastUpdatedAt = new Date().toISOString();
    conversation.unsentMessage = '';

    if (!preserveComposer) {
      elements.messageInput.value = '';
      setUploadedFiles([]);
      clearQuoteReference();
      adjustTextareaHeight();
      renderFilePreviews();
    }

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

    if (!responseUsesCouncil && getAutoWebSearchEnabled() && canAutoEnableWebSearch(conversation) && !conversation.isWebSearchEnabled) {
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
