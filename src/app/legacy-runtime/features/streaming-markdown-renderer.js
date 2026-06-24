import { createStreamingMarkdownRenderState } from './streaming-markdown-render-state.js';
import { createStreamingTextFrameQueue } from './streaming-text-frame-queue.js';
import {
  getOpenCouncilDetailKeys,
  hasUnclosedCouncilDetails,
  normalizeCouncilComparisonDetails,
  restoreOpenCouncilDetails
} from './streaming-council-details.js';

export function createStreamingMarkdownFeature({
  document,
  renderMarkdown,
  renderMarkdownWithFormulas,
  isChatNearBottom,
  getChatScrollTop,
  keepChatPositionAfterRender,
  scheduleFrame,
  waitForFrame,
  getStreamErrorText = (error) => `抱歉，發生錯誤：${error.message}`,
  logError = (...args) => console.error(...args)
}) {
  const createStreamingMarkdownRenderer = (targetElement, options = {}) => {
    const renderState = createStreamingMarkdownRenderState();
    const preserveCouncilDetails = Boolean(options.preserveCouncilDetails);
    const root = document.createElement('div');
    const finalizedNode = document.createElement('div');
    const currentLineNode = document.createElement('div');

    root.className = 'streaming-markdown-root';
    finalizedNode.className = 'streaming-markdown-finalized';
    currentLineNode.className = 'streaming-current-line';
    root.append(finalizedNode, currentLineNode);
    targetElement.innerHTML = '';
    targetElement.classList.remove('typing-cursor');
    targetElement.classList.add('is-streaming-response');
    delete targetElement.dataset.streamRendered;
    targetElement.appendChild(root);

    const renderFinalized = (renderFormulas = false) => {
      const openKeys = preserveCouncilDetails ? getOpenCouncilDetailKeys(finalizedNode) : null;
      const finalizedText = renderState.getFinalizedText();
      let renderText = preserveCouncilDetails
        ? normalizeCouncilComparisonDetails(finalizedText)
        : finalizedText;
      if (preserveCouncilDetails && hasUnclosedCouncilDetails(renderText)) {
        renderText += '\n\n</details>';
      }
      finalizedNode.innerHTML = renderFormulas
        ? renderMarkdownWithFormulas(renderText)
        : renderMarkdown(renderText);
      restoreOpenCouncilDetails(finalizedNode, openKeys);
    };

    const appendFadedText = (text = '') => {
      if (!text) return;
      const fragment = document.createDocumentFragment();
      Array.from(text).forEach((char, index) => {
        const span = document.createElement('span');
        span.className = 'streaming-fade-char';
        span.style.animationDelay = `${Math.min(index * 8, 96)}ms`;
        span.textContent = char;
        fragment.appendChild(span);
      });
      currentLineNode.appendChild(fragment);
    };

    const updateCurrentLine = () => {
      const patch = renderState.syncCurrentLine();
      if (patch.reset) {
        currentLineNode.innerHTML = '';
      }
      appendFadedText(patch.appendText);
    };

    const flushPendingLines = (force = false, renderFormulas = false) => {
      if (renderState.isFinalized()) return;
      const shouldStick = isChatNearBottom();
      const previousTop = getChatScrollTop();
      const flushResult = renderState.flushPending({ force });
      if (flushResult.didFlush) {
        renderFinalized(renderFormulas);
      }
      updateCurrentLine();
      keepChatPositionAfterRender(shouldStick, previousTop);
    };

    return {
      appendText(chunk = '') {
        const appendResult = renderState.appendText(chunk);
        if (appendResult.ignored) return;
        flushPendingLines(false, false);
      },
      finish({ renderFormulas = true } = {}) {
        if (renderState.isFinalized()) return renderState.getText();
        flushPendingLines(true, renderFormulas);
        if (renderFormulas && renderState.getFinalizedText()) {
          renderFinalized(true);
        }
        renderState.finalize();
        currentLineNode.remove();
        targetElement.classList.remove('is-streaming-response');
        targetElement.dataset.streamRendered = 'true';
        return renderState.getText();
      },
      getText() {
        return renderState.getText();
      }
    };
  };

  const streamMarkdownResponse = async (
    targetElement,
    streamApiCallFn,
    signal,
    options = {}
  ) => {
    let streamError = null;
    let renderer = null;
    if (options.placeholderHTML) {
      targetElement.innerHTML = options.placeholderHTML;
      targetElement.classList.remove('typing-cursor');
      targetElement.classList.add('is-streaming-response');
    }
    const ensureRenderer = () => {
      if (!renderer) {
        renderer = createStreamingMarkdownRenderer(targetElement, options);
      }
      return renderer;
    };

    const frameQueue = createStreamingTextFrameQueue({
      drainText: (chunkToRender) => ensureRenderer().appendText(chunkToRender),
      onFirstChunk: () => options.onFirstChunk?.(),
      scheduleFrame,
      waitForFrame
    });

    try {
      await streamApiCallFn((chunk) => {
        frameQueue.enqueue(chunk);
      });
    } catch (error) {
      logError('Stream API call failed:', error);
      streamError = error;
      if (error.name !== 'AbortError' && !signal?.aborted) {
        targetElement.classList.remove('is-streaming-response');
        targetElement.innerHTML = renderMarkdown(getStreamErrorText(error));
        throw error;
      }
    } finally {
      await frameQueue.flushUntilIdle();
      if (renderer) {
        renderer.finish({ renderFormulas: true });
      } else {
        targetElement.classList.remove('is-streaming-response');
        targetElement.dataset.streamRendered = 'true';
        if (!streamError || streamError.name === 'AbortError' || signal?.aborted) {
          targetElement.innerHTML = '';
        }
      }
    }

    return renderer?.getText() || '';
  };

  return {
    createStreamingMarkdownRenderer,
    streamMarkdownResponse
  };
}
