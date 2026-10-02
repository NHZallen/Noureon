import assert from 'node:assert/strict';
import test from 'node:test';

import handler, { siteNameOf } from '../api/site-info.js';
import { siteIconDeps } from '../api/_site-fetch.js';

const respond = () => ({
  headers: {}, code: 0, body: null,
  setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  status(code) { this.code = code; return this; },
  json(value) { this.body = value; return this; },
  end(value) { this.body = value; return this; }
});

const withInternet = async (pages, run, { privateHosts = [] } = {}) => {
  const saved = { ...siteIconDeps };
  const asked = [];
  siteIconDeps.lookup = async (host) => [{ address: privateHosts.includes(host) ? '10.0.0.5' : '93.184.216.34', family: 4 }];
  siteIconDeps.fetch = async (url) => {
    asked.push(String(url));
    const found = pages[String(url)];
    return found === undefined ? new Response('', { status: 404 }) : new Response(found, { status: 200 });
  };
  try {
    await run(asked);
  } finally {
    Object.assign(siteIconDeps, saved);
  }
};

test('the name a page gives its site is read from what it says about itself, and nothing that is not a name', () => {
  assert.equal(siteNameOf('<meta property="og:site_name" content="Vercel">'), 'Vercel');
  assert.equal(siteNameOf("<meta content='Supabase &amp; Co' property='og:site_name'>"), 'Supabase & Co', 'attributes in any order, entities read');
  assert.equal(siteNameOf('<meta name="application-name" content="Docs"><meta name="apple-mobile-web-app-title" content="Other">'), 'Docs', 'the first that is given');
  assert.equal(siteNameOf('<meta name="apple-mobile-web-app-title" content="Short">'), 'Short');
  assert.equal(siteNameOf('<meta property="og:site_name" content="https://example.com/">'), '', 'an address is not a name');
  assert.equal(siteNameOf(`<meta property="og:site_name" content="${'x'.repeat(60)}">`), '', 'too long to be a name');
  assert.equal(siteNameOf('<title>Page - Site</title>'), '', 'a title is not the site\'s name');
  assert.equal(siteNameOf(''), '');
});

test('names of several sites come back in one answer, a site that says none is left out, and the answer is cached', async () => {
  await withInternet({
    'https://vercel.com/': '<meta property="og:site_name" content="Vercel">',
    'https://plain.example/': '<html>nothing</html>'
  }, async () => {
    const response = respond();
    await handler({ method: 'GET', query: { hosts: 'vercel.com,plain.example,gone.example' } }, response);
    assert.equal(response.code, 200);
    assert.deepEqual(response.body, { names: { 'vercel.com': 'Vercel' } });
    assert.match(response.headers['cache-control'], /s-maxage=86400/, 'asked again tomorrow when a site gave none');
    const full = respond();
    await handler({ method: 'GET', query: { hosts: 'vercel.com' } }, full);
    assert.match(full.headers['cache-control'], /s-maxage=604800/, 'a name is kept for a week');
  });
});

test('only public sites are read, and bad requests are answered quietly', async () => {
  await withInternet({ 'https://inside.example/': '<meta property="og:site_name" content="Secret">' }, async (asked) => {
    const response = respond();
    await handler({ method: 'GET', query: { hosts: 'inside.example,localhost,127.0.0.1,printer.local' } }, response);
    assert.deepEqual(response.body, { names: {} });
    assert.equal(asked.length, 0, 'nothing inside was asked');
    const none = respond();
    await handler({ method: 'GET', query: { hosts: '' } }, none);
    assert.equal(none.code, 400);
    const post = respond();
    await handler({ method: 'POST', query: { hosts: 'vercel.com' } }, post);
    assert.equal(post.code, 405);
    const many = respond();
    const hosts = Array.from({ length: 20 }, (_, index) => `site${index}.example`).join(',');
    await handler({ method: 'GET', query: { hosts } }, many);
    assert.equal(asked.length, 12, 'twelve sites at most in one request');
  }, { privateHosts: ['inside.example'] });
});
