// What a reply of one model shows while it is made (single-model-response-lifecycle.js): the step list above the answer ("Working", the runs of
// Python, the searches), the model's thinking as a step of it, and the notice that the model searches by itself. The same for a reply made
// here and one the server makes (then its times are the server's).

import { sandboxText } from '../sandbox/sandbox-texts.js';
import { createCredentialAnswerHandler } from '../cli/credential-answer.js';
import { createConnectorAnswerHandler } from '../connector/connector-answer.js';
import { createImageAnswerHandler } from '../image-tool/image-answer.js';
import { createNetAnswerHandler } from '../cli/net-answer.js';
import { createSandboxLedger } from '../../ui/sandbox/sandbox-ledger.js';
import { createThinkingBlock } from '../../ui/thinking/thinking-block.js';
import { createDrawStage } from '../../ui/sandbox/draw-stage.js';

/**
 * `serverRun`: the run of the server when it makes the reply (its questions to the person are answered through it). `madeHere`: the server
 * did not take the reply, and its line says so. `getRunStartedAt`: when the reply began (the server's clock for a reply it makes).
 * `onStepsShown`: the step list is there, so the waiting dot is no longer drawn.
 */
export function createReplyLiveView({ targetElement, getDocument, getConfig, language, now, serverReply, serverRun, madeHere, getRunStartedAt, onStepsShown }) {
  // The step list in the message, above the answer: what the model and Python are doing now.
  let liveRun = null;
  // A reply without Python shows the model's thinking above the answer, as it streams, and folds it when the answer starts.
  let thinkingBlock = null;
  // Every block made (more than one when words written before a search were taken for the answer, and work went on).
  const thinkingBlocks = [];
  let thought = { text: '', kind: 'raw', startedAt: null, endedAt: null };
  // Whether any of the answer has arrived (stopping before it leaves the thinking interrupted).
  let answered = false;
  let answerStarted = false;
  let ownSearchNoticed = false;

  // The wait for a picture the model draws, under the words so far.
  // Where it goes is the bubble of the words so far; when pictures are drawn between the words, the one the words are in now (picture-flow.js tells).
  let stagePlace = null;
  const drawStage = createDrawStage({ document: getDocument(), language, place: () => stagePlace?.() || targetElement.closest?.('.message-bubble') || targetElement });

  const stepList = () => {
    if (!liveRun && targetElement.parentElement) {
      liveRun = createSandboxLedger({
        document: getDocument(),
        host: targetElement.parentElement,
        before: targetElement,
        language,
        summary: true,
        open: getConfig().processOpen === true,
        madeHere,
        ...(serverRun ? {
          startedAt: getRunStartedAt(),
          onNetAnswer: createNetAnswerHandler({ getRun: () => serverRun }),
          onCredentialAnswer: createCredentialAnswerHandler({ getRun: () => serverRun }),
          onConnectorAnswer: createConnectorAnswerHandler({ getRun: () => serverRun }),
          onImageAnswer: createImageAnswerHandler({ getRun: () => serverRun })
        } : {})
      });
      // Its line says the reply is working: the dot (and its "still getting ready") under it would say it twice.
      onStepsShown();
      targetElement.querySelectorAll?.('.reply-wait, .reply-wait-step').forEach((node) => node.remove());
    }
    return liveRun;
  };

  // The model searches the web by itself (its own search or a page it opens): the person is told once per reply. A page that joined a reply the server
  // is making is sent the earlier events again (with their times): only one that happened a moment ago is news.
  const noteOwnSearch = (event, { at = null } = {}) => {
    if (ownSearchNoticed || event?.type !== 'searching') return;
    if (Number.isFinite(at) && now() - at > 15_000) return;
    ownSearchNoticed = true;
    serverReply?.notify?.('model-searches', language);
  };

  // `soFarMs`: it has been thinking for this long already (a page that came in late); the server tells it.
  const showThinking = (chunk, kind, soFarMs = 0) => {
    if (!chunk) return;
    thought.startedAt ??= now() - Math.max(0, Number(soFarMs) || 0);
    thought = { ...thought, text: (thought.text + chunk).slice(0, 12_000), kind: kind || thought.kind };
    if (!thinkingBlock && targetElement.parentElement) {
      // The thinking is a step of the work: its row is under the "Working" line, above the other steps.
      const steps = stepList();
      thinkingBlock = steps?.body
        ? createThinkingBlock({ document: getDocument(), host: steps.body, before: steps.stepsElement, language, now, startOffsetMs: soFarMs })
        : createThinkingBlock({ document: getDocument(), host: targetElement.parentElement, before: targetElement, language, now, startOffsetMs: soFarMs });
      if (thinkingBlock) thinkingBlocks.push(thinkingBlock);
    }
    thinkingBlock?.add(chunk, kind);
    liveRun?.activity(sandboxText(language, 'thinkingLive'));
  };

  // The answer has started: the thinking is over. `ms`: how long it thought, told by the server for a reply it makes (the same on every page).
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

  // Words of the answer arrived: the thinking is over, and (the first time) the "Working" line ends and says how long it took.
  const answering = () => {
    answered = true;
    endThinking();
    if (!answerStarted) {
      answerStarted = true;
      liveRun?.event({ type: 'answering' });
    }
  };

  return {
    stepList,
    // The wait for a picture the model draws, when it is on the page (the place for the picture is made around it).
    stageElement: () => drawStage.element,
    setStagePlace: (place) => { stagePlace = place; },
    // An event of the steps (a run, a search, a skill): drawn in the list.
    event: (event) => {
      drawStage.handle(event);
      stepList()?.event(event);
      // The words are done and the files are being kept: a grey card stands where they will be, so they do not appear out of nothing when the
      // reply ends (the reply is drawn again then, which takes the card away; finalizeAssistantResponse takes away any that is left).
      if (event?.type === 'finishing' && !targetElement.querySelector?.('.file-skeleton')) {
        const placeholder = getDocument().createElement('div');
        placeholder.className = 'ac-file-card file-skeleton';
        placeholder.setAttribute('aria-hidden', 'true');
        targetElement.append(placeholder);
      }
    },
    noteOwnSearch,
    showThinking,
    endThinking,
    workResumed,
    answering,
    // The server's answer arrived (its step list is the server's: no "answering" step of the page's own).
    serverText: () => {
      if (!answered) endThinking();
      answered = true;
    },
    // The channel was joined again (the server was replaced): the steps come again from their start, so the list is drawn afresh.
    resetSteps: () => {
      liveRun?.remove();
      liveRun = null;
      drawStage.remove();
    },
    setStartedAt: (startedAt) => liveRun?.setStartedAt?.(startedAt),
    get answered() { return answered; },
    get thought() { return thought; },
    // The reply is over: the list and the thinking blocks leave (what was thought is kept with the reply, in its run record).
    close: () => {
      liveRun?.remove();
      drawStage.remove();
      endThinking();
      thinkingBlocks.forEach((block) => block.remove());
      thinkingBlock?.remove();
    }
  };
}
