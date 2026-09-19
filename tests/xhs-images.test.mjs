import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm, symlink, copyFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT, getInputs, prepare, verifyRelease, sha256 } from '../scripts/content/core.mjs';
import { loadXhsImages, deliveryPng } from '../scripts/content/xiaohongshu-images.mjs';
import { xhsFixture } from './helpers/xhs-fixture.mjs';

async function fixture(t) {
  const parent = join(ROOT, '.content/tests'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'xhs-images-'));
  t.after(async () => { assert.ok(!relative(parent, root).startsWith('..')); await rm(root, { recursive: true }); });
  const directory = join(root, 'content-projects/example'); await mkdir(directory, { recursive: true });
  const article = '---\ntitle: 图片清单测试\ndescription: 真实图片交付\npublishedAt: 2026-09-19\ntags: [测试]\nfeatured: false\nstatus: draft\n---\n\n内容\n';
  await writeFile(join(directory, 'article.md'), article);
  const xhs = await xhsFixture(directory, sha256(article));
  const save = async value => writeFile(join(directory, 'xiaohongshu.json'), JSON.stringify(value));
  await save(xhs);
  return { root, directory, xhs, save };
}
const prepareXhs = f => prepare(f.root, 'example', { platforms: ['xiaohongshu'] });
const original = path => ({ kind: 'original', path, alt: '原始证据图' });

test('skill output and original screenshots retain their exact PNG bytes and specified upload order', async t => {
  const f = await fixture(t);
  const second = 'xiaohongshu/images/02-evidence.png';
  await sharp({ create: { width: 640, height: 320, channels: 3, background: '#dc7c21' } }).png().toFile(join(f.directory, second));
  f.xhs.images.push(original(second)); await f.save(f.xhs);
  const a = await prepareXhs(f);
  assert.deepEqual(await readFile(join(a.directory, 'xiaohongshu/cards/01.png')), await readFile(join(f.directory, f.xhs.images[0].path)));
  assert.deepEqual(await readFile(join(a.directory, 'xiaohongshu/cards/02.png')), await readFile(join(f.directory, second)));
  const manifest = JSON.parse(await readFile(join(a.directory, 'manifest.json'), 'utf8'));
  assert.ok(Object.keys(manifest.inputs).some(file => file.endsWith('/01-cover.md')));
  assert.ok(!Object.keys(manifest.artifacts).some(file => file.includes('prompts')));
  f.xhs.images.reverse(); await f.save(f.xhs);
  const b = await prepareXhs(f); assert.notEqual(a.releaseHash, b.releaseHash);
  assert.deepEqual(await readFile(join(b.directory, 'xiaohongshu/cards/01.png')), await readFile(join(f.directory, second)));
});

test('new XHS preparation rejects old text cards and missing skill provenance with no template fallback', async t => {
  const f = await fixture(t);
  await f.save({ sourceHash: f.xhs.sourceHash, title: '旧稿', caption: '旧稿', cards: [{ heading: '不应自动变成卡片' }] });
  await assert.rejects(prepareXhs(f), /固定文字卡片模板已移除/);
  await assert.rejects(readFile(join(f.root, '.content/state/example.json')), { code: 'ENOENT' });
  const { imageSkill, ...withoutSkill } = f.xhs; assert.equal(imageSkill, 'baoyu-xhs-images');
  await f.save(withoutSkill); await assert.rejects(prepareXhs(f));
});

test('a generated image requires a real nonempty prompt; original screenshots do not require invented prompts', async t => {
  const f = await fixture(t), prompt = join(f.directory, f.xhs.images[0].prompt);
  await rm(prompt); await assert.rejects(prepareXhs(f), { code: 'ENOENT' });
  await writeFile(prompt, '  \n'); await assert.rejects(prepareXhs(f), /不能为空/);
  await f.save({ ...f.xhs, images: [original(f.xhs.images[0].path)] });
  assert.ok((await prepareXhs(f)).releaseHash);
});

test('both image content and prompt changes invalidate the exact authored version', async t => {
  const f = await fixture(t), first = await prepareXhs(f);
  await writeFile(join(f.directory, f.xhs.images[0].prompt), '# Changed creation prompt');
  await assert.rejects(verifyRelease(f.root, 'example', first.releaseHash), /当前输入/);
  const second = await prepareXhs(f); assert.notEqual(first.releaseHash, second.releaseHash);
  await sharp({ create: { width: 180, height: 240, channels: 3, background: 'red' } }).png().toFile(join(f.directory, f.xhs.images[0].path));
  await assert.rejects(verifyRelease(f.root, 'example', second.releaseHash), /当前输入/);
  await verifyRelease(f.root, 'example', first.releaseHash, { current: false });
});

test('unselected XHS image and prompt files never leak into website/WeChat packages', async t => {
  const f = await fixture(t);
  const first = await prepare(f.root, 'example', { platforms: ['website', 'wechat'] });
  await rm(join(f.directory, f.xhs.images[0].path)); await rm(join(f.directory, f.xhs.images[0].prompt));
  await verifyRelease(f.root, 'example', first.releaseHash);
  const { manifest } = await verifyRelease(f.root, 'example', first.releaseHash);
  assert.ok(!Object.keys(manifest.inputs).some(file => file.includes('/xiaohongshu/')));
  assert.ok(!Object.keys(manifest.artifacts).some(file => /(?:01-cover|prompts|xiaohongshu)/.test(file)));
});

test('image and prompt references reject traversal, external paths and Windows special paths', async t => {
  const f = await fixture(t);
  for (const path of ['../outside.png', '/outside.png', 'C:/outside.png', 'C:outside.png', '\\\\host\\share.png', 'https://example.test/a.png', 'xiaohongshu/images/../secret.png', 'xiaohongshu/images/a.png:stream', 'assets/accidental-xhs.png']) {
    await assert.rejects(loadXhsImages(f.directory, [original(path)]), /路径/);
  }
  await assert.rejects(loadXhsImages(f.directory, [{ ...f.xhs.images[0], prompt: 'sources/private.md' }]), /路径/);
});

test('linked image directories and prompt files cannot escape the content project', async t => {
  const f = await fixture(t), outside = join(f.root, 'outside'); await mkdir(outside);
  await copyFile(join(f.directory, f.xhs.images[0].path), join(outside, 'image.png'));
  await symlink(outside, join(f.directory, 'xiaohongshu/images/linked'), 'junction');
  await assert.rejects(loadXhsImages(f.directory, [original('xiaohongshu/images/linked/image.png')]), /链接|联接/);
  await symlink(outside, join(f.directory, 'xiaohongshu/prompts/linked'), 'junction');
  await writeFile(join(outside, 'prompt.md'), 'Do not read outside the project');
  await assert.rejects(loadXhsImages(f.directory, [{ ...f.xhs.images[0], prompt: 'xiaohongshu/prompts/linked/prompt.md' }]), /链接|联接/);
});

test('disguised SVG, invalid raster bytes and multi-frame raster images are rejected', async t => {
  const f = await fixture(t), path = 'xiaohongshu/images/unsafe.png';
  await writeFile(join(f.directory, path), '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20"/></svg>');
  await assert.rejects(loadXhsImages(f.directory, [original(path)]), /不接受 SVG/);
  await writeFile(join(f.directory, path), 'not an image'); await assert.rejects(loadXhsImages(f.directory, [original(path)]));
  const frames = Buffer.concat([Buffer.alloc(4 * 2 * 3, 0), Buffer.alloc(4 * 2 * 3, 255)]);
  const animated = await sharp(frames, { raw: { width: 4, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await writeFile(join(f.directory, path), animated); await assert.rejects(loadXhsImages(f.directory, [original(path)]), /动画/);
});

test('JPEG normalization changes only the container and preserves decoded image pixels', async t => {
  const f = await fixture(t), path = 'xiaohongshu/images/photo.jpg';
  const bytes = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#3ea38b' } }).jpeg().toBuffer();
  await writeFile(join(f.directory, path), bytes);
  const [image] = await loadXhsImages(f.directory, [original(path)]), png = await deliveryPng(image);
  assert.equal((await sharp(png).metadata()).format, 'png');
  assert.deepEqual(await sharp(png).raw().toBuffer(), await sharp(bytes).raw().toBuffer());
});

test('duplicate image references and missing declared files stop preparation', async t => {
  const f = await fixture(t);
  await assert.rejects(loadXhsImages(f.directory, [f.xhs.images[0], f.xhs.images[0]]), /重复/);
  await assert.rejects(loadXhsImages(f.directory, [original('xiaohongshu/images/missing.png')]), { code: 'ENOENT' });
  const input = await getInputs(f.root, 'example', { platforms: ['website'] });
  assert.deepEqual(input.xhsImages, []);
});

test('CLI prepare requires platform selection before reading or generating content', () => {
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts/content/cli.mjs'), 'prepare', 'not-a-real-project'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stderr, /生成前请先明确目标平台/);
});

test('edits during image decoding cannot bind the old caption or article to new input hashes', async t => {
  const f = await fixture(t), originalArticle = await readFile(join(f.directory, 'article.md'));
  const originalJson = await readFile(join(f.directory, 'xiaohongshu.json'));
  const stats = sharp.prototype.stats; let edited = false;
  t.mock.method(sharp.prototype, 'stats', async function (...args) {
    if (!edited) {
      edited = true;
      const article = originalArticle.toString('utf8') + '\n后续人工修改';
      await writeFile(join(f.directory, 'article.md'), article);
      await f.save({ ...f.xhs, sourceHash: sha256(article), caption: '后续人工文案' });
    }
    return stats.apply(this, args);
  });
  const pack = await prepareXhs(f); t.mock.restoreAll();
  const manifest = JSON.parse(await readFile(join(pack.directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.inputs['content-projects/example/article.md'], sha256(originalArticle));
  assert.equal(manifest.inputs['content-projects/example/xiaohongshu.json'], sha256(originalJson));
  const post = JSON.parse(await readFile(join(pack.directory, 'xiaohongshu/post.json'), 'utf8'));
  assert.equal(post.caption, f.xhs.caption);
  await assert.rejects(verifyRelease(f.root, 'example', pack.releaseHash), /当前输入/);
});

test('hidden PNG text metadata is stripped without changing decoded pixels', async t => {
  const f = await fixture(t), plain = await readFile(join(f.directory, f.xhs.images[0].path));
  const marker = 'synthetic-private-prompt-marker';
  const data = Buffer.from('Comment\0' + marker), type = Buffer.from('tEXt');
  const payload = Buffer.concat([type, data]);
  let crc = 0xffffffff;
  for (const byte of payload) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  const withText = Buffer.concat([plain.subarray(0, -12), length, payload, checksum, plain.subarray(-12)]);
  await writeFile(join(f.directory, f.xhs.images[0].path), withText);
  const [image] = await loadXhsImages(f.directory, f.xhs.images), clean = await deliveryPng(image);
  assert.equal(clean.includes(Buffer.from(marker)), false);
  assert.deepEqual(await sharp(clean).raw().toBuffer(), await sharp(plain).raw().toBuffer());
  assert.deepEqual(image.buffer, withText, 'original evidence remains unchanged');
});
