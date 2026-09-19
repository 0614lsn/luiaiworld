import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { ROOT, prepare, sha256 } from '../scripts/content/core.mjs';
import { adaptWechatDeliveryHtml, deliverWechat, verifyWechatReadback } from '../scripts/content/wechat-delivery.mjs';

async function fixture(t) {
  const parent = join(ROOT, '.content', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'wechat-delivery-'));
  t.after(async () => { assert.ok(!relative(parent, root).startsWith('..')); await rm(root, { recursive: true }); });
  const slug = 'test-delivery', directory = join(root, 'content-projects', slug);
  const target = join(directory, 'platforms', 'wechat');
  await mkdir(target, { recursive: true });
  const article = '---\ntitle: 测试交付\ndescription: 测试说明\npublishedAt: 2026-09-12\ntags: [测试]\nfeatured: false\nstatus: draft\n---\n\n## 正文\n\n[资料](https://example.test/a) 和 [另一处](https://example.test/a)。\n\n```text\n保持完整提示词 <tag>\n```\n';
  await writeFile(join(directory, 'article.md'), article);
  const release = await prepare(root, slug, { platforms: ['wechat'] });
  return { root, slug, directory, target, release: release.releaseHash, article };
}
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const transport = (overrides = {}) => ({ accountKey: 'test-account', defaults: { default_author: '作者' }, upload: async () => ({ media_id: 'cover', url: 'https://mmbiz.qpic.cn/test' }), ...overrides });

test('new WeChat HTML uses sequential baseline citations and preserves prompt literals', () => {
  const html = adaptWechatDeliveryHtml('<p><a href="https://example.test/a?a=1&amp;b=2">资料</a>，<a href="https://example.test/b">其他</a>，<a href="https://example.test/a?a=1&amp;b=2">重复</a></p><pre><code>&lt;prompt&gt;\n原文</code></pre>');
  assert.doesNotMatch(html, /<a\b|<sup\b/);
  assert.match(html, /资料<\/span><span|资料<span/);
  assert.equal((html.match(/\[3\]/g) ?? []).length, 0);
  assert.match(html, /&lt;prompt&gt;\n原文/);
  assert.match(html, /引用链接/);
});

test('existing manual draft is preserved, with source baseline migration and changed-source refusal', async (t) => {
  const f = await fixture(t), calls = [];
  await writeFile(join(f.directory, 'project.json'), JSON.stringify({ preparedRelease: f.release }));
  await writeFile(join(f.target, 'receipt.json'), JSON.stringify({ mediaId: 'existing', release: 'historical' }));
  const api = transport({ request: async (endpoint) => { calls.push(endpoint); return { news_item: [{ title: '人工标题', content: '<p>人工修改</p>', thumb_media_id: '' }] }; } });
  const result = await deliverWechat(f.root, f.slug, f.release, api);
  assert.equal(result.success, true); assert.equal(result.disposition, 'existing_preserved');
  const receipt = await json(join(f.target, 'receipt.json'));
  assert.equal(receipt.release, 'historical'); assert.equal(receipt.sourceHash, sha256(f.article));
  assert.equal(await readFile(join(f.target, 'body.html'), 'utf8'), '<p>人工修改</p>');
  const changed = f.article + '\n新的内容\n';
  await writeFile(join(f.directory, 'article.md'), changed);
  const next = await prepare(f.root, f.slug, { platforms: ['wechat'] });
  const refused = await deliverWechat(f.root, f.slug, next.releaseHash, api);
  assert.equal(refused.success, false); assert.equal(refused.stage, 'needs_merge');
  assert.deepEqual(calls, ['draft/get', 'draft/get']);
});

test('new draft add persists its ID before readback; retry recovers without a second add', async (t) => {
  const f = await fixture(t); let adds = 0, gets = 0, sent;
  const api = transport({ request: async (endpoint, payload) => {
    if (endpoint === 'draft/add') { adds++; sent = payload.articles[0]; return { media_id: 'created-id' }; }
    gets++; if (gets === 1) throw new Error('readback timeout');
    return { news_item: [sent] };
  } });
  await assert.rejects(deliverWechat(f.root, f.slug, f.release, api), /readback timeout/);
  assert.equal((await json(join(f.target, 'delivery-operation.json'))).mediaId, 'created-id');
  const recovered = await deliverWechat(f.root, f.slug, f.release, api);
  assert.equal(recovered.success, true); assert.equal(adds, 1);
  assert.equal(sent.need_open_comment, 1); assert.equal(sent.only_fans_can_comment, 0);
  assert.equal(sent.thumb_media_id, 'cover'); assert.doesNotMatch(sent.content, /<a\b/);
  assert.equal((await json(join(f.target, 'delivery-operation.json'))).status, 'saved');
  await rm(join(f.target,'receipt.json'));
  const withoutReceipt=await deliverWechat(f.root,f.slug,f.release,api);
  assert.equal(withoutReceipt.mediaId,'created-id');assert.equal(adds,1);
});

test('unknown add outcome is not retried, and account changes do not touch the remote draft', async (t) => {
  const f = await fixture(t); let calls = 0;
  const api = transport({ request: async () => { calls++; throw new Error('submit timeout'); } });
  await assert.rejects(deliverWechat(f.root, f.slug, f.release, api), /submit timeout/);
  const retry = await deliverWechat(f.root, f.slug, f.release, api);
  assert.equal(retry.stage, 'submission_unknown'); assert.equal(calls, 1);
  const switched = await deliverWechat(f.root, f.slug, f.release, { ...api, accountKey: 'other-account' });
  assert.equal(switched.stage, 'needs_account_check'); assert.equal(calls, 1);
});

test('cover upload failure prevents draft/add and leaves no unknown draft submission', async (t) => {
  const f = await fixture(t); let calls = 0;
  await assert.rejects(deliverWechat(f.root, f.slug, f.release, transport({ upload: async () => { throw new Error('upload failed'); }, request: async () => { calls++; } })), /upload failed/);
  assert.equal(calls, 0);
  await assert.rejects(readFile(join(f.target, 'delivery-operation.json')), { code: 'ENOENT' });
});

test('new draft readback detects truncation and literal prompt loss and never creates a duplicate', async t => {
  for (const mutate of [s => s.replace('资料',''), s => s.replace('保持完整提示词','缺失')]) {
    const f=await fixture(t); let adds=0, sent;
    const api=transport({request:async(endpoint,payload)=>{if(endpoint==='draft/add'){adds++;sent=payload.articles[0];return{media_id:'one-created'};} return{news_item:[{...sent,content:mutate(sent.content)}]};}});
    assert.equal((await deliverWechat(f.root,f.slug,f.release,api)).stage,'verification_failed');
    assert.equal((await deliverWechat(f.root,f.slug,f.release,api)).stage,'verification_failed');
    assert.equal(adds,1);
  }
  const withImages='<p>说明</p><img src="https://mmbiz.qpic.cn/one"><img src="https://mmbiz.qpic.cn/two">';
  assert.equal(verifyWechatReadback(withImages,'<p>说明</p><img src="https://mmbiz.qpic.cn/two">','标题','标题'),false);
});
