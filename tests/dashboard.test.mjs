import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = (await readFile(new URL('../extensions/draft-delivery/dashboard.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/, '');
const clone = value => JSON.parse(JSON.stringify(value));
const names = ['website', 'wechat', 'xiaohongshu'];
const project = id => ({ id, title: id, ready: true, availability: Object.fromEntries(names.map(name => [name, { ready: name !== 'xiaohongshu', message: '小红书写作稿待补齐' }])) });
const job = (id, selected, status = 'complete') => ({ id, slug: 'first', selectedPlatforms: selected, status, platforms: Object.fromEntries(names.map(name => [name, { stage: selected.includes(name) ? status === 'complete' ? 'draft_saved' : 'failed' : 'skipped' }])) });

async function fixture(initial = {}, responder) {
  class Element {
    value = ''; disabled = false; checked = false; hidden = false; required = false; textContent = ''; listeners = {};
    addEventListener(name, callback) { this.listeners[name] = callback; }
    replaceChildren() { this.value = ''; }
    append(option) { if (!this.value) this.value = option.value; }
    async fire(name) { return this.listeners[name]?.({ preventDefault() {} }); }
  }
  const elements = Object.fromEntries(['token','profile','account','deliver','project','platform-choice','selection-status','resume','recovery','notice','task-platforms','connect-form','connection','setup','version',...names.flatMap(name => [name+'-state',name+'-message'])].map(id => [id,new Element()]));
  const choices = names.map(name => Object.assign(new Element(), { value: name }));
  const stored = { token: 'local-test-token', ...initial }, requests = [];
  const context = { document: { getElementById: id => elements[id], querySelectorAll: () => choices, createElement: () => new Element() }, chrome: { runtime: { getManifest: () => ({ version: 'test' }) }, storage: { local: { get: async () => clone(stored), set: async value => Object.assign(stored, clone(value)), setAccessLevel() {} } }, tabs: { create: () => assert.fail('unselected XHS must not open a tab') } }, crypto: webcrypto, AbortSignal, setTimeout, Uint8Array,
    fetch: async (url, init) => {
      const path = new URL(url).pathname, body = init.body ? JSON.parse(init.body) : undefined;
      requests.push({ path, body });
      const value = await responder?.(path, body);
      return { ok: true, json: async () => value ?? (path === '/projects' ? [project('first'), project('second')] : path === '/health' ? { ok: true } : job('one', ['wechat'])) };
    } };
  await vm.runInNewContext(`(async () => { ${source}\n })()`, context);
  return { elements, choices, stored, requests };
}

test('dashboard connects without XHS account, starts with no targets, and remembers selection per article', async () => {
  const f = await fixture();
  assert.equal(f.elements.deliver.disabled, true); assert.ok(f.choices.every(choice => !choice.checked));
  f.choices[1].checked = true; await f.choices[1].fire('change');
  assert.equal(f.elements.deliver.disabled, false); assert.equal(f.elements.account.required, false);
  assert.deepEqual(f.stored.platformSelections.first, ['wechat']);
  f.elements.project.value = 'second'; await f.elements.project.fire('change');
  assert.ok(f.choices.every(choice => !choice.checked)); assert.equal(f.elements.deliver.disabled, true);
  f.choices[0].checked = true; await f.choices[0].fire('change');
  f.elements.project.value = 'first'; await f.elements.project.fire('change');
  assert.deepEqual(f.choices.filter(choice => choice.checked).map(choice => choice.value), ['wechat']);
  f.choices[2].checked = true; await f.choices[2].fire('change');
  assert.equal(f.elements.deliver.disabled, true); assert.match(f.elements['selection-status'].textContent, /小红书/);
  const reloaded = await fixture(f.stored);
  assert.deepEqual(reloaded.choices.filter(choice => choice.checked).map(choice => choice.value), ['wechat','xiaohongshu']);
});

test('deliver freezes controls before awaiting the API and sends one captured target without an XHS account', async () => {
  let resolveRequest, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const f = await fixture({ platformSelections: { first: ['wechat'] } }, async path => {
    if (path === '/deliver') { started(); return new Promise(resolve => { resolveRequest = resolve; }); }
  });
  const pending = f.elements.deliver.fire('click');
  assert.equal(f.elements.project.disabled, true); assert.equal(f.elements['platform-choice'].disabled, true); assert.equal(f.elements.resume.disabled, true);
  await waiting;
  // Even a second event or programmatic form change cannot mutate the in-flight payload.
  f.elements.project.value = 'second'; f.choices[0].checked = true; await f.choices[0].fire('change');
  await f.elements.deliver.fire('click');
  const requests = f.requests.filter(request => request.path === '/deliver');
  assert.equal(requests.length, 1); assert.deepEqual(requests[0].body, { slug: 'first', selectedPlatforms: ['wechat'], target: null });
  resolveRequest(job('one', ['wechat'])); await pending;
  assert.equal(f.elements.project.disabled, false); assert.equal(f.elements['platform-choice'].disabled, false);
  assert.equal(f.elements['website-state'].textContent, '本次未选择');
  assert.equal(f.elements['xiaohongshu-state'].textContent, '本次未选择');
  assert.match(f.elements.notice.textContent, /所选平台/);
});

test('resume uses the original job while current checkbox choices apply only to new jobs', async () => {
  let resolveRequest, started;
  const waiting = new Promise(resolve => { started = resolve; }); let resumed = false;
  const f = await fixture({ jobId: 'old', platformSelections: { first: ['website'] } }, async path => {
    if (path === '/jobs/old') return job('old', ['wechat'], resumed ? 'complete' : 'attention');
    if (path === '/jobs/old/resume') { started(); return new Promise(resolve => { resolveRequest = resolve; }); }
  });
  const pending = f.elements.resume.fire('click');
  assert.equal(f.elements.resume.disabled, true); assert.equal(f.elements['platform-choice'].disabled, true);
  await waiting; await f.elements.resume.fire('click');
  const requests = f.requests.filter(request => request.path.endsWith('/resume'));
  assert.equal(requests.length, 1); assert.equal(requests[0].body.selectedPlatforms, undefined);
  resumed = true; resolveRequest(job('old', ['wechat'])); await pending;
  assert.match(f.elements['task-platforms'].textContent, /微信公众号/);
  assert.equal(f.elements['website-state'].textContent, '本次未选择');
  assert.deepEqual(f.stored.platformSelections.first, ['website']);
});
