import assert from 'node:assert/strict';
import test from 'node:test';

import { declaredLanguage, highlightCode, installHighlightStyles } from '../../src/app/ui/code/code-highlighter.js';
import { installCodeHighlighting } from '../../src/app/ui/code/code-highlighting.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('code is coloured by its declared language, escaped, and plain text stays plain', () => {
  const { document, cleanup } = createDom('<pre><code class="language-python">def f(x):\n    return "&lt;b&gt;" # note</code></pre><pre><code class="language-text">plain words</code></pre><pre><code>just some words here</code></pre>');
  try {
    const [python, text, unknown] = document.querySelectorAll('code');
    assert.equal(declaredLanguage(python), 'python');
    assert.equal(highlightCode(python), true);
    assert.ok(python.querySelector('.hljs-keyword'), 'def is a keyword');
    assert.ok(python.querySelector('.hljs-string'));
    assert.ok(python.querySelector('.hljs-comment'));
    assert.equal(python.querySelector('b'), null, 'text is escaped, never markup');
    assert.equal(python.textContent, 'def f(x):\n    return "<b>" # note', 'the text itself is unchanged');
    assert.equal(highlightCode(python), false, 'each block is coloured once');
    assert.equal(highlightCode(text), false);
    assert.equal(text.innerHTML, 'plain words');
    assert.equal(highlightCode(unknown), false, 'an unconfident guess leaves prose alone');
    installHighlightStyles(document);
    installHighlightStyles(document);
    const styles = document.querySelectorAll('#noureon-code-highlight');
    assert.equal(styles.length, 1);
    assert.match(styles[0].textContent, /\.prose pre code \.hljs-keyword, [^{]*\{ color: #569CD6; \}/, 'Dark+ in chat');
    assert.match(styles[0].textContent, /\.ac-file-preview-source code \.hljs-keyword, [^{]*\{ color: #0000FF; \}/, 'Light+ in the source view');
  } finally {
    cleanup();
  }
});

test('new code blocks are coloured as they appear, except the line still streaming', async () => {
  const { document, window, cleanup } = createDom('<div id="list"></div>');
  try {
    const seen = [];
    const stop = installCodeHighlighting({
      document,
      window,
      root: document.getElementById('list'),
      load: async () => ({ installHighlightStyles: () => seen.push('styles'), highlightCode: (code) => { code.dataset.highlighted = 'true'; seen.push(code.textContent); } })
    });
    document.getElementById('list').innerHTML = '<pre><code>let a = 1;</code></pre><div class="streaming-current-line"><pre><code>let b</code></pre></div>';
    await wait(200);
    assert.deepEqual(seen, ['styles', 'let a = 1;']);
    stop();
  } finally {
    cleanup();
  }
});
