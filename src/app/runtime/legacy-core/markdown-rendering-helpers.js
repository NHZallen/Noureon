import { applyChartMarkdownPlaceholders } from '../../ui/charts/chart-markdown-placeholders.js';
import { mountChartPlaceholders } from '../../ui/charts/chart-renderer.js';
import { getRuntimeTexts } from '../i18n/runtime-texts.js';

export function createMarkdownRenderingHelpers({
  marked,
  sanitizer,
  DOMParser,
  katex,
  getUiLanguage,
  getText = (_key, fallback) => fallback,
  logger
}) {
  const mathCommandPattern = /\\(?:approx|cdot|div|frac|geq?|int|leq?|neq|pm|prod|sqrt|sum|text|times)\b/;

  function decodeFormula(formula) {
    return new DOMParser().parseFromString(String(formula || ''), 'text/html').documentElement.textContent;
  }

  function normalizeDoubleEscapedTex(text) {
    return String(text || '').replace(/\\\\(?=\[|\]|\(|\)|[A-Za-z])/g, '\\');
  }

  function getDisplayFormulaBreakpoints(formula) {
    const breakpoints = [];
    let braceDepth = 0;
    let delimiterDepth = 0;
    for (let index = 0; index < formula.length; index += 1) {
      const char = formula[index];
      if (char === '{') braceDepth += 1;
      if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
      if (braceDepth > 0) continue;
      if (char === '(' || char === '[') delimiterDepth += 1;
      if (char === ')' || char === ']') delimiterDepth = Math.max(0, delimiterDepth - 1);
      if (delimiterDepth > 0) continue;

      if (char === '\\') {
        const command = /^\\[A-Za-z]+/.exec(formula.slice(index))?.[0] || '';
        if (/^\\(?:approx|geq?|leq?|neq|prod|sim|sum)$/.test(command) && index > 0) {
          breakpoints.push(index);
        }
        index += Math.max(0, command.length - 1);
        continue;
      }
      if (/[=+\-]/.test(char) && index > 0) {
        breakpoints.push(index);
      }
    }
    return breakpoints;
  }

  function splitDisplayFormula(formula, targetLength = 56) {
    const source = String(formula || '').trim();
    if (source.length <= targetLength) return [source];
    const breakpoints = getDisplayFormulaBreakpoints(source);
    if (!breakpoints.length) return [source];

    const chunks = [];
    let start = 0;
    while (source.length - start > targetLength) {
      const minimum = start + Math.floor(targetLength * 0.48);
      const preferred = breakpoints.filter((point) => point >= minimum && point <= start + targetLength).at(-1);
      const fallback = breakpoints.find((point) => point > start + targetLength && point <= start + Math.floor(targetLength * 1.45));
      const early = breakpoints.filter((point) => point > start && point < minimum).at(-1);
      const end = preferred ?? fallback ?? early;
      if (!end || end <= start) break;
      chunks.push(source.slice(start, end).trim());
      start = end;
    }
    chunks.push(source.slice(start).trim());
    return chunks.filter(Boolean);
  }

  function protectCodeSpans(text) {
    const codeSpans = [];
    const protectedText = String(text || '').replace(
      /```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^\n]*?`+/g,
      (code) => {
        const token = `NOURA_CODE_TOKEN_${codeSpans.length}_END`;
        codeSpans.push(code);
        return token;
      }
    );
    return {
      protectedText,
      restore: (value) => codeSpans.reduce(
        (result, code, index) => result.replace(`NOURA_CODE_TOKEN_${index}_END`, code),
        value
      )
    };
  }

  function findBareFormulaEnd(line, startIndex) {
    let braceDepth = 0;
    for (let index = startIndex; index < line.length; index += 1) {
      const char = line[index];
      if (char === '{') braceDepth += 1;
      if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
      if (braceDepth === 0 && /[，。；！？]/.test(char) && /[\u3400-\u9fff]/.test(line.slice(index + 1))) {
        return index;
      }
    }
    return line.length;
  }

  function normalizeBareTexLines(text) {
    return String(text || '').split('\n').map((line) => {
      if (
        !mathCommandPattern.test(line)
        || /NOURA_CODE_TOKEN_\d+_END/.test(line)
        || /\$\$|\\\[|\\\]|\\\(|\\\)/.test(line)
      ) {
        return line;
      }

      const commandIndex = line.search(mathCommandPattern);
      const leadingText = line.slice(0, commandIndex);
      const leadingMath = /[A-Za-z0-9.,{}()[\]+\-*/=<>^_]\s*(?:[A-Za-z0-9.,{}()[\]+\-*/=<>^_]\s*)*$/.exec(leadingText);
      const formulaStart = leadingMath?.index ?? commandIndex;
      const formulaEnd = findBareFormulaEnd(line, formulaStart);
      const candidate = line.slice(formulaStart, formulaEnd).trim();
      if (!candidate || (!/[0-9]/.test(candidate) && !/\\(?:frac|int|prod|sqrt|sum)\b/.test(candidate))) {
        return line;
      }

      const candidateOffset = line.slice(formulaStart, formulaEnd).indexOf(candidate);
      const start = formulaStart + Math.max(0, candidateOffset);
      return `${line.slice(0, start)}\\(${candidate}\\)${line.slice(formulaEnd)}`;
    }).join('\n');
  }

  function extractFormulaTokens(text) {
    const formulas = [];
    const { protectedText, restore } = protectCodeSpans(text);
    let markdown = normalizeBareTexLines(normalizeDoubleEscapedTex(protectedText));
    const replaceFormula = (displayMode) => (_match, formula) => {
      const token = `NOURA_MATH_TOKEN_${formulas.length}_END`;
      formulas.push({ displayMode, formula });
      return token;
    };

    markdown = markdown
      .replace(/\$\$([\s\S]+?)\$\$/g, replaceFormula(true))
      .replace(/\\\[([\s\S]+?)\\\]/g, replaceFormula(true))
      .replace(/\\\(([^\n]+?)\\\)/g, replaceFormula(false))
      .replace(/(?<!\\)\$(?!\$)([^$\n]+?)(?<!\\)\$/g, replaceFormula(false));

    return { formulas, markdown: restore(markdown) };
  }

  function renderFormula({ displayMode, formula }) {
    try {
      const normalizedFormula = normalizeDoubleEscapedTex(decodeFormula(formula));
      const displayChunks = displayMode ? splitDisplayFormula(normalizedFormula) : [normalizedFormula];
      if (displayMode && displayChunks.length > 1) {
        const lines = displayChunks.map((chunk) => (
          `<span class="katex-display-line">${katex.renderToString(chunk, {
            displayMode: false,
            throwOnError: false
          })}</span>`
        )).join('');
        return `<div class="katex-display katex-display-responsive">${lines}</div>`;
      }
      return katex.renderToString(normalizedFormula, {
        displayMode,
        throwOnError: false
      });
    } catch (error) {
      logger.error(displayMode ? 'KaTeX block rendering error:' : 'KaTeX inline rendering error:', error);
      const label = displayMode ? '數學公式渲染錯誤' : '公式錯誤';
      const element = displayMode ? 'p' : 'span';
      return `<${element} style="color: red;">[${label}: ${formula}]</${element}>`;
    }
  }

  function renderMarkdown(text) {
    const runtimeTexts = getRuntimeTexts(getUiLanguage());
    const thinkingLabel = runtimeTexts.modelThinkingProcess;
    const normalizedText = String(text || '')
      .replace(/(\d)~(?=\d)/g, '$1–')
      .replace(/<think>([\s\S]*?)<\/think>/gi, (_, content) => {
      return `\n\n<details class="thinking-collapse"><summary>${thinkingLabel}</summary>\n\n${content.trim()}\n\n</details>\n\n`;
      });
    const dirty = marked.parse(normalizedText);
    const clean = sanitizer.sanitize(dirty);
    const documentFragment = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html');

    documentFragment.body.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.classList.contains('table-scroll-container')) return;
      const wrapper = documentFragment.createElement('div');
      wrapper.className = 'table-scroll-container';
      table.replaceWith(wrapper);
      wrapper.appendChild(table);
    });

    applyChartMarkdownPlaceholders({
      document: documentFragment,
      root: documentFragment.body,
      messageRole: 'assistant',
      chartLabel: getText('chart', runtimeTexts.chart)
    });

    mountChartPlaceholders({
      root: documentFragment.body,
      messageRole: 'assistant',
      chartLabel: getText('chart', runtimeTexts.chart)
    });

    return documentFragment.body.innerHTML;
  }

  function renderMarkdownWithFormulas(text) {
    const { formulas, markdown } = extractFormulaTokens(text);
    let html = renderMarkdown(markdown);

    formulas.forEach((entry, index) => {
      const token = `NOURA_MATH_TOKEN_${index}_END`;
      const formulaHTML = renderFormula(entry);
      if (entry.displayMode) {
        html = html.replace(new RegExp(`<p>\\s*${token}\\s*</p>`, 'g'), formulaHTML);
      }
      html = html.replaceAll(token, formulaHTML);
    });

    return html;
  }

  return { renderMarkdown, renderMarkdownWithFormulas };
}
