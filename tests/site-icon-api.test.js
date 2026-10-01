import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';

import handler, { cleanHost, iconLinks, isPrivateAddress, siteIconDeps, sniffImage } from '../api/site-icon.js';
import { putFirstSiteIcon, watchSourceIcons } from '../src/app/ui/sandbox/run-sources.js';
import { siteIconUrl } from '../src/app/ui/links/site-icon.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

const respond = () => {
  const response = {
    headers: {}, code: 0, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    status(code) { this.code = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; }
  };
  return response;
};

// A made-up internet: pages and files by address, each answering with a status, a body and maybe a redirect.
const withInternet = async (pages, run, { privateHosts = [] } = {}) => {
  const saved = { ...siteIconDeps };
  const asked = [];
  siteIconDeps.lookup = async (host) => [{ address: privateHosts.includes(host) ? '10.0.0.5' : '93.184.216.34', family: 4 }];
  siteIconDeps.fetch = async (url) => {
    const address = String(url);
    asked.push(address);
    const found = pages[address];
    if (!found) return new Response('', { status: 404 });
    if (found.redirect) return new Response('', { status: 302, headers: { location: found.redirect } });
    return new Response(found.body, { status: 200 });
  };
  try {
    await run(asked);
  } finally {
    Object.assign(siteIconDeps, saved);
  }
};

test('only public site names are served: no addresses, local names, ports or paths', () => {
  assert.equal(cleanHost('Example.com'), 'example.com');
  assert.equal(cleanHost('news.sciencenet.cn'), 'news.sciencenet.cn');
  for (const bad of ['', 'localhost', '127.0.0.1', '10.0.0.1', '[::1]', 'printer.local', 'a.internal', 'example.com:8080', 'example.com/x', 'user@example.com', 'nodots', 'a b.com']) {
    assert.equal(cleanHost(bad), '', bad);
  }
  for (const address of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.equal(isPrivateAddress(address), true, address);
  for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) assert.equal(isPrivateAddress(address), false, address);
});

test('a page\'s icons are ranked: near 32 pixels first, touch icons after, the data ones and the unsaid skipped', () => {
  const html = `<head>
    <link rel="apple-touch-icon" href="/touch.png" sizes="180x180">
    <link rel="shortcut icon" href="/old.ico">
    <link rel='icon' type='image/png' sizes='32x32' href='/32.png'>
    <link rel="icon" sizes="192x192" href="https://cdn.example/192.png">
    <link rel="icon" href="data:image/png;base64,AAAA">
    <link rel="stylesheet" href="/site.css"></head>`;
  assert.deepEqual(iconLinks(html, 'https://example.com/a/b'), [
    'https://example.com/32.png', 'https://example.com/old.ico', 'https://cdn.example/192.png', 'https://example.com/touch.png'
  ]);
});

test('what a site sends is checked by its bytes, not by what it calls it', () => {
  assert.equal(sniffImage(PNG), 'image/png');
  assert.equal(sniffImage(Buffer.from([0, 0, 1, 0, 1, 0])), 'image/x-icon');
  assert.equal(sniffImage(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml');
  assert.equal(sniffImage(Buffer.from('<!doctype html><html><body>Not found</body></html>')), '');
  assert.equal(sniffImage(Buffer.from('')), '');
});

test('the icon is found in the page, falls back to /favicon.ico, follows redirects and is cached', async () => {
  await withInternet({
    'https://has-link.example/': { body: '<link rel="icon" href="/img/i.png">' },
    'https://has-link.example/img/i.png': { body: PNG },
    'https://no-link.example/': { body: '<html>no icons</html>' },
    'https://no-link.example/favicon.ico': { redirect: 'https://static.example/f.ico' },
    'https://static.example/f.ico': { body: Buffer.from([0, 0, 1, 0, 1, 0]) }
  }, async () => {
    const first = respond();
    await handler({ method: 'GET', query: { host: 'has-link.example' } }, first);
    assert.equal(first.code, 200);
    assert.equal(first.headers['content-type'], 'image/png');
    assert.match(first.headers['cache-control'], /s-maxage=604800/);
    assert.match(first.headers['content-security-policy'], /sandbox/);
    assert.deepEqual([...first.body], [...PNG]);
    const second = respond();
    await handler({ method: 'GET', query: { host: 'no-link.example' } }, second);
    assert.equal(second.code, 200);
    assert.equal(second.headers['content-type'], 'image/x-icon');
  });
});

test('a site without an icon, a page that is not a picture, and a bad name are answered quietly', async () => {
  await withInternet({
    'https://plain.example/': { body: '<link rel="icon" href="/x.png">' },
    'https://plain.example/x.png': { body: '<html>soft 404</html>' },
    'https://plain.example/favicon.ico': { body: '<html>soft 404</html>' }
  }, async () => {
    const none = respond();
    await handler({ method: 'GET', query: { host: 'plain.example' } }, none);
    assert.equal(none.code, 404);
    assert.match(none.headers['cache-control'], /s-maxage=86400/, 'asked again tomorrow, not each time');
    const bad = respond();
    await handler({ method: 'GET', query: { host: '127.0.0.1' } }, bad);
    assert.equal(bad.code, 400);
    const post = respond();
    await handler({ method: 'POST', query: { host: 'plain.example' } }, post);
    assert.equal(post.code, 405);
  });
});

test('a public site cannot send the server inward, by its name or by a redirect', async () => {
  await withInternet({
    'https://sneaky.example/': { redirect: 'http://inside.example/secret' },
    'https://sneaky.example/favicon.ico': { redirect: 'http://169.254.169.254/latest/meta-data' },
    'http://inside.example/secret': { body: PNG }
  }, async (asked) => {
    const response = respond();
    await handler({ method: 'GET', query: { host: 'sneaky.example' } }, response);
    assert.equal(response.code, 404);
    assert.equal(asked.some((url) => url.includes('inside.example') || url.includes('169.254')), false, 'nothing inside was asked');
  }, { privateHosts: ['inside.example'] });
  await withInternet({}, async (asked) => {
    const response = respond();
    await handler({ method: 'GET', query: { host: 'rebinds.example' } }, response);
    assert.equal(response.code, 404);
    assert.equal(asked.length, 0, 'a name that points inside is not asked at all');
  }, { privateHosts: ['rebinds.example'] });
});

test('the line\'s icon goes down the list of sites until one has an icon, and keeps it', () => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = '<div class="row"><span class="ledger-mark"></span></div>';
  const row = document.querySelector('.row');
  const stop = watchSourceIcons(document);
  const sources = ['a.example', 'b.example', 'c.example'].map((host) => ({ url: `https://${host}/page`, title: host }));
  putFirstSiteIcon(document, row, sources);
  const src = () => row.querySelector('.run-mark-site img')?.getAttribute('src');
  assert.equal(src(), siteIconUrl('a.example'), 'the first site first');
  row.querySelector('.run-mark-site img').dispatchEvent(new window.Event('error'));
  assert.equal(src(), siteIconUrl('b.example'), 'it had none: the second');
  const image = row.querySelector('.run-mark-site img');
  Object.defineProperty(image, 'naturalWidth', { value: 1, configurable: true });
  image.dispatchEvent(new window.Event('load'));
  assert.equal(src(), siteIconUrl('c.example'), 'a one-pixel stand-in is no icon: the third');
  Object.defineProperty(row.querySelector('.run-mark-site img'), 'naturalWidth', { value: 32, configurable: true });
  row.querySelector('.run-mark-site img').dispatchEvent(new window.Event('load'));
  assert.ok(row.querySelector('.run-mark-site').classList.contains('is-loaded'), 'the one that loads is kept');
  assert.equal(src(), siteIconUrl('c.example'));
  stop();
});

test('when every site on the list has no icon the globe stays, and a site that comes later is tried', () => {
  const window = new Window({ url: 'https://noureon.test/' });
  const { document } = window;
  document.body.innerHTML = '<div class="row"><span class="ledger-mark"></span></div>';
  const row = document.querySelector('.row');
  const stop = watchSourceIcons(document);
  const at = (host) => ({ url: `https://${host}/`, title: host });
  putFirstSiteIcon(document, row, [at('a.example'), at('b.example')]);
  row.querySelector('img').dispatchEvent(new window.Event('error'));
  row.querySelector('img').dispatchEvent(new window.Event('error'));
  assert.equal(row.querySelector('.run-mark-site img'), null, 'none had one: only the globe');
  putFirstSiteIcon(document, row, [at('a.example'), at('b.example'), at('c.example')]);
  assert.equal(row.querySelector('.run-mark-site img')?.getAttribute('src'), siteIconUrl('c.example'), 'the site that came later');
  stop();
});
