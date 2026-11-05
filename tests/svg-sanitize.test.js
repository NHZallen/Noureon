import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeSvg, sanitizeSvgImages } from '../src/app/runtime/images/svg-sanitize.js';

// An SVG that a picture model made is read tag by tag and only what draws is written again: a script, an event handler, a link out of the picture or a picture from another site never gets through.

const clean = (input) => {
  const result = sanitizeSvg(input);
  assert.ok(result.ok, `${result.reason}: ${input}`);
  return result.svg;
};
const FORBIDDEN = [/<script/i, /\son[a-z]+\s*=/i, /javascript:/i, /<foreignObject/i, /<iframe/i, /<embed/i, /<object/i, /https?:/i, /<animate/i, /<set\b/i, /<!/];

test('a plain drawing is kept as it was, with the namespace on the root', () => {
  const svg = clean('<?xml version="1.0"?><!-- a comment --><svg viewBox="0 0 10 10" width="100"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/><path d="M0 0L10 10" stroke="red" stroke-width="2"/><text x="1" y="5">Hello &amp; bye</text></svg>');
  assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="100"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/><path d="M0 0L10 10" stroke="red" stroke-width="2"/><text x="1" y="5">Hello &amp; bye</text></svg>');
});

test('scripts, event handlers, foreign content and animations are left out', () => {
  const attacks = [
    '<svg><script>alert(1)</script><rect width="1" height="1"/></svg>',
    '<svg><script><![CDATA[alert(1)]]></script></svg>',
    '<svg onload="alert(1)"><rect onclick="alert(1)" width="1" height="1"/></svg>',
    '<svg><foreignObject><iframe src="https://evil.test"></iframe></foreignObject></svg>',
    '<svg><foreignObject><body onload="alert(1)"><script>alert(2)</script></body></foreignObject></svg>',
    '<svg><iframe src="javascript:alert(1)"/><embed src="x"/><object data="x"/></svg>',
    '<svg><a href="javascript:alert(1)"><rect width="1" height="1"/></a></svg>',
    '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><rect width="1" height="1"><animate attributeName="href" to="javascript:alert(1)"/></rect></svg>',
    '<svg><set attributeName="onmouseover" to="alert(1)"/><rect width="1" height="1"/></svg>',
    '<svg><html:script xmlns:html="http://www.w3.org/1999/xhtml">alert(1)</html:script></svg>',
    '<svg><SCRIPT>alert(1)</SCRIPT></svg>',
    '<svg><rect width="1" height="1" ONCLICK="alert(1)" OnMouseOver="alert(2)"/></svg>',
    '<svg><use href="https://evil.test/x.svg#a"/></svg>',
    '<svg><use xlink:href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>',
    '<svg><image href="https://evil.test/x.png" width="1" height="1"/></svg>',
    '<svg><image href="data:image/svg+xml;base64,PHN2Zy8+" width="1" height="1"/></svg>',
    '<svg><rect fill="url(https://evil.test/p#x)" width="1" height="1"/></svg>',
    '<svg><rect style="fill:red;background:url(https://evil.test/x)" width="1" height="1"/></svg>',
    '<svg><rect style="width:expression(alert(1))" width="1" height="1"/></svg>',
    '<svg><rect fill="ur&#x6c;(https://evil.test/x)" width="1" height="1"/></svg>',
    '<svg><a href="jav&#x61;script:alert(1)"><text>x</text></a></svg>',
    '<svg><style>@import url(https://evil.test/x.css);</style></svg>',
    '<svg><style>rect { fill: url(https://evil.test/x) }</style></svg>',
    '<svg><style>rect { fill: u\\72l(https://evil.test/x) }</style></svg>',
    '<svg><style><![CDATA[ </style><script>alert(1)</script> ]]></style></svg>',
    '<svg><rect width="1" height="1" xlink:onclick="alert(1)" xml:base="https://evil.test/"/></svg>',
    '<svg><text>&lt;script&gt;alert(1)&lt;/script&gt;</text></svg>'
  ];
  for (const attack of attacks) {
    const result = sanitizeSvg(attack);
    if (!result.ok) continue; // refused as a whole is as good
    // What is left of the markup with the values of the attributes taken out (a quoted value cannot do anything) and the one namespace that the root has.
    const markup = result.svg.replace(' xmlns="http://www.w3.org/2000/svg"', '').replace(/"[^"]*"/g, '""');
    for (const pattern of FORBIDDEN) assert.ok(!pattern.test(markup), `${pattern} survived in: ${attack}\n→ ${result.svg}`);
    // And no value that reaches out.
    for (const value of result.svg.match(/"[^"]*"/g) || []) assert.ok(!/javascript:|https?:|@import/i.test(value.replace('http://www.w3.org/2000/svg', '')), `a value reaches out in: ${attack}\n→ ${result.svg}`);
  }
});

test('the parts that are clean stay when the others go; links and pictures inside the picture are kept', () => {
  assert.equal(clean('<svg><script>x</script><circle cx="5" cy="5" r="3"/></svg>'), '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>');
  assert.equal(clean('<svg><a href="javascript:x"><text>hi</text></a></svg>'), '<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>');
  assert.equal(clean('<svg><defs><g id="a"><rect width="1" height="1"/></g></defs><use href="#a"/><use xlink:href="#a" x="2"/></svg>'), '<svg xmlns="http://www.w3.org/2000/svg"><defs><g id="a"><rect width="1" height="1"/></g></defs><use href="#a"/><use xlink:href="#a" x="2"/></svg>');
  assert.match(clean('<svg><image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/></svg>'), /<image href="data:image\/png;base64,iVBORw0KGgo="/);
  assert.match(clean('<svg><rect style="fill:url(#g);stroke:red" width="1" height="1"/></svg>'), /style="fill:url\(#g\);stroke:red"/);
  assert.match(clean('<svg><style>rect { fill: #f00; } .a { stroke: url(#g); }</style><rect width="1" height="1"/></svg>'), /<style>rect \{ fill: #f00; \} \.a \{ stroke: url\(#g\); \}<\/style>/);
});

test('a value is written again with its characters escaped, so it cannot close its own attribute or tag', () => {
  const svg = clean('<svg><text id="a&quot; onmouseover=&quot;alert(1)">x &lt;b&gt; y</text><rect width="1" height="1" id=\'a" onclick="x\'/></svg>');
  const names = svg.replace(/"[^"]*"/g, '""');
  assert.ok(!/\sonmouseover=/.test(names) && !/\sonclick=/.test(names), svg);
  assert.match(svg, /id="a&quot; onmouseover=&quot;alert\(1\)"/);
  assert.match(svg, /x &lt;b&gt; y/);
});

test('what cannot be read as clean markup is refused as a whole', () => {
  for (const bad of [
    '',
    'not svg at all',
    '<html><body>hi</body></html>',
    '<div><svg></svg></div>',
    '<svg><rect></svg>',
    '<svg></g></svg>',
    '<svg>',
    '<svg><!DOCTYPE svg [<!ENTITY x "y">]></svg>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://evil.test/x.dtd"><svg/>',
    '<!ENTITY lol "lol"><svg/>',
    '<svg><rect width="1" height="1" fill=red/></svg>',
    '<svg/><svg/>',
    '<svg><rect width="1"'
  ]) assert.equal(sanitizeSvg(bad).ok, false, `refused: ${bad}`);
  assert.equal(sanitizeSvg(null).ok, false);
  assert.equal(sanitizeSvg(`<svg>${'<g>'.repeat(200)}${'</g>'.repeat(200)}</svg>`).ok, false, 'too deep');
  assert.equal(sanitizeSvg(`<svg>${'<g/>'.repeat(25_000)}</svg>`).ok, false, 'too many elements');
  assert.equal(sanitizeSvg(`<svg>${'x'.repeat(2_100_000)}</svg>`).ok, false, 'too big');
});

test('the pictures of a maker: an SVG is made safe in place, a refused one is left out, the others stay', () => {
  const b64 = (text) => Buffer.from(text).toString('base64');
  const read = (image) => Buffer.from(image.b64Json, 'base64').toString('utf8');
  const { images, refused } = sanitizeSvgImages([
    { b64Json: 'PNGDATA', mediaType: 'image/png' },
    { b64Json: b64('<svg><script>alert(1)</script><rect width="1" height="1"/></svg>'), mediaType: 'image/svg+xml', aspectRatio: '1:1' },
    { b64Json: b64('<html>'), mediaType: 'image/svg+xml' }
  ]);
  assert.equal(refused, 1);
  assert.equal(images.length, 2);
  assert.deepEqual(images[0], { b64Json: 'PNGDATA', mediaType: 'image/png' });
  assert.equal(read(images[1]), '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
  assert.equal(images[1].aspectRatio, '1:1', 'what else came with the picture stays');
  // Text outside the plain letters survives the round trip.
  const round = sanitizeSvgImages([{ b64Json: Buffer.from('<svg><text>圖片 ✓ é</text></svg>').toString('base64'), mediaType: 'image/svg+xml' }]);
  assert.match(read(round.images[0]), /圖片 ✓ é/);
});

test('whatever is put together from pieces of markup, what is let through holds no script, no handler and no address', () => {
  const pieces = ['<svg>', '</svg>', '<g>', '</g>', '<script>', '</script>', 'alert(1)', '<rect width="1" height="1"', '/>', '>', ' onclick="x"', ' href="javascript:x"', ' xlink:href="https://e.test"', '<a ', '</a>', '<![CDATA[', ']]>',
    '<style>', '</style>', 'rect{fill:url(https://e.test)}', '<foreignObject>', '</foreignObject>', '<!--', '-->', '&amp;', '&#x3c;script&#x3e;', '&lt;', '"', "'", '=', ' ', '<use href="#a"/>', '<image href="https://e.test/p.png"/>',
    '<animate attributeName="href" to="javascript:x"/>', '<svg onload="x()">', '<text>', '</text>', ' style="fill:url(https://e.test)"', '<?xml version="1.0"?>', '<!DOCTYPE x>', '<x:y>', '</x:y>', ' fill="ur&#x6c;(https://e.test)"'];
  let seed = 20261106;
  const next = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed; };
  let accepted = 0;
  for (let run = 0; run < 20000; run += 1) {
    const length = 3 + (next() % 14);
    const input = Array.from({ length }, () => pieces[next() % pieces.length]).join('');
    const result = sanitizeSvg(`<svg>${input}</svg>`);
    if (!result.ok) continue;
    accepted += 1;
    // Only the tags count: a text that looks like markup has its `<` written as an entity and is only text. The values of the attributes are taken out (a quoted value cannot do anything).
    const tags = (result.svg.replace(/<style>[\s\S]*?<\/style>/g, '<style></style>').match(/<[^<>]*>/g) || []).join('').replace(' xmlns="http://www.w3.org/2000/svg"', '').replace(/"[^"]*"/g, '""');
    for (const pattern of [/<script/i, /\son[a-z]+\s*=/i, /<foreignObject/i, /<iframe/i, /<animate/i, /<set\b/i, /<!/, /<\?/, /<[A-Za-z]*:/]) assert.ok(!pattern.test(tags), `${pattern} in ${result.svg} (from ${input})`);
    // The values of the attributes (inside the tags: a text that looks like one is only text, its `<` and `>` are written as entities).
    for (const tag of result.svg.match(/<[^<>]*>/g) || []) {
      for (const value of tag.match(/="[^"]*"/g) || []) assert.ok(!/javascript:|https?:\/\/(?!www\.w3\.org)|@import/i.test(value), `a value reaches out in ${result.svg} (from ${input})`);
    }
    for (const style of result.svg.match(/<style>[\s\S]*?<\/style>/g) || []) assert.ok(!/url\((?!#)|@import|\\/i.test(style), `a style reaches out in ${result.svg}`);
  }
  assert.ok(accepted > 500, `enough of the pieces were accepted to mean something (${accepted})`);
});
