import { shouldAutoEnableWebSearch } from '../../runtime/features/auto-web-search.js';
import { extractLinkedUrls } from './linked-pages.js';
import { clearCliSelection, getCliSelection } from '../../runtime/cli/cli-bridge.js';
import { clearSkillSelection, getSkillSelection } from '../../runtime/skill/skill-bridge.js';
import { cliIdsOfParts, withCliSegments } from '../../runtime/cli/cli-state.js';
import { rememberDecisions, verdictOf } from '../../runtime/decisions/decision-store.js';

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
  // The Decisions model's judgements of a message ({ search, file, chart, tool }: probabilities), or null: see runtime/decisions/decision-client.js and decision-store.js.
  requestDecisions = async () => null,
  canAutoEnableWebSearch = () => true,
  // A model that searches by itself, when it judges that it needs to, is given the search with every message.
  canModelDecideWebSearch = () => false,
  getAutoSearchNotice,
  renderInputIndicators,
  adjustTextareaHeight,
  renderFilePreviews,
  requestFrame,
  isImageConversation = () => false,
  getQuoteReference = () => null,
  buildQuotedUserParts = ({ question }) => question ? [{ text: question }] : [],
  clearQuoteReference = () => {},
  beginFirstSubmit = () => false,
  onConversationStarted = () => {}
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
    const composerDisplayMessage = suppliedMessage == null
      ? String(elements.messageInput.displayValue || composerMessage).trim()
      : composerMessage;
    const composerDisplaySegments = suppliedMessage == null
      ? elements.messageInput.displaySegments
      : null;
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
    const abortController = createAbortController();
    setAbortController(abortController);
    updateSubmitButtonState(true);

    const userParts = hasQuoteReference
      ? buildQuotedUserParts({ question: composerMessage, quoteReference })
      : buildUserParts(composerMessage, []);
    const composerTextPart = userParts.find(part => part?.text === composerMessage);
    if (composerTextPart && composerDisplayMessage !== composerMessage) {
      composerTextPart.displayText = composerDisplayMessage;
      if (Array.isArray(composerDisplaySegments)) {
        composerTextPart.displaySegments = composerDisplaySegments;
      }
    }
    // The CLI tools chosen with "@" are in the message as chips (on a phone the chips are not in the box, so they are put in here).
    const cliTarget = composerTextPart || userParts.find((part) => typeof part?.text === 'string');
    // The skills chosen with "/" are chips in it in the same way.
    if (cliTarget) withCliSegments(cliTarget, [...getCliSelection(), ...getSkillSelection()]);
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
    // The judgements are asked for while the message is put on the screen, and waited for where they are first needed (the search below).
    const decisionsPromise = Promise.resolve(isImageConversation(conversation) ? null : requestDecisions({ conversation, userMessage, uploadedFiles, signal: abortController.signal })).catch(() => null);
    beginFirstSubmit();
    const userMessageObject = { role: 'user', parts: userParts, createdAt: new Date().toISOString() };
    const userMessageDiv = addMessageToUI(userMessageObject, conversation.messages.length, true);
    requestFrame(() => {
      userMessageDiv?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
    });
    conversation.lastUpdatedAt = new Date().toISOString();
    conversation.unsentMessage = '';

    if (!preserveComposer) {
      clearCliSelection();
      clearSkillSelection();
      elements.messageInput.value = '';
      setUploadedFiles([]);
      clearQuoteReference();
      adjustTextareaHeight();
      renderFilePreviews();
    }

    // Keep the live response element with its conversation when navigation rebuilds the chat view.
    const pendingResponse = { loadingMessageDiv: null };
    Object.defineProperty(conversation, '__astraPendingResponse', {
      configurable: true,
      value: pendingResponse
    });
    let initialSave = null;
    const startedTemporaryConversation = Boolean(conversation.isTemporary);
    if (startedTemporaryConversation) {
      conversation.isTemporary = false;
      if (conversation.retentionMode === 'ephemeral') {
        conversation.isNaming = false;
      } else {
        conversation.isNaming = true;
        renderHistorySidebar();
        if (getAutoNaming()) {
          generateTitleAndSummary(conversation);
        } else {
          conversation.isNaming = false;
        }
        initialSave = saveAppData();
      }
    }

    const loadingParts = isImageConversation(conversation)
      ? [{
          imageGenerationLoading: true,
          imageAspectRatio: conversation.imageConfig?.aspectRatio || '1:1',
          imageStartedAt: Date.now()
        }]
      : [{ text: '...' }];
    const loadingMessageDiv = addMessageToUI(
      { role: 'model', parts: loadingParts, createdAt: new Date().toISOString() },
      conversation.messages.length,
      false,
      true,
      { conversation }
    );
    pendingResponse.loadingMessageDiv = loadingMessageDiv;
    const contentDiv = loadingMessageDiv.querySelector('[data-image-generation-stage]')
      || loadingMessageDiv.querySelector('.message-content')
      || loadingMessageDiv;
    requestFrame(() => {
      loadingMessageDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
    // A message with a web address turns the search on whatever the settings say (where search can work at all): it is about
    // something on the web. Without one, only the automatic search does, and only for what needs current facts.
    // Except when the address is for a CLI tool the person chose with "@" and the model calls tools: the address is the tool's (a post to
    // download), reading it first is a wait for nothing, and the model has the search and the page reading at hand if the work needs them.
    // The loading message is already on the screen, so the wait for the judgements (at most their time limit) is not a blank wait.
    const decisions = await decisionsPromise;
    rememberDecisions(userMessage, decisions);
    // What needs current facts is the Decisions model's judgement when there is one, the word lists when there is not.
    const needsCurrentFacts = verdictOf(decisions, 'search') ?? shouldAutoEnableWebSearch(userMessage);
    const hasAddress = extractLinkedUrls(userMessage).urls.length > 0;
    const addressIsForTool = hasAddress && cliIdsOfParts(userParts).length > 0 && canModelDecideWebSearch(conversation);
    const autoWebSearchEnabled = !conversation.isWebSearchEnabled
      && canAutoEnableWebSearch(conversation)
      && ((hasAddress && !addressIsForTool)
        || (getAutoWebSearchEnabled() && needsCurrentFacts));
    if (autoWebSearchEnabled) {
      showNotification(getAutoSearchNotice(), 'warning');
    }
    // Smart search on, and a model that calls tools: it has the search at hand and decides for itself whether the question
    // needs it, so there is nothing to announce (the step list shows each search it makes). The words that need current
    // facts are only what turns the search on for the other models.
    const searchOfferedToModel = !conversation.isWebSearchEnabled
      && !autoWebSearchEnabled
      && (getAutoWebSearchEnabled() || addressIsForTool)
      && canModelDecideWebSearch(conversation);
    try {
      if (initialSave) await initialSave;
      if (startedTemporaryConversation) onConversationStarted(conversation);
    } catch (error) {
      delete conversation.__astraPendingResponse;
      loadingMessageDiv.remove?.();
      setAbortController(null);
      updateSubmitButtonState(false);
      throw error;
    }

    return {
      abortController,
      contentDiv,
      conversation,
      loadingMessageDiv,
      responseUsesCouncil,
      shouldContinue: true,
      webSearchEnabled: Boolean(conversation.isWebSearchEnabled || autoWebSearchEnabled || searchOfferedToModel),
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
