// The page's own text-to-HTML path, bundled for a browser (tests/browser/markup-injection.e2e.js): the same marked, DOMPurify and KaTeX the app loads.
import DOMPurify from 'dompurify';
import katex from 'katex';
import { marked } from 'marked';

import { createMarkdownRenderingHelpers } from '../../../src/app/runtime/shell/markdown-rendering-helpers.js';
import { formatSandboxRunBlock } from '../../../src/app/ui/sandbox/sandbox-run-block.js';
import { renderUserText } from '../../../src/app/runtime/shell/shell-utilities.js';

const { renderMarkdown, renderMarkdownWithFormulas } = createMarkdownRenderingHelpers({
  marked, sanitizer: DOMPurify, DOMParser, katex, getUiLanguage: () => 'en', logger: console
});

window.markup = { renderMarkdown, renderMarkdownWithFormulas, formatSandboxRunBlock, renderUserText, sanitize: (html) => DOMPurify.sanitize(html) };
