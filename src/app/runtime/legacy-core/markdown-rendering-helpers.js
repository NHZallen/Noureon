export function createMarkdownRenderingHelpers({
  marked,
  sanitizer,
  DOMParser,
  katex,
  getUiLanguage,
  logger
}) {
  function renderMarkdown(text) {
    const thinkingLabel = getUiLanguage() === 'en' ? 'Model thinking process' : '模型思考過程';
    const normalizedText = String(text || '').replace(/<think>([\s\S]*?)<\/think>/gi, (_, content) => {
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

    return documentFragment.body.innerHTML;
  }

  function renderMarkdownWithFormulas(text) {
    let html = renderMarkdown(text);

    html = html.replace(/<p>\$\$(.*)\$\$<\/p>/g, (match, formula) => {
      try {
        const decodedFormula = new DOMParser().parseFromString(formula, 'text/html').documentElement.textContent;
        return katex.renderToString(decodedFormula, {
          displayMode: true,
          throwOnError: false
        });
      } catch (error) {
        logger.error('KaTeX block rendering error:', error);
        return `<p style="color: red;">[數學公式渲染錯誤: ${formula}]</p>`;
      }
    });

    html = html.replace(/\$(.*?)\$/g, (match, formula) => {
      if (match.includes('<') || match.includes('>')) return match;
      try {
        const decodedFormula = new DOMParser().parseFromString(formula, 'text/html').documentElement.textContent;
        return katex.renderToString(decodedFormula, {
          displayMode: false,
          throwOnError: false
        });
      } catch (error) {
        logger.error('KaTeX inline rendering error:', error);
        return `<span style="color: red;">[公式錯誤: ${formula}]</span>`;
      }
    });

    return html;
  }

  return { renderMarkdown, renderMarkdownWithFormulas };
}
