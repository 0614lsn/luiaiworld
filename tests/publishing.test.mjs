import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { ROOT, prepare, status, record, verifyRelease, sha256, withLock, inlineWechat } from '../scripts/content/core.mjs';
import { wrapText } from '../scripts/content/wechat-cover.mjs';
import { xhsFixture } from './helpers/xhs-fixture.mjs';
import { siteTestPaths } from './helpers/site-fixture.mjs';

const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`;
async function fixture(t) {
  const parent = join(ROOT, '.content', 'tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'pipeline-'));
  t.after(async () => { assert.ok(!relative(parent, root).startsWith('..')); await rm(root, { recursive: true }); });
  const directory = join(root, 'content-projects', 'example');
  await mkdir(directory, { recursive: true });
  const article = '---\ntitle: "测试文章"\ndescription: "完整保留可复制提示词的草稿。"\npublishedAt: 2026-09-07\ntags: ["测试"]\nfeatured: true\nstatus: draft\n---\n\n## 中文标题\n\n正文 **强调**。\n\n```text\n<instruction>完整提示词\n下一行</instruction>\n```\n';
  const xhs = await xhsFixture(directory, sha256(article));
  await writeFile(join(directory, 'article.md'), article);
  await writeFile(join(directory, 'xiaohongshu.json'), stringify(xhs));
  return { root, directory, article, xhs, slug: 'example' };
}
async function saveInputs(f, article = f.article, xhs = f.xhs) {
  await writeFile(join(f.directory, 'article.md'), article);
  await writeFile(join(f.directory, 'xiaohongshu.json'), stringify({ ...xhs, sourceHash: sha256(article) }));
}
const event = (hash, stage, extra = {}) => ({ release: hash, platform: 'website', stage, target: 'example.test', evidence: '本测试的明确审核/回读证据', ...extra });

test('prepare creates copyable inline HTML and PNGs, keeps source and production separate', async (t) => {
  const f = await fixture(t);
  const result = await prepare(f.root, f.slug);
  assert.equal(await readFile(join(f.directory, 'article.md'), 'utf8'), f.article);
  const html = await readFile(join(result.directory, 'wechat/body.html'), 'utf8');
  assert.match(html, /&lt;instruction&gt;完整提示词\n下一行&lt;\/instruction&gt;/);
  assert.match(html, /white-space:pre-wrap/);
  assert.doesNotMatch(html, /<script|class=|__ASTRO_IMAGE_/);
  assert.doesNotMatch(html, /OpenAI|官方文档|中文整理/);
  const image = await sharp(join(result.directory, 'xiaohongshu/cards/01.png')).metadata();
  assert.equal(image.width, 1080); assert.equal(image.height, 1440);
  const state = await status(f.root, f.slug);
  assert.equal(state.verification.valid, true);
  assert.ok(Object.values(state.releases[result.releaseHash].platforms).every((p) => p.stage === 'local_ready'));
  await assert.rejects(readFile(join(f.root, 'src/content/articles/example.md')), { code: 'ENOENT' });
});

test('content projects keep raw sources and platform receipts outside render inputs', async (t) => {
  const f = await fixture(t);
  const first = await prepare(f.root, f.slug);
  await mkdir(join(f.directory, 'sources'));
  await mkdir(join(f.directory, 'platforms', 'wechat'), { recursive: true });
  await writeFile(join(f.directory, 'sources', 'original.md'), '原始资料，只用于创作参考');
  await writeFile(join(f.directory, 'platforms', 'wechat', 'receipt.json'), '{"stage":"draft_saved"}');
  const second = await prepare(f.root, f.slug);
  assert.equal(second.releaseHash, first.releaseHash);
  assert.equal(second.reused, true);
  await assert.rejects(readFile(join(second.directory, 'wechat', 'receipt.json')), { code: 'ENOENT' });
});

test('same version reuses artifacts, restores state after interruption, and reselects A after B', async (t) => {
  const f = await fixture(t); const a = await prepare(f.root, f.slug);
  await record(f.root, f.slug, event(a.releaseHash, 'review_pending'));
  const first = await readFile(join(a.directory, 'manifest.json'), 'utf8');
  assert.equal((await prepare(f.root, f.slug)).reused, true);
  assert.equal(await readFile(join(a.directory, 'manifest.json'), 'utf8'), first);
  await saveInputs(f, f.article.replace('测试文章', '第二版'));
  const b = await prepare(f.root, f.slug); assert.notEqual(a.releaseHash, b.releaseHash);
  await saveInputs(f); await prepare(f.root, f.slug);
  const state = await status(f.root, f.slug);
  assert.equal(state.currentRelease, a.releaseHash);
  assert.equal(state.releases[a.releaseHash].platforms.website.stage, 'review_pending');
  await rm(join(f.root, '.content/state/example.json'));
  await prepare(f.root, f.slug);
  assert.equal((await status(f.root, f.slug)).currentRelease, a.releaseHash);
});

test('manual output edits are preserved and rejected, including edits to manifest after approval', async (t) => {
  const f = await fixture(t); const a = await prepare(f.root, f.slug);
  await record(f.root, f.slug, event(a.releaseHash, 'approved'));
  const file = join(a.directory, 'wechat/body.html');
  await writeFile(file, '人工修改');
  await assert.rejects(prepare(f.root, f.slug), /产物已被修改/);
  assert.equal(await readFile(file, 'utf8'), '人工修改');
  const manifestPath = join(a.directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.artifacts['wechat/body.html'] = sha256('人工修改');
  await writeFile(manifestPath, stringify(manifest));
  await assert.rejects(record(f.root, f.slug, event(a.releaseHash, 'published', { url: 'https://example.test/article' })), /没有绑定/);
});

test('source changes invalidate derivatives; source, templates, and derived copy invalidate approval', async (t) => {
  const f = await fixture(t); const a = await prepare(f.root, f.slug);
  await writeFile(join(f.directory, 'article.md'), f.article + '\n补充。');
  await assert.rejects(prepare(f.root, f.slug), /原稿已变化/);
  await saveInputs(f, f.article, { ...f.xhs, caption: '新版文案' });
  await assert.rejects(record(f.root, f.slug, event(a.releaseHash, 'approved', { resolution: 'confirmed-existing' })), /当前输入或模板已变化/);
  await saveInputs(f);
  await mkdir(join(f.root, 'src/pages'), { recursive: true });
  await writeFile(join(f.root, 'src/pages/index.astro'), '新的首页模板');
  await assert.rejects(verifyRelease(f.root, f.slug, a.releaseHash), /当前输入或模板已变化/);
});

test('draft timeouts need reconciliation; publication needs approval and does not duplicate other platforms', async (t) => {
  const f = await fixture(t); const a = await prepare(f.root, f.slug);
  const xhs = (stage, extra = {}) => event(a.releaseHash, stage, { platform: 'xiaohongshu', target: '测试小红书目标', ...extra });
  await record(f.root, f.slug, xhs('submission_unknown', { action: 'draft_save' }));
  await assert.rejects(record(f.root, f.slug, xhs('draft_saved')), /先回读平台/);
  await record(f.root, f.slug, xhs('draft_saved', { resolution: 'confirmed-existing', remoteId: 'browser-local-draft-1' }));
  await assert.rejects(record(f.root, f.slug, xhs('published', { remoteId: 'published-1' })), /没有绑定/);
  await record(f.root, f.slug, xhs('approved'));
  await assert.rejects(record(f.root, f.slug, xhs('submission_unknown', { target: '另一个账号' })), /没有绑定/);
  await record(f.root, f.slug, xhs('submission_unknown'));
  await saveInputs(f, f.article + '\n新版本。'); await prepare(f.root, f.slug);
  await record(f.root, f.slug, xhs('published', { resolution: 'confirmed-existing', remoteId: 'published-1' }));
  const state = await status(f.root, f.slug);
  assert.equal(state.releases[a.releaseHash].platforms.xiaohongshu.stage, 'published');
  assert.equal(state.releases[a.releaseHash].platforms.website.stage, 'local_ready');
  assert.equal(state.releases[a.releaseHash].platforms.wechat.stage, 'local_ready');
});

test('locks reject concurrent preparation and release on failure', async (t) => {
  const f = await fixture(t);
  await withLock(f.root, f.slug, async () => { await assert.rejects(prepare(f.root, f.slug), /已上锁/); });
  await assert.rejects(withLock(f.root, f.slug, async () => { throw new Error('模拟中断'); }), /模拟中断/);
  await prepare(f.root, f.slug);
});

test('extra artifacts and a new draft attempt invalidate the prior reviewed representation', async (t) => {
  const f = await fixture(t); const a = await prepare(f.root, f.slug);
  await writeFile(join(a.directory, 'xiaohongshu/cards/extra.png'), 'added after generation');
  await assert.rejects(verifyRelease(f.root, f.slug, a.releaseHash), /文件清单已变化/);
  await rm(join(a.directory, 'xiaohongshu/cards/extra.png'));
  await record(f.root, f.slug, event(a.releaseHash, 'approved'));
  await record(f.root, f.slug, event(a.releaseHash, 'submission_unknown', { action: 'draft_save' }));
  await assert.rejects(record(f.root, f.slug, event(a.releaseHash, 'published', { resolution: 'confirmed-existing', url: 'https://example.test/article' })), /没有绑定/);
  await assert.rejects(record(f.root, f.slug, event(a.releaseHash, 'published', { resolution: 'confirmed-absent', url: 'https://example.test/article' })), /不存在/);
});

test('image markers resolve to local images and Chinese punctuation never starts a wrapped line', async () => {
  const processor = await createSatteriMarkdownProcessor({ syntaxHighlight: false });
  const rendered = await processor.render('![示意图](assets/example.png)');
  assert.match(inlineWechat(rendered.code), /src="assets\/example.png"/);
  const lines = wrapText('每段只展开一个主要观点。使用平实、简单的语言。', 12.5);
  assert.ok(lines.every((line) => !/^[，。！？；：、）》」』】”’]/.test(line)));
  assert.equal(lines.join(''), '每段只展开一个主要观点。使用平实、简单的语言。');
  assert.throws(() => wrapText('很长的段落'.repeat(40), 10, 2), /超过/);
});

test('public build excludes all draft routes and draft content, and source paths are ignored', async () => {
  const scan = async (directory) => {
    let html = '';
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) html += await scan(path);
      else if (/\.(html|css|js|json|xml|txt)$/.test(entry.name)) html += await readFile(path, 'utf8');
    }
    return html;
  };
  const { dist } = siteTestPaths(ROOT);
  const output = await scan(dist);
  assert.doesNotMatch(output, /我把 Codex 的源码拆开看了看|本地草稿预览|initiative-and-follow-through|\.content[\\/]|WECHAT_APP_SECRET|DASHSCOPE_API_KEY/);
  assert.match(output, /测试文章：内容与代码分离/);
  assert.doesNotMatch(output, /PRIVATE_DRAFT_SHOULD_NOT_APPEAR/);
  assert.match(output, /湘ICP备2026038846号-1/);
  await assert.rejects(readFile(join(dist, 'articles/private-draft/index.html')), { code: 'ENOENT' });
  const ignored = execFileSync('git', ['check-ignore', 'content-projects/example/article.md', 'content-projects/example/sources/original.md'], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(ignored.includes('content-projects/example/article.md'));
});
