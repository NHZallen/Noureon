import { createStreamingMarkdownRenderState } from './streaming-markdown-render-state.js';
import { createStreamingTextFrameQueue } from './streaming-text-frame-queue.js';
import {
  findTrailingStreamingChart,
  findTrailingStreamingTable
} from './streaming-structured-blocks.js';
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
  getStreamingText = (_key, fallback) => fallback,
  getStreamErrorText = (error) => `抱歉，發生錯誤：${error.message}`,
  logError = (...args) => console.error(...args)
}) {
  const hasRenderableFormula = (text = '') => (
    /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([^\n]+?\\\]|(?<!\\)\$(?!\$)[^$\n]+?(?<!\\)\$/.test(text)
    || /\\(?:approx|cdot|div|frac|geq?|int|leq?|neq|pm|prod|sqrt|sum|text|times)\b/.test(text)
  );

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
    let currentLineUsesFormulaRenderer = false;
    let currentPresentationMode = 'fade';
    let lastFinalizedRenderKey = null;
    let lastCurrentRenderKey = null;

    const createStatusMarkup = (kind, label) => {
      const status = document.createElement('div');
      const indicator = document.createElement('span');
      const text = document.createElement('span');
      status.className = `streaming-structured-pending streaming-${kind}-pending`;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      indicator.className = 'streaming-structured-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      text.textContent = label;
      status.append(indicator, text);
      return status.outerHTML;
    };

    const getStableBlockSignature = (node) => {
      if (node.matches?.('.ac-chart[data-chart-payload]')) {
        return `chart:${node.dataset.chartPayload || ''}`;
      }
      if (node.matches?.('.table-scroll-container')) {
        return `table:${node.innerHTML}`;
      }
      return '';
    };

    const transplantStableRichBlocks = (nextRoot) => {
      const stableBlocks = new Map();
      [finalizedNode, currentLineNode].forEach((renderRoot) => {
        renderRoot.querySelectorAll('.ac-chart[data-chart-payload], .table-scroll-container').forEach((node) => {
          const signature = getStableBlockSignature(node);
          const entries = stableBlocks.get(signature) || [];
          entries.push(node);
          stableBlocks.set(signature, entries);
        });
      });
      nextRoot.querySelectorAll('.ac-chart[data-chart-payload], .table-scroll-container').forEach((node) => {
        const entries = stableBlocks.get(getStableBlockSignature(node));
        const existing = entries?.shift();
        if (existing) node.replaceWith(existing);
      });
    };

    const setFinalizedHTML = (html, renderKey) => {
      if (lastFinalizedRenderKey === renderKey) return;
      const nextRoot = document.createElement('div');
      nextRoot.innerHTML = html;
      transplantStableRichBlocks(nextRoot);
      finalizedNode.replaceChildren(...nextRoot.childNodes);
      lastFinalizedRenderKey = renderKey;
    };

    const setCurrentHTML = (html, renderKey, mode = 'structured') => {
      if (lastCurrentRenderKey === renderKey && currentPresentationMode === mode) return;
      currentLineNode.innerHTML = html;
      lastCurrentRenderKey = renderKey;
      currentPresentationMode = mode;
      currentLineUsesFormulaRenderer = false;
    };

    const prepareRenderText = (text = '') => {
      let renderText = preserveCouncilDetails
        ? normalizeCouncilComparisonDetails(text)
        : text;
      if (preserveCouncilDetails && hasUnclosedCouncilDetails(renderText)) {
        renderText += '\n\n</details>';
      }
      return renderText;
    };

    const renderTextToHTML = (text, renderFormulas = true) => {
      const renderText = prepareRenderText(text);
      return {
        html: renderFormulas ? renderMarkdownWithFormulas(renderText) : renderMarkdown(renderText),
        renderText
      };
    };

    const renderFinalized = (renderFormulas = false) => {
      const openKeys = preserveCouncilDetails ? getOpenCouncilDetailKeys(finalizedNode) : null;
      const finalizedText = renderState.getFinalizedText();
      const { html, renderText } = renderTextToHTML(finalizedText, renderFormulas);
      setFinalizedHTML(html, `${renderFormulas ? 'formula' : 'markdown'}:${renderText}`);
      restoreOpenCouncilDetails(finalizedNode, openKeys);
    };

    const renderStablePrefix = (prefix = '') => {
      const openKeys = preserveCouncilDetails ? getOpenCouncilDetailKeys(finalizedNode) : null;
      const { html, renderText } = renderTextToHTML(prefix, true);
      setFinalizedHTML(html, `formula:${renderText}`);
      restoreOpenCouncilDetails(finalizedNode, openKeys);
    };

    const getRenderedChartPresentation = (chartBlock) => {
      const closingFence = chartBlock.fence[0].repeat(Math.max(3, chartBlock.fence.length));
      const needsNewline = chartBlock.source && !chartBlock.source.endsWith('\n');
      const candidate = `${chartBlock.fence}${chartBlock.language}\n${chartBlock.source}${needsNewline ? '\n' : ''}${closingFence}`;
      const html = renderMarkdownWithFormulas(candidate);
      const probe = document.createElement('div');
      probe.innerHTML = html;
      const chart = probe.querySelector('.ac-chart[data-chart-payload]');
      if (!chart) return null;
      return {
        html,
        key: `chart:${chart.dataset.chartPayload || chartBlock.source}`
      };
    };

    const renderStructuredSnapshot = () => {
      const fullText = renderState.getText();
      const chartBlock = findTrailingStreamingChart(fullText);
      if (chartBlock) {
        renderStablePrefix(chartBlock.prefix);
        const renderedChart = getRenderedChartPresentation(chartBlock);
        if (renderedChart) {
          setCurrentHTML(renderedChart.html, renderedChart.key);
        } else {
          setCurrentHTML(
            createStatusMarkup('chart', getStreamingText('chartGenerating', '圖表生成中…')),
            'chart:pending'
          );
        }
        return true;
      }

      const tableBlock = findTrailingStreamingTable(fullText);
      if (tableBlock) {
        renderStablePrefix(tableBlock.prefix);
        setCurrentHTML(
          createStatusMarkup('table', getStreamingText('tableGenerating', '表格生成中…')),
          'table:pending'
        );
        return true;
      }
      return false;
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
      const replaceStructuredPresentation = currentPresentationMode !== 'fade';
      if (patch.reset || replaceStructuredPresentation) {
        currentLineUsesFormulaRenderer = false;
        currentLineNode.innerHTML = '';
        lastCurrentRenderKey = null;
        currentPresentationMode = 'fade';
      }
      if (currentLineUsesFormulaRenderer || hasRenderableFormula(patch.currentLineText)) {
        setCurrentHTML(
          renderMarkdownWithFormulas(patch.currentLineText),
          `formula:${patch.currentLineText}`,
          'formula'
        );
        currentLineUsesFormulaRenderer = true;
        return;
      }
      if (patch.reset) {
        currentLineNode.innerHTML = '';
      }
      appendFadedText(replaceStructuredPresentation ? patch.currentLineText : patch.appendText);
      currentPresentationMode = 'fade';
    };

    const flushPendingLines = (force = false, renderFormulas = false) => {
      if (renderState.isFinalized()) return;
      const shouldStick = isChatNearBottom();
      const previousTop = getChatScrollTop();
      const flushResult = renderState.flushPending({ force });
      if (renderStructuredSnapshot()) {
        keepChatPositionAfterRender(shouldStick, previousTop);
        return;
      }
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
        flushPendingLines(false, true);
      },
      finish({ renderFormulas = true } = {}) {
        if (renderState.isFinalized()) return renderState.getText();
        flushPendingLines(true, renderFormulas);
        if (renderFormulas && renderState.getFinalizedText()) {
          const unfinishedChart = findTrailingStreamingChart(renderState.getText());
          if (unfinishedChart && !unfinishedChart.complete) {
            const prefix = renderTextToHTML(unfinishedChart.prefix, true).html;
            const renderedChart = getRenderedChartPresentation(unfinishedChart);
            const fallback = createStatusMarkup(
              'chart-error',
              getStreamingText('unableToRenderChart', '無法呈現圖表。')
            );
            setFinalizedHTML(
              `${prefix}${renderedChart?.html || fallback}`,
              `finished:${renderState.getText()}`
            );
          } else {
            renderFinalized(true);
          }
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
