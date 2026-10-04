import assert from 'node:assert/strict';
import test from 'node:test';

import { NET_DEFAULT_ALLOW, effectiveNetPolicy, listNetSites, normalizeNetHost, normalizeNetMode, normalizeNetRules } from '../../src/data/cli-net.js';
import { getNetMode, netPolicyForRun, netRuleFor, rememberNetAnswer, removeNetSite, setNetMode, setNetRule } from '../../src/app/runtime/cli/net-state.js';
import { PERMISSION_TEXTS, permissionText } from '../../src/app/runtime/cli/permission-texts.js';

test('a site is kept in one form, and what is not a site name is refused', () => {
  assert.equal(normalizeNetHost(' PyPI.org. '), 'pypi.org');
  assert.equal(normalizeNetHost('bücher.example'), 'xn--bcher-kva.example');
  for (const bad of ['', 'a b', 'a/b', 'https://x.com', 'x.com:443', '1.2.3.4', '*.example.com', 'user@x.com', '-bad.com', null, 12]) assert.equal(normalizeNetHost(bad), '', String(bad));
  assert.equal(normalizeNetMode('always'), 'always');
  assert.equal(normalizeNetMode('whatever'), 'new');
  assert.deepEqual(normalizeNetRules({ 'X.com': 'deny', 'bad host': 'allow', 'y.com': 'maybe', 'z.com': 'ask', 'w.com': 'allow' }), { 'x.com': 'deny', 'z.com': 'ask', 'w.com': 'allow' });
  assert.deepEqual(normalizeNetRules([]), {});
  assert.deepEqual(normalizeNetRules(null), {});
});

test('what the proxy is given: the sites tools are made of are allowed at first, the person\'s rules come over them, "ask" takes a site back out', () => {
  const policy = effectiveNetPolicy({ mode: 'always', rules: { 'x.com': 'allow', 'github.com': 'deny', 'pypi.org': 'ask' } });
  assert.equal(policy.mode, 'always');
  assert.equal(policy.rules['x.com'], 'allow');
  assert.equal(policy.rules['github.com'], 'deny');
  assert.equal('pypi.org' in policy.rules, false);
  for (const host of NET_DEFAULT_ALLOW.filter((entry) => !['github.com', 'pypi.org'].includes(entry))) assert.equal(policy.rules[host], 'allow', host);
  assert.deepEqual(effectiveNetPolicy({}).mode, 'new');
});

test('the list of sites: the default ones first with their rule, then the person\'s own in order', () => {
  const sites = listNetSites({ 'zeta.example': 'deny', 'alpha.example': 'allow', 'pypi.org': 'ask' });
  assert.deepEqual(sites.slice(0, NET_DEFAULT_ALLOW.length).map((site) => site.host), [...NET_DEFAULT_ALLOW]);
  assert.equal(sites.find((site) => site.host === 'pypi.org').rule, 'ask');
  assert.equal(sites.find((site) => site.host === 'github.com').rule, 'allow');
  assert.deepEqual(sites.slice(NET_DEFAULT_ALLOW.length).map((site) => [site.host, site.rule, site.builtin]), [['alpha.example', 'allow', false], ['zeta.example', 'deny', false]]);
});

test('the settings: the mode, a rule for a site, a default site put back, and what an answer leaves behind', () => {
  const config = {};
  assert.equal(getNetMode(config), 'new');
  assert.equal(setNetMode(config, 'always'), true);
  assert.equal(setNetMode(config, 'always'), false);
  assert.equal(netRuleFor(config, 'github.com'), 'allow', 'a default site');
  assert.equal(netRuleFor(config, 'x.com'), 'ask', 'a site with no rule');
  assert.equal(setNetRule(config, 'X.com', 'deny'), true);
  assert.equal(setNetRule(config, 'x.com', 'deny'), false, 'not twice');
  assert.equal(netRuleFor(config, 'x.com'), 'deny');
  assert.equal(setNetRule(config, 'not a site', 'allow'), false);
  assert.equal(setNetRule(config, 'x.com', 'sometimes'), false);
  assert.equal(setNetRule(config, 'github.com', 'deny'), true);
  assert.equal(setNetRule(config, 'github.com', 'allow'), true, 'a default site allowed again is no rule at all');
  assert.deepEqual(config.netRules, { 'x.com': 'deny' });
  assert.equal(removeNetSite(config, 'x.com'), true);
  assert.equal(removeNetSite(config, 'x.com'), false);
  assert.deepEqual(config.netRules, {});

  // What the person's answer leaves: a rule for "always" and for a refusal; a site answered "once" stays in the list (asked again next time).
  assert.equal(rememberNetAnswer(config, 'a.example', 'always'), true);
  assert.equal(rememberNetAnswer(config, 'b.example', 'deny'), true);
  assert.equal(rememberNetAnswer(config, 'c.example', 'once'), true);
  assert.equal(rememberNetAnswer(config, 'a.example', 'once'), false, 'an allowed site stays allowed');
  assert.equal(rememberNetAnswer(config, 'pypi.org', 'once'), false, 'a default site is in the list already');
  assert.equal(rememberNetAnswer(config, 'd.example', 'timeout'), false);
  assert.deepEqual(config.netRules, { 'a.example': 'allow', 'b.example': 'deny', 'c.example': 'ask' });
  assert.deepEqual(netPolicyForRun({ netMode: 'always', netRules: { 'a.example': 'allow', junk: 'x' } }), { mode: 'always', rules: { 'a.example': 'allow' } });
});

test('the permission texts are in all five languages, the same keys and placeholders in each', () => {
  const english = Object.keys(PERMISSION_TEXTS.en);
  for (const language of ['zh-TW', 'fr', 'ru', 'es']) {
    assert.deepEqual(Object.keys(PERMISSION_TEXTS[language]), english, language);
    for (const key of english) {
      assert.ok(String(PERMISSION_TEXTS[language][key]).trim(), `${language}.${key}`);
      assert.deepEqual([...String(PERMISSION_TEXTS[language][key]).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(), [...String(PERMISSION_TEXTS.en[key]).matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort(), `${language}.${key} keeps its placeholders`);
    }
  }
  assert.equal(permissionText('fr', 'credSaved', { name: 'X' }), '« X » enregistré.');
  assert.equal(permissionText('de', 'nav'), 'Permissions', 'another language reads English');
});
