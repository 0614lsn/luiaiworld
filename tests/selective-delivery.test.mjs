import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, PLATFORMS, prepare, record, verifyRelease, sha256 } from '../scripts/content/core.mjs';
import { DeliveryService } from '../scripts/content/delivery.mjs';
import { deliverWechat } from '../scripts/content/wechat-delivery.mjs';
import { createHub } from '../scripts/content/hub.mjs';
import { xhsFixture } from './helpers/xhs-fixture.mjs';

async function fixture(t) {
  const parent = join(ROOT, '.content/tests'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'selective-'));
  t.after(async () => { assert.ok(!relative(parent, root).startsWith('..')); await rm(root, { recursive: true }); });
  const directory = join(root, 'content-projects/example'); await mkdir(directory, { recursive: true });
  const article = '---\ntitle: 平台选择测试\ndescription: 只交付指定目标\npublishedAt: 2026-09-19\ntags: [测试]\nfeatured: false\nstatus: draft\n---\n\n正文。\n';
  await writeFile(join(directory, 'article.md'), article);
  const xhs = await xhsFixture(directory, sha256(article), { title: '选择测试', caption: '完整文案' });
  await writeFile(join(directory, 'xiaohongshu.json'), JSON.stringify(xhs));
  const calls = [];
  const service = new DeliveryService(root, { wechat: async (...args) => { calls.push(args); return { stage: 'draft_saved' }; } });
  return { root, directory, article, xhs, calls, service, target: { browser: 'edge', instanceId: randomUUID(), profileLabel: '测试', account: '测试账号' } };
}
async function settled(service, job) { await service.active.get(job.id); return service.get(job.id); }
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const proof = job => ({ account: job.target.account, title: job.xhs.title, caption: job.xhs.caption, cardHashes: job.xhs.cards.map(card => card.sha256), savedAt: '测试保存时间', location: 'draft-reopened' });

test('all seven platform selections generate only selected artifacts and never touch unselected drafts', async t => {
  for (let mask = 1; mask < 8; mask++) await t.test(`selection ${mask}`, async t => {
    const f = await fixture(t), selected = PLATFORMS.filter((_, i) => mask & (1 << i));
    const sentinels = [];
    for (const platform of PLATFORMS.filter(platform => !selected.includes(platform))) {
      const directory = join(f.directory, 'platforms', platform, 'draft'); await mkdir(directory, { recursive: true });
      const file = join(directory, 'article.md'); await writeFile(file, '人工旧稿：请保留'); sentinels.push(file);
    }
    let job = await settled(f.service, await f.service.start('example', selected.includes('xiaohongshu') ? f.target : undefined, selected));
    const pack = await verifyRelease(f.root, 'example', job.release);
    assert.deepEqual((await readdir(pack.directory)).filter(name => name !== 'manifest.json').sort(), [...selected].sort());
    assert.deepEqual(pack.manifest.selectedPlatforms, selected);
    assert.equal(f.calls.length, selected.includes('wechat') ? 1 : 0);
    for (const file of sentinels) assert.equal(await readFile(file, 'utf8'), '人工旧稿：请保留');
    if (selected.includes('xiaohongshu')) job = await f.service.xhsComplete(job.id, f.target.instanceId, proof(job));
    else {
      assert.equal(job.target, null); assert.equal(job.xhs, undefined);
      for (const callback of [() => f.service.xhsAttempt(job.id, 'ignored'), () => f.service.xhsComplete(job.id, 'ignored', {}), () => f.service.xhsProblem(job.id, 'ignored', 'error'), () => f.service.card(job.id, 0)]) await assert.rejects(callback, /未选择小红书/);
    }
    assert.equal(job.status, 'complete');
    for (const platform of PLATFORMS) assert.equal(job.platforms[platform].stage, selected.includes(platform) ? 'draft_saved' : 'skipped');
  });
});

test('website and WeChat work without XHS input or account; invalid and stale unselected input is ignored', async t => {
  const f = await fixture(t);
  for (const input of [null, '{invalid', JSON.stringify({ ...f.xhs, sourceHash: '0'.repeat(64) })]) {
    if (input === null) await rm(join(f.directory, 'xiaohongshu.json'));
    else await writeFile(join(f.directory, 'xiaohongshu.json'), input);
    for (const platform of ['website', 'wechat']) {
      const job = await settled(f.service, await f.service.start('example', { invalid: true }, [platform]));
      assert.equal(job.status, 'complete'); assert.equal(job.target, null);
    }
    const [listed] = await f.service.list();
    assert.equal(listed.availability.website.ready, true); assert.equal(listed.availability.wechat.ready, true); assert.equal(listed.availability.xiaohongshu.ready, false);
  }
  assert.equal(f.calls.length, 3);
});

test('unselected XHS changes do not invalidate a website pack; selected sets have distinct canonical identities', async t => {
  const f = await fixture(t);
  const site = await prepare(f.root, 'example', { platforms: ['website'] });
  await writeFile(join(f.directory, 'xiaohongshu.json'), '{invalid');
  await verifyRelease(f.root, 'example', site.releaseHash);
  assert.equal((await prepare(f.root, 'example', { platforms: ['website'] })).releaseHash, site.releaseHash);
  const first = await settled(f.service, await f.service.start('example', null, ['wechat', 'website']));
  const repeat = await settled(f.service, await f.service.start('example', null, ['website', 'wechat']));
  assert.equal(first.id, repeat.id); assert.notEqual(first.release, site.releaseHash);
  for (const platforms of [[], ['website', 'website'], ['bogus'], 'website']) await assert.rejects(f.service.start('example', null, platforms), /选择/);
  await assert.rejects(f.service.start('example', null), /明确选择/);
  await assert.rejects(record(f.root, 'example', { release: site.releaseHash, platform: 'wechat', stage: 'draft_saved', target: '测试', evidence: '不可记录未选站' }), /未选择此平台/);
  await assert.rejects(deliverWechat(f.root, 'example', site.releaseHash, { request: () => assert.fail('must not call API') }), /未选择微信公众号/);
});

test('website-only and XHS-only avoid WeChat cover layout limits', async t => {
  const f = await fixture(t), article = f.article.replace('平台选择测试', '很长的文章标题'.repeat(20));
  await writeFile(join(f.directory, 'article.md'), article);
  await writeFile(join(f.directory, 'xiaohongshu.json'), JSON.stringify({ ...f.xhs, sourceHash: sha256(article) }));
  for (const platforms of [['website'], ['xiaohongshu']]) {
    const job = await settled(f.service, await f.service.start('example', f.target, platforms));
    assert.notEqual(job.status, 'attention');
    assert.equal(job.platforms.wechat.stage, 'skipped');
  }
  assert.equal(f.calls.length, 0);
});

test('resume keeps persisted platforms and needs no Edge identity for website/WeChat', async t => {
  const f = await fixture(t);
  const original = await settled(f.service, await f.service.start('example', null, ['wechat']));
  await rm(join(f.directory, 'xiaohongshu.json'));
  const restarted = new DeliveryService(f.root, { wechat: async () => ({ stage: 'draft_saved' }) });
  const recovered = await settled(restarted, await restarted.resume(original.id));
  assert.deepEqual(recovered.selectedPlatforms, ['wechat']); assert.equal(recovered.status, 'complete');
  assert.equal(recovered.platforms.website.stage, 'skipped'); assert.equal(recovered.platforms.xiaohongshu.stage, 'skipped');
  await assert.rejects(readFile(join(f.directory, 'platforms/website/draft/article.md')), { code: 'ENOENT' });
});

test('changing platform selection cannot duplicate an unknown XHS save, including two already waiting jobs', async t => {
  const f = await fixture(t);
  const a = await settled(f.service, await f.service.start('example', f.target, ['xiaohongshu']));
  const b = await settled(f.service, await f.service.start('example', f.target, ['website', 'xiaohongshu']));
  const attempts = await Promise.allSettled([f.service.xhsAttempt(a.id, f.target.instanceId), f.service.xhsAttempt(b.id, f.target.instanceId)]);
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(value => value.status === 'rejected').length, 1);
  await assert.rejects(f.service.start('example', { ...f.target, account: '改名账号', profileLabel: '改名profile' }, PLATFORMS), /待核实/);
  const independent = await settled(f.service, await f.service.start('example', null, ['website']));
  assert.equal(independent.status, 'complete');
  await writeFile(join(f.directory, 'article.md'), f.article + '\n后续修改');
  await rm(join(f.directory, 'xiaohongshu.json'));
  const old = await f.service.resume(a.id, f.target.instanceId);
  assert.equal(old.release, a.release); assert.deepEqual(old.selectedPlatforms, ['xiaohongshu']);
  const saved = await f.service.xhsComplete(a.id, f.target.instanceId, { ...proof(old), attemptId: attempts[0].value.attemptId });
  assert.equal(saved.status, 'complete');
});

test('legacy manifests and unknown jobs remain readable without re-preparing inputs', async t => {
  const f = await fixture(t);
  const prepared = await prepare(f.root, 'example');
  const manifest = await json(join(prepared.directory, 'manifest.json'));
  const legacyHash = sha256(JSON.stringify({ version: 1, slug: 'example', inputs: manifest.inputs }, null, 2) + '\n');
  const legacyDirectory = join(f.root, '.content/releases', legacyHash); await mkdir(legacyDirectory, { recursive: true });
  await writeFile(join(legacyDirectory, 'body.txt'), 'legacy artifact');
  await writeFile(join(legacyDirectory, 'manifest.json'), JSON.stringify({ version: 1, slug: 'example', releaseHash: legacyHash, inputs: manifest.inputs, artifacts: { 'body.txt': sha256('legacy artifact') } }));
  const a = await settled(f.service, await f.service.start('example', f.target, PLATFORMS));
  const permit = await f.service.xhsAttempt(a.id, f.target.instanceId);
  const old = await f.service.get(a.id); delete old.selectedPlatforms; old.version = 1; old.release = legacyHash;
  await f.service.save(old); await rm(join(f.directory, 'xiaohongshu.json'));
  await verifyRelease(f.root, 'example', legacyHash, { current: false });
  const resumed = await f.service.resume(old.id, f.target.instanceId);
  assert.equal(resumed.release, legacyHash);
  assert.equal(resumed.platforms.xiaohongshu.attemptId, permit.attemptId);
});

test('HTTP API requires explicit selection and resumes original selection even if caller supplies a different one', async t => {
  const f = await fixture(t), token = 'a'.repeat(64), server = createHub({ root: f.root, token, service: f.service });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`, headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await post('/deliver', { slug: 'example', target: f.target })).status, 400);
  const response = await post('/deliver', { slug: 'example', selectedPlatforms: ['website'] }); assert.equal(response.status, 202);
  const job = await settled(f.service, await response.json());
  const resumed = await post(`/jobs/${job.id}/resume`, { selectedPlatforms: ['wechat'] }); assert.equal(resumed.status, 200);
  const final = await settled(f.service, await resumed.json());
  assert.deepEqual(final.selectedPlatforms, ['website']); assert.equal(f.calls.length, 0);
  const listed = await (await fetch(base + '/projects', { headers })).json(); assert.equal(listed[0].availability.website.ready, true);
});
