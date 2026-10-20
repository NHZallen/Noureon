// How a reply's words appear (part of submit-input-council-lifecycle.js): streamed as they come, typed out from a whole text, or as
// Markdown drawn while it grows, the conversation following them down unless the reader has scrolled up.

import { followTop, setScrollTopQuietly } from '../../ui/motion/reader-scroll-guard.js';
import { createStreamingMarkdownFeature } from '../../legacy-runtime/features/streaming-markdown-renderer.js';
import { createStreamingTextFrameQueue } from '../../legacy-runtime/features/streaming-text-frame-queue.js';
import { createTypewriterPlaybackController } from '../../legacy-runtime/features/typewriter-playback-controller.js';
import { getOpenCouncilDetailKeys, restoreOpenCouncilDetails } from '../../legacy-runtime/features/streaming-council-details.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';
import { createChatScrollPosition } from '../features/chat-scroll-position.js';

export function createSubmitInputPlayback({
  document, elements: ALL_ELEMENTS, renderMarkdown, renderMarkdownWithFormulas, getUiLanguage, getLocalizedText,
  requestAnimationFrame, scheduleTimeout, logger
}) {
  const isCouncilDeferredSectionVisible = (text = '') => /<details\b|共識與差異整理|模型理事會紀錄|Model council record|Compte rendu du conseil/i.test(String(text || ''));
  async function typewriterStream(targetElement, streamApiCallFn, signal) {
    let fullText = '';
    targetElement.innerHTML = '';
    targetElement.classList.add('typing-cursor');
    const typewriterFrameQueue = createStreamingTextFrameQueue({
      drainText: (chunkToRender) => {
        fullText += chunkToRender;
        const fragment = document.createDocumentFragment();
        for (const char of chunkToRender) {
          const span = document.createElement('span');
          span.className = 'fade-in-char';
          if (char === '\n') {
            fragment.appendChild(document.createElement('br'));
          } else {
            span.textContent = char;
            fragment.appendChild(span);
          }
        }
        targetElement.appendChild(fragment);
        const chatContainer = ALL_ELEMENTS.chatContainer;
        const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
        if (isNearBottom) setScrollTopQuietly(chatContainer, followTop(chatContainer));
      },
      scheduleFrame: (callback) => requestAnimationFrame(callback),
      waitForFrame: () => new Promise((resolve) => scheduleTimeout(resolve, 16))
    });
    try {
      await streamApiCallFn((chunk) => typewriterFrameQueue.enqueue(chunk));
    } catch (error) {
      logger.error?.('Stream API call failed:', error);
      targetElement.innerHTML = renderMarkdown(getLocalizedText('streamCallFailed').replace('{message}', error.message));
      throw error;
    } finally {
      await typewriterFrameQueue.flushUntilIdle();
      targetElement.classList.remove('typing-cursor');
      targetElement.innerHTML = renderMarkdownWithFormulas(fullText);
    }
    return fullText;
  }

  const renderIncrementalResponse = (targetElement, text, options = {}) => {
    const openKeys = options.preserveCouncilDetails ? getOpenCouncilDetailKeys(targetElement) : null;
    targetElement.innerHTML = renderMarkdownWithFormulas(`${text}${!options.final && options.cursor ? '|' : ''}`);
    restoreOpenCouncilDetails(targetElement, openKeys);
  };

  const playbackTypewriterResponse = (targetElement, fullResponse, signal, preserveCouncilDetails = false) => new Promise((resolve) => {
    targetElement.innerHTML = '';
    const playbackController = createTypewriterPlaybackController({
      text: fullResponse,
      signal,
      schedule: (callback, delay) => scheduleTimeout(callback, delay),
      onStep: ({ currentText }) => {
        renderIncrementalResponse(targetElement, currentText, { cursor: true, preserveCouncilDetails });
        const chatContainer = ALL_ELEMENTS.chatContainer;
        const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
        const pauseCouncilAutoScroll = preserveCouncilDetails && isCouncilDeferredSectionVisible(currentText);
        if (!pauseCouncilAutoScroll && isNearBottom) {
          setScrollTopQuietly(chatContainer, followTop(chatContainer));
        }
      },
      onFinish: () => {
        renderIncrementalResponse(targetElement, fullResponse, { final: true, preserveCouncilDetails });
        resolve();
      }
    });
    playbackController.start();
  });

  const { isChatNearBottom, keepChatPositionAfterRender } = createChatScrollPosition(ALL_ELEMENTS);

  const {
    createStreamingMarkdownRenderer,
    streamMarkdownResponse
  } = createStreamingMarkdownFeature({
    document,
    renderMarkdown,
    renderMarkdownWithFormulas,
    isChatNearBottom,
    getChatScrollTop: () => ALL_ELEMENTS.chatContainer?.scrollTop || 0,
    keepChatPositionAfterRender,
    scheduleFrame: (callback) => requestAnimationFrame(callback),
    waitForFrame: () => new Promise((resolve) => scheduleTimeout(resolve, 16)),
    getStreamingText: (key, fallback) => getRuntimeText(getUiLanguage(), key) || fallback,
    getStreamErrorText: (error) => getLocalizedText('streamResponseFailed').replace('{message}', error.message),
    getUiLanguage,
    logError: (...args) => logger.error?.(...args)
  });

  const playbackStreamingMarkdownResponse = (targetElement, fullResponse, signal, preserveCouncilDetails = false) => new Promise((resolve) => {
    const renderer = createStreamingMarkdownRenderer(targetElement, { preserveCouncilDetails });
    const playbackController = createTypewriterPlaybackController({
      text: fullResponse,
      signal,
      schedule: (callback, delay) => scheduleTimeout(callback, delay),
      getStep: ({ source, currentIndex }) => source.includes('```', Math.max(0, currentIndex - 3)) ? 5 : 1,
      onStep: ({ chunk }) => {
        renderer.appendText(chunk);
      },
      onFinish: () => {
        renderer.finish({ renderFormulas: true });
        resolve();
      }
    });
    playbackController.start();
  });
  return {
    typewriterStream,
    renderIncrementalResponse,
    playbackTypewriterResponse,
    playbackStreamingMarkdownResponse,
    createStreamingMarkdownRenderer,
    streamMarkdownResponse
  };
}
