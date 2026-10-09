import { addNumberedSources } from '../../ui/citations/source-numbering.js';
import { insertGroundingMarkers } from '../../ui/citations/citation-model.js';
import { watchCitations } from '../../ui/citations/citation-pills.js';
import { extractLinkedUrls } from './linked-pages.js';
import { patchHTML } from '../../ui/dom/patch-html.js';
import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';
import { NOURAS_REQUEST_PURPOSE } from '../../runtime/nouras/nouras-policy.js';
import { resolveReplyMode } from '../../runtime/sandbox/file-mode.js';
import { browserSupportsSandbox } from '../../runtime/sandbox/sandbox-protocol.js';
import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { cliIdsForReply } from '../../runtime/cli/cli-state.js';
import { getAvailableSkills, lookupSkill, readSkillFile, resolveInvokedSkills } from '../../runtime/skill/skill-bridge.js';
import { invokedSkillsInstruction, skillNamesOfParts } from '../../../data/skill-prompt.js';
import { decisionsFor, verdictOf } from '../../runtime/decisions/decision-store.js';
import { createCredentialAnswerHandler } from '../../runtime/cli/credential-answer.js';
import { createNetAnswerHandler } from '../../runtime/cli/net-answer.js';
import { mayNeedFileGuidance } from '../../ui/files/file-intent.js';
import { formatSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { collectSandboxInputs, createSandboxFileParts, registerSandboxFileParts, sandboxDocumentBlocks, sandboxDocumentNames, withoutDuplicatedFileBlocks, withoutEmptyDocumentBlocks } from '../../ui/sandbox/sandbox-files.js';
import { createSandboxLedger } from '../../ui/sandbox/sandbox-ledger.js';
import { createThinkingBlock } from '../../ui/thinking/thinking-block.js';

// Advanced mode (Python in the browser) is loaded only for replies that use it.
const loadSandboxReply = () => Promise.all([
  import('../../runtime/sandbox/sandbox-reply.js'),
  import('../../runtime/sandbox/python-sandbox.js')
]);

// A switch to Standard mode is worth saying only when the request looks like
// a task Advanced mode is for: files, data or attachments.
// The Decisions model's judgement of the message decides when there is one (decision-client.js), the word lists otherwise.
const textOfParts = (parts = []) => parts.map((part) => part?.text || '').join('\n');
const looksLikeFileTask = (parts = []) => parts.some((part) => part?.inlineData)
  || (verdictOf(decisionsFor(textOfParts(parts)), 'file') ?? mayNeedFileGuidance(textOfParts(parts)));

// Files in the conversation (attached by the person, or made by Python): a follow-up may well be about them.
const conversationHasFiles = (conversation) => (conversation?.messages || []).some((message) => (
  (message?.parts || []).some((part) => part?.inlineData || part?.sandboxFile)
));

export function createSingleModelResponseLifecycle({
  now = () => Date.now(),
  getOutputMode,
  renderSingleModelProgress,
  startProgressTicker,
  stopProgressTicker,
  buildSingleModelTranslatedRequestParts,
  streamApiCall,
  streamMarkdownResponse,
  playbackStreamingMarkdownResponse,
  renderIncrementalResponse,
  getOpenCouncilDetailKeys,
  restoreOpenCouncilDetails,
  getConfig = () => ({}),
  // Without it (older callers, tests) replies never use Advanced mode.
  supportsToolCalling = null,
  // (modelInfo) => whether the model can look at images: the automatic visual check of presentations is asked of the server for those.
  supportsVision = null,
  // The model's own web searching ({ canUse(modelInfo), searchWeb, openPage }, see web-research-reply.js). Without it a search is
  // a packet in front of the request.
  webResearch = null,
  // Replies run by the server ({ plan, start, notify, localizeError }, see runtime/server-reply/server-reply.js). Without it every reply is made here.
  serverReply = null,
  getWindow = () => globalThis.window,
  getDocument = () => globalThis.document
}) {
  let progressTimer = null;
  let latestProgress = null;
  // When the reply began, for the seconds shown. For a reply the server makes it is moved to the server's own clock, so every page
  // that shows the reply shows the same seconds.
  let runStartedAt = 0;

  const stop = () => {
    if (!progressTimer) return;
    stopProgressTicker(progressTimer);
    progressTimer = null;
  };

  const renderProgress = (targetElement, startedAt, stage, message, extra = {}) => {
    latestProgress = {
      ...latestProgress,
      stage,
      message,
      elapsedMs: now() - runStartedAt,
      ...extra
    };
    patchHTML(targetElement, renderSingleModelProgress(latestProgress));
    return latestProgress;
  };

  const startTicker = (targetElement) => {
    progressTimer = startProgressTicker(() => {
      latestProgress = {
        ...latestProgress,
        elapsedMs: now() - runStartedAt
      };
      // Only the numbers change in place: see patch-html.js.
      patchHTML(targetElement, renderSingleModelProgress(latestProgress));
    });
  };

  const run = async ({
    targetElement,
    userParts,
    modelInfo,
    conversation,
    webSearchEnabled = false,
    onMemoryContextResolved = () => {},
    signal,
    uiLanguage,
    // For a reply the server makes: the id and place of the message it writes, and the conversations the memory drew on.
    assistantMessageId = null,
    sequence = 0,
    getHistorySourceIds = () => [],
    // A reply the server is still making, picked up again after the page was closed or left: it is only followed.
    resumeRun = null
  }) => {
    stop();
    const startedAt = now();
    runStartedAt = startedAt;
    latestProgress = {
      stage: 'preparing',
      message: getRuntimeText(uiLanguage, 'preparingRequest'),
      modelName: modelInfo?.name || conversation.model,
      startedAt,
      elapsedMs: 0,
      receivedChars: 0
    };

    const replyMode = supportsToolCalling ? resolveReplyMode({
      conversation,
      config: getConfig(),
      modelInfo,
      supportsToolCalling,
      browserSupported: browserSupportsSandbox(getWindow())
    }) : { advanced: false, reason: null };
    // A model that calls tools searches the web by itself, in a Standard reply and next to Python in Advanced mode (the search
    // packet is for the others).
    const researchByModel = Boolean(webSearchEnabled && webResearch?.canUse(modelInfo));
    // A web address in the message is read for the models that cannot open one (provider-request-support.js decides which). Not when the person
    // chose a CLI tool with "@" and the model searches and opens pages by itself: the address is the tool's, and the model reads it if it needs to.
    const addressIsForTool = researchByModel && Boolean(supportsToolCalling?.(modelInfo)) && cliIdsForReply(getConfig(), userParts).chosen.length > 0;
    // Whether the server makes this reply, and so (for a model that cannot search) the search too: the page then only prepares the files and
    // pages of the message. When the server does not take the reply, the search is made here, below.
    const canCallTools = Boolean(supportsToolCalling?.(modelInfo));
    // The tools the model may use by itself are only given when the message is judged to need one; the ones chosen with "@" always are.
    const ownToolsAllowed = verdictOf(decisionsFor(textOfParts(userParts)), 'tool') !== false;
    const cli = canCallTools ? cliIdsForReply(getConfig(), userParts, { ownAllowed: ownToolsAllowed }) : { chosen: [], ids: [] };
    // The skills asked for with "/" in this message are given to the model in full, with this reply only (whatever the kind of reply: they go in the
    // system instructions, which the server is sent as they are).
    // A search the provider makes itself (some refuse our tools next to it) or a search packet put in front of the request: no skill tool then.
    const ownSearchReply = Boolean(webSearchEnabled && !researchByModel);
    // The files of a skill asked for are told about only when the model has a tool to read them.
    const invokedSkills = await resolveInvokedSkills(skillNamesOfParts(userParts));
    const filesNote = canCallTools && !ownSearchReply && invokedSkills.some((skill) => skill.files?.length) ? (await import('../../../data/skill-files-note.js')).skillFilesNote : null;
    const skillInstruction = invokedSkillsInstruction(invokedSkills, { filesNote });
    const skillOptions = skillInstruction ? { additionalSystemInstruction: skillInstruction } : {};
    // The skills the model may load by itself (the ones it is told about, and not those it was just given whole): only for a model that calls tools.
    const availableSkills = canCallTools ? await getAvailableSkills(skillNamesOfParts(userParts)) : [];
    const { createSkillLoader } = availableSkills.length && !ownSearchReply ? await import('../../../data/skill-tool.js') : {};
    const makeSkillLoader = () => (createSkillLoader ? createSkillLoader({ available: availableSkills, lookup: lookupSkill, readFile: readSkillFile }) : null);
    // Advanced mode is the default, so most replies are "advanced" by the setting alone. Python is only needed when the request is
    // about files or data, or the conversation already has some; any other reply is the same without it, and the server makes it.
    // The CLI tools chosen with "@" (and those the person lets the model use by itself) run in the same sandbox, so they need it whatever the
    // setting says; a model that cannot call tools cannot use them.
    const needsPython = cli.ids.length > 0 || (replyMode.advanced && (looksLikeFileTask(userParts) || conversationHasFiles(conversation)));
    const plan = !resumeRun && serverReply && assistantMessageId
      ? serverReply.plan({ conversation, advanced: needsPython, webSearchEnabled, researchByModel, provider: modelInfo?.provider })
      : null;
    const serverSearches = plan?.ok && plan.webSearch === 'packet';
    const hasTranslationInputs = !resumeRun && (userParts.some((part) => part.inlineData) ||
      Boolean(webSearchEnabled && !researchByModel && !serverSearches) ||
      (!addressIsForTool && extractLinkedUrls(userParts.map((part) => part.text || '').join('\n')).urls.length > 0));
    let requestParts = userParts;
    // The pages a web search found (kept with the reply, shown as "Searched N sites").
    let searchSources = [];
    // The provider's own web search (Gemini) reports the pages it used as the answer streams; rounds add to them. A page
    // that was found and then read is both, so each is kept once.
    const addSearchSources = (found) => {
      searchSources = addNumberedSources(searchSources, found);
    };
    // Where Gemini's answer cites its pages, kept until the answer is whole (the markers go into the text then).
    let groundingSupports = [];
    const withGroundingMarkers = (answer) => (groundingSupports.length
      ? insertGroundingMarkers(answer, groundingSupports, (url) => Number(searchSources.find((source) => source.url === url)?.n) || 0)
      : answer);
    if (hasTranslationInputs) {
      renderProgress(
        targetElement,
        startedAt,
        'preparing',
        'Checking model capabilities'
      );
      startTicker(targetElement, startedAt);
      requestParts = await buildSingleModelTranslatedRequestParts(
        userParts,
        modelInfo,
        signal,
        (stage, message) => renderProgress(targetElement, startedAt, stage, message),
        {
          webSearchEnabled: webSearchEnabled && !researchByModel && !serverSearches,
          readLinkedPages: !addressIsForTool,
          conversation,
          // The pages a search found, and then the pages that were read (marked `read`).
          onSources: (sources) => {
            addSearchSources(sources);
          }
        }
      );
    }

    // The server makes the reply when it can (settings, the kind of reply and the account allow it, and it takes it); the page then
    // only follows what the server writes. Otherwise it is made here, as always.
    let serverRun = resumeRun;
    if (!serverRun && plan) {
      // A tool was chosen but cannot be used for this reply: the person is told (the reply is made without it).
      if (!canCallTools && cliIdsForReply(getConfig(), userParts).chosen.length) serverReply.notify('cli-tool-model', uiLanguage);
      else if (!plan.ok && cli.chosen.length) serverReply.notify('cli-local', uiLanguage);
      if (plan.ok) {
        const started = await serverReply.start({
          conversation,
          modelInfo,
          requestParts,
          webSearch: plan.webSearch,
          // Python runs on the server too: with the Design menu's choices and the files attached to this message.
          advanced: Boolean(plan.advanced),
          // The check of a presentation the reply writes: asked of the server when the page's setting is on and the model can see images.
          visionCheck: getConfig().visionCheckEnabled !== false && modelInfo?.outputModality !== 'image' && supportsVision?.(modelInfo)
            ? { deckDesign: conversation?.deckDesign || 'auto', advanced: replyMode.advanced }
            : null,
          designs: { deck: conversation?.deckDesign || 'auto', document: conversation?.documentDesign || 'auto' },
          cli: cli.ids,
          cliChosen: cli.chosen,
          skills: ownSearchReply ? [] : availableSkills,
          inputs: userParts.filter((part) => part?.inlineData?.data).map((part) => ({
            name: part.inlineData.name || `attachment.${String(part.inlineData.mimeType || '').split('/')[1] || 'bin'}`,
            mimeType: part.inlineData.mimeType || '',
            data: part.inlineData.data
          })),
          assistantMessageId,
          sequence,
          uiLanguage,
          config: getConfig(),
          requestOptions: { onMemoryContextResolved, requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER, ...skillOptions },
          getHistorySourceIds
        });
        if (started.ok) serverRun = started.run;
        else if (started.notify) serverReply.notify(started.notify, uiLanguage);
      }
    }
    // The server did not take the reply (or there is no account to make it with): the search it was to make is made here, as before.
    if (serverSearches && !serverRun) {
      stop();
      renderProgress(targetElement, startedAt, 'preparing', 'Checking model capabilities');
      startTicker(targetElement, startedAt);
      requestParts = await buildSingleModelTranslatedRequestParts(userParts, modelInfo, signal, (stage, message) => renderProgress(targetElement, startedAt, stage, message), {
        webSearchEnabled: true,
        baseParts: requestParts,
        conversation,
        onSources: (sources) => {
          addSearchSources(sources);
        }
      });
    }

    let receivedChars = 0;
    let bufferedResponse = '';
    let lastProgressAt = 0;
    const updateStreamingProgress = (chunk) => {
      const text = String(chunk || '');
      bufferedResponse += text;
      receivedChars += text.length;
      const currentTime = now();
      if (currentTime - lastProgressAt > 700) {
        lastProgressAt = currentTime;
        renderProgress(
          targetElement,
          startedAt,
          'streaming',
          undefined,
          { receivedChars }
        );
      }
    };

    const streamOptions = { modelInfo, conversation, webSearchEnabled, onMemoryContextResolved, onSources: addSearchSources, onSupports: (supports) => { groundingSupports = supports; }, requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER, ...skillOptions };
    // The run record (or the reason for Standard mode) kept above the answer.
    let sandboxRun = !replyMode.advanced && replyMode.reason && looksLikeFileTask(userParts)
      ? { status: 'done', steps: [], fallback: replyMode.reason }
      : null;
    // Files the run made, kept as parts of the reply message.
    let sandboxParts = [];
    // Documents the code handed to the design system, as file blocks.
    let sandboxDocuments = '';
    // The step list in the message, above the answer: what the model and Python are doing now.
    let liveRun = null;
    const stepList = () => {
      if (!liveRun && targetElement.parentElement) {
        liveRun = createSandboxLedger({ document: getDocument(), host: targetElement.parentElement, before: targetElement, language: uiLanguage, summary: true, open: getConfig().processOpen === true, ...(serverRun ? { startedAt: runStartedAt, onNetAnswer: createNetAnswerHandler({ getRun: () => serverRun }), onCredentialAnswer: createCredentialAnswerHandler({ getRun: () => serverRun }) } : {}) });
      }
      return liveRun;
    };
    const showRunStatus = () => {};
    // The [n] an answer writes become small labels as it streams (and in the final view, from the saved sources).
    const stopCitations = watchCitations(targetElement, () => searchSources, { document: getDocument(), language: uiLanguage });
    // A reply without Python shows the model's thinking above the answer, as it streams,
    // and folds it when the answer starts.
    let thinkingBlock = null;
    // Every block made (more than one when words written before a search were taken for the answer, and work went on).
    const thinkingBlocks = [];
    let thought = { text: '', kind: 'raw', startedAt: null, endedAt: null };
    // Whether any of the answer has arrived (stopping before it leaves the thinking interrupted).
    let answered = false;
    let answerStarted = false;
    // `soFarMs`: it has been thinking for this long already (a page that came in late); the server tells it.
    const showThinking = (chunk, kind, soFarMs = 0) => {
      if (!chunk) return;
      thought.startedAt ??= now() - Math.max(0, Number(soFarMs) || 0);
      thought = { ...thought, text: (thought.text + chunk).slice(0, 12_000), kind: kind || thought.kind };
      if (!thinkingBlock && targetElement.parentElement) {
        // The thinking is a step of the work: its row is under the "Working" line, above the other steps.
        const steps = stepList();
        thinkingBlock = steps?.body
          ? createThinkingBlock({ document: getDocument(), host: steps.body, before: steps.stepsElement, language: uiLanguage, now, startOffsetMs: soFarMs })
          : createThinkingBlock({ document: getDocument(), host: targetElement.parentElement, before: targetElement, language: uiLanguage, now, startOffsetMs: soFarMs });
        if (thinkingBlock) thinkingBlocks.push(thinkingBlock);
      }
      thinkingBlock?.add(chunk, kind);
      liveRun?.activity(sandboxText(uiLanguage, 'thinkingLive'));
    };
    // The answer has started: the thinking is over.
    // `ms`: how long it thought, told by the server for a reply it makes (the same on every page).
    const endThinking = (ms = null) => {
      if (thought.startedAt !== null) thought.endedAt ??= Number.isFinite(ms) ? thought.startedAt + ms : now();
      thinkingBlock?.collapse(ms);
      liveRun?.activity('');
    };
    // More work after words that were taken for the answer: the line runs again, and what the model thinks next is a block of its own.
    const workResumed = () => {
      if (!answerStarted) return;
      answerStarted = false;
      thinkingBlock = null;
    };
    // A reply the server is making: its words are shown as they are written, and its run record (the pages it searched) is kept.
    const runServerStream = async (onChunk) => {
      try {
        const outcome = await serverRun.follow({
          signal,
          onRun: (run) => { searchSources = run.sources; },
          // The seconds are the server's.
          onTiming: (elapsedMs) => { runStartedAt = now() - elapsedMs; liveRun?.setStartedAt?.(runStartedAt); },
          // What the model thinks is shown as it thinks, as in a reply made here.
          onThought: (chunk, kind, soFarMs) => showThinking(chunk, kind === 'summary' ? 'summary' : undefined, soFarMs),
          onThoughtEnd: (ms) => endThinking(ms),
          // The server is searching first (for a model that cannot search): the line the page shows when it does that itself.
          onSearching: (source) => { if (source && !answered) renderProgress(targetElement, startedAt, 'searchTranslation', getRuntimeText(uiLanguage, source === 'tinyfish' ? 'searchingTinyfish' : 'searchingTavily')); },
          // The steps of Python (and the pages it searched) as they happen, in the same step list as a reply made here.
          // Each event says when it happened on the server, so every page draws the same times.
          onEvent: (event) => {
            // The channel was joined again (the server was replaced): the steps come again from their start, so the list is drawn afresh.
            if (event.type === 'reset') {
              liveRun?.remove();
              liveRun = null;
              return;
            }
            stepList()?.event(Number.isFinite(event.t) ? { ...event, at: runStartedAt + event.t } : event);
          },
          onText: (delta) => {
            if (!answered) endThinking();
            answered = true;
            onChunk(delta);
          }
        });
        if (outcome.run) {
          sandboxRun = outcome.run;
          if (outcome.run.sources?.length) searchSources = outcome.run.sources;
        }
        if (outcome.rewritten && targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
        // The server may check the presentations of the reply too: the page then follows that check and makes none of its own.
        serverReply.noteVision?.(assistantMessageId, { vision: Boolean(serverRun.vision), visionRunId: outcome.visionRunId });
        // The files the reply made are parts of its message (their bytes are in the person's cloud storage; they are brought here).
        if (outcome.extraParts?.length) {
          sandboxParts = outcome.extraParts;
          registerSandboxFileParts(sandboxParts);
        }
        return outcome.text;
      } catch (error) {
        // The server lost its Python before it had an answer, and this page was there: the reply is made here, with the page's own Python.
        if (error?.code === 'sandbox_unavailable' && replyMode.advanced) {
          sandboxRun = null;
          return runLocalAdvanced(onChunk);
        }
        throw serverReply.localizeError(error, uiLanguage);
      }
    };
    const runLocalAdvanced = async (onChunk) => {
        const [{ runSandboxReply }, { getPythonSandbox }] = await loadSandboxReply();
        let advancedParts = requestParts;
        let advancedOptions = streamOptions;
        let searchMs = 0;
        const { needsSearchBriefing, runSearchBriefing, briefingPart } = await import('../../runtime/sandbox/search-briefing.js');
        if (needsSearchBriefing({ modelInfo, webSearchEnabled, conversation })) {
          // A provider that cannot search and run Python in one request searches first; the Python round gets the briefing.
          const searchStartedAt = now();
          stepList()?.event({ type: 'searching', label: sandboxText(uiLanguage, 'sandboxSearching') });
          try {
            const briefing = await runSearchBriefing({ streamApiCall, requestParts, requestOptions: streamOptions, signal });
            addSearchSources(briefing.sources);
            const part = briefingPart(briefing, modelInfo?.name);
            if (part) advancedParts = [part, ...requestParts];
          } catch (error) {
            // Stopping stops the reply; a search that failed leaves the reply to go on without it.
            if (signal?.aborted) throw error;
          }
          searchMs = now() - searchStartedAt;
          stepList()?.event({ type: 'sources', sources: searchSources });
          advancedOptions = { ...streamOptions, webSearchEnabled: false, ignoreConversationWebSearch: true };
        } else if (searchSources.length) {
          stepList()?.event({ type: 'sources', sources: searchSources });
        }
        const result = await runSandboxReply({
          streamApiCall,
          requestParts: advancedParts,
          onChunk,
          signal,
          requestOptions: advancedOptions,
          getSandbox: (options) => getPythonSandbox({ ...options, language: getConfig().aiDefaultLanguage || uiLanguage }),
          language: uiLanguage,
          provider: modelInfo?.provider,
          inputFiles: collectSandboxInputs(conversation, userParts),
          designs: { deck: conversation?.deckDesign || 'auto', document: conversation?.documentDesign || 'auto' },
          research: researchByModel ? { searchWeb: webResearch.searchWeb, openPage: webResearch.openPage, onSources: addSearchSources } : null,
          skills: makeSkillLoader(),
          onStatus: showRunStatus,
          onEvent: (event) => stepList()?.event(event)
        });
        sandboxRun = result.run;
        // The search before the run is part of the time the reply took.
        if (sandboxRun && searchMs) sandboxRun.elapsedMs = (sandboxRun.elapsedMs || 0) + searchMs;
        // Word and PowerPoint files made freely get the app's fonts embedded.
        if (result.run?.steps?.length) {
          await import('../../ui/sandbox/office-fonts-browser.js')
            .then((module) => module.embedFontsInBrowser(result.run))
            .catch(() => {});
        }
        sandboxParts = createSandboxFileParts(result.run);
        sandboxDocuments = sandboxDocumentBlocks(result.run);
        // A block the model also wrote under the name of a file it made (with Python, or through the design system) is a second, empty card.
        return withoutEmptyDocumentBlocks(withoutDuplicatedFileBlocks(result.text, [...sandboxParts.map((part) => part.sandboxFile.name), ...sandboxDocumentNames(result.run)]));
    };
    const runStandard = async (onChunk) => {
        const onAnswer = (chunk) => {
          answered = true;
          endThinking();
          // The answer has begun: the "Working" line is over and says how long it took.
          if (!answerStarted) {
            answerStarted = true;
            liveRun?.event({ type: 'answering' });
          }
          onChunk(chunk);
        };
        if (researchByModel) {
          let started = false;
          try {
            const { runWebResearchReply } = await import('./web-research-reply.js');
            const result = await runWebResearchReply({
              streamApiCall,
              requestParts,
              onChunk: (chunk) => { started = true; onAnswer(chunk); },
              signal,
              requestOptions: { ...streamOptions, onReasoning: showThinking },
              searchWeb: webResearch.searchWeb,
              openPage: webResearch.openPage,
              language: uiLanguage,
              onSources: addSearchSources,
              skills: makeSkillLoader(),
              onEvent: (event) => {
                if (event.type === 'searching' || event.type === 'skill') {
                  started = true;
                  workResumed();
                }
                stepList()?.event(event);
              }
            });
            return result.text;
          } catch (error) {
            // A provider that refuses the tools answers with the search done first, as the others do.
            if (signal?.aborted || started) throw error;
          }
          requestParts = await buildSingleModelTranslatedRequestParts(userParts, modelInfo, signal, () => {}, {
            webSearchEnabled, conversation, onSources: addSearchSources
          });
        }
        // No search and no Python, but skills the model may load: a small loop that gives it the tool (a provider that refuses the tools answers without it).
        const skillLoader = makeSkillLoader();
        if (skillLoader) {
          let begun = false;
          try {
            const { runSkillsReply } = await import('./skills-reply.js');
            const result = await runSkillsReply({
              streamApiCall,
              requestParts,
              onChunk: (chunk) => { begun = true; onAnswer(chunk); },
              signal,
              requestOptions: { ...streamOptions, onReasoning: showThinking },
              loader: skillLoader,
              language: uiLanguage,
              onEvent: (event) => {
                begun = true;
                workResumed();
                stepList()?.event(event);
              }
            });
            return result.text;
          } catch (error) {
            if (signal?.aborted || begun) throw error;
          }
        }
        return streamApiCall(requestParts, onAnswer, signal, false, { ...streamOptions, onReasoning: showThinking });
    };
    const runApiStream = serverRun ? runServerStream : replyMode.advanced ? runLocalAdvanced : runStandard;

    let fullResponse;
    let responseRenderedInRealtime = false;
    try {
      if (getOutputMode() === 'realtime') {
        stop();
        const realtimeProgress = {
          ...latestProgress,
          stage: 'streaming',
          message: undefined,
          elapsedMs: now() - runStartedAt
        };
        latestProgress = realtimeProgress;
        patchHTML(targetElement, renderSingleModelProgress(realtimeProgress));
        startTicker(targetElement, startedAt);
        fullResponse = await streamMarkdownResponse(
          targetElement,
          runApiStream,
          signal,
          {
            placeholderHTML: renderSingleModelProgress(realtimeProgress),
            onFirstChunk: stop
          }
        );
        responseRenderedInRealtime = true;
      } else {
        if (!progressTimer) {
          renderProgress(
            targetElement,
            startedAt,
            'streaming',
            undefined
          );
          startTicker(targetElement, startedAt);
        }
        try {
          fullResponse = await runApiStream(updateStreamingProgress);
        } catch (error) {
          if (!signal?.aborted) throw error;
          fullResponse = bufferedResponse;
        }
      }
    } finally {
      stop();
      stopCitations();
      liveRun?.remove();
      // What was thought is kept with the reply (the run record), so it is still there after a reload.
      endThinking();
      thinkingBlocks.forEach((block) => block.remove());
      thinkingBlock?.remove();
      if (searchSources.length) sandboxRun = { status: 'done', steps: [], elapsedMs: now() - runStartedAt, ...(sandboxRun || {}), sources: searchSources };
      // (For a reply the server made, the time it thought is the server's, kept in its run record.)
      if (thought.text && !replyMode.advanced && !serverRun) {
        sandboxRun = { status: 'done', steps: [], ...(sandboxRun || {}), thought: thought.text, thoughtKind: thought.kind, thoughtMs: thought.endedAt - thought.startedAt, ...(signal?.aborted && !answered ? { thoughtInterrupted: true } : {}) };
      }
    }

    // Gemini says where its answer cites its pages only once it is whole: the markers go into the text now, and the final
    // view is drawn again so they show as labels.
    if (groundingSupports.length && fullResponse) {
      const marked = withGroundingMarkers(fullResponse);
      if (marked !== fullResponse) {
        fullResponse = marked;
        if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
      }
    }

    // Stopped while thinking, with nothing else to show: the reply is the interrupted thinking.
    if (!String(fullResponse || '').trim() && !sandboxRun?.steps?.length && !sandboxRun?.thought) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error(getRuntimeText(uiLanguage, 'emptyResponse'));
    }
    if (sandboxRun) {
      fullResponse = `${formatSandboxRunBlock(sandboxRun)}${fullResponse || ''}${sandboxDocuments ? `

${sandboxDocuments}` : ''}`;
      // The final view is drawn again so the run row appears above the answer.
      if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
    }

    return {
      fullResponse,
      responseRenderedInRealtime,
      extraParts: sandboxParts
    };
  };

  const completeView = async ({
    targetElement,
    fullResponse,
    signal,
    responseRenderedInRealtime
  }) => {
    if (responseRenderedInRealtime && targetElement.dataset.streamRendered === 'true') {
      restoreOpenCouncilDetails(targetElement, getOpenCouncilDetailKeys(targetElement));
      return;
    }
    if (responseRenderedInRealtime) {
      renderIncrementalResponse(targetElement, fullResponse, {
        final: true,
        preserveCouncilDetails: false
      });
      return;
    }
    if (signal?.aborted) {
      renderIncrementalResponse(targetElement, fullResponse, {
        final: true,
        preserveCouncilDetails: false
      });
      return;
    }
    await playbackStreamingMarkdownResponse(
      targetElement,
      fullResponse,
      signal,
      false
    );
  };

  return {
    completeView,
    getLatestProgress() {
      return latestProgress;
    },
    run,
    stop
  };
}
