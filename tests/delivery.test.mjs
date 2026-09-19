import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ROOT, sha256, PLATFORMS } from '../scripts/content/core.mjs';
import { DeliveryService, verifyXhsProof, validateTarget } from '../scripts/content/delivery.mjs';
import { createHub, authorized } from '../scripts/content/hub.mjs';
import { xhsFixture } from './helpers/xhs-fixture.mjs';

const target = () => ({ browser: 'edge', instanceId: randomUUID(), profileLabel: '测试 Profile', account: '测试账号' });
async function fixture(t, options = {}) {
  const parent = join(ROOT, '.content/tests'); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'delivery-'));
  t.after(async () => { assert.ok(!relative(parent, root).startsWith('..')); await rm(root, { recursive: true }); });
  const directory = join(root, 'content-projects/example'); await mkdir(directory, { recursive: true });
  const article = '---\ntitle: 三站交付测试\ndescription: 内容版本与交付核对\npublishedAt: 2026-09-12\ntags: [测试]\nfeatured: false\nstatus: draft\n---\n\n## 实际内容\n\n正文。\n';
  await writeFile(join(directory, 'article.md'), article);
  await writeFile(join(directory, 'xiaohongshu.json'), JSON.stringify(await xhsFixture(directory, sha256(article), { title: '交付测试', caption: '第一段。\n\n第二段。' })));
  const service = new DeliveryService(root, { wechat: async () => ({ stage: 'draft_saved', disposition: 'existing_preserved', message: '测试回读' }), ...options });
  return { root, directory, article, service };
}
async function ready(service, job) { await service.active.get(job.id); const current = await service.get(job.id); assert.equal(current.platforms.website.stage, 'draft_saved'); return current; }
const proof = job => ({ account: job.target.account, title: job.xhs.title, caption: job.xhs.caption, cardHashes: job.xhs.cards.map(c => c.sha256), savedAt: '保存于2026-09-12 20:00:00', location: 'draft-reopened' });

test('one delivery prepares three representations; double click reuses the job and leaves production alone', async t => {
  const f = await fixture(t), user = target();
  const [a,b] = await Promise.all([f.service.start('example', user, PLATFORMS), f.service.start('example', user, PLATFORMS)]);
  assert.equal(a.id,b.id);
  const job = await ready(f.service,a); assert.equal(job.platforms.xiaohongshu.stage,'awaiting_browser');
  assert.equal(await readFile(join(f.directory,'platforms/website/draft/article.md'),'utf8'),f.article);
  await assert.rejects(readFile(join(f.root,'src/content/articles/example.md')), { code:'ENOENT' });
  const permit = await f.service.xhsAttempt(job.id,user.instanceId);
  await assert.rejects(f.service.xhsAttempt(job.id,user.instanceId), /不能再次保存/);
  const saved = await f.service.xhsComplete(job.id,user.instanceId,{...proof(job),attemptId:permit.attemptId});
  assert.equal(saved.status,'complete');
  assert.equal((await f.service.xhsComplete(job.id,user.instanceId,proof(job))).status,'complete');
});
test('save response loss survives process restart; resume requires readback and cannot save a second time', async t => {
  const f = await fixture(t), user=target(); const job=await ready(f.service,await f.service.start('example',user,PLATFORMS));
  const permit=await f.service.xhsAttempt(job.id,user.instanceId);
  const restarted=new DeliveryService(f.root,{wechat:async()=>({stage:'draft_saved'})});
  const resumed=await restarted.start('example',user,PLATFORMS); assert.equal(resumed.id,job.id); await ready(restarted,resumed);
  await assert.rejects(restarted.xhsAttempt(job.id,user.instanceId),/不能再次保存/);
  await assert.rejects(restarted.xhsComplete(job.id,user.instanceId,{...proof(job),attemptId:randomUUID()}),/回执不匹配/);
  assert.equal((await restarted.xhsComplete(job.id,user.instanceId,{...proof(job),attemptId:permit.attemptId})).status,'complete');
});
test('unknown old-version save can be reconciled by job ID after the source changes',async t=>{
  const f=await fixture(t),user=target(),job=await ready(f.service,await f.service.start('example',user,PLATFORMS));
  const permit=await f.service.xhsAttempt(job.id,user.instanceId);
  await writeFile(join(f.directory,'article.md'),f.article+'\n新工作稿');
  const old=await f.service.resume(job.id,user.instanceId); assert.equal(old.release,job.release);
  const saved=await f.service.xhsComplete(job.id,user.instanceId,{...proof(old),attemptId:permit.attemptId});
  const late=await f.service.xhsProblem(job.id,user.instanceId,'迟到的另一页错误');
  assert.equal(late.platforms.xiaohongshu.stage,'draft_saved'); assert.equal(saved.status,'complete');
});
test('content, image order, profile and partial failures cannot be reported as all delivered', async t => {
  const f=await fixture(t,{wechat:async()=>({stage:'needs_merge',message:'保留人工稿'})}), user=target();
  const job=await ready(f.service,await f.service.start('example',user,PLATFORMS));
  assert.throws(()=>verifyXhsProof(job,{...proof(job),caption:'其他内容'}),/不符/);
  assert.throws(()=>verifyXhsProof(job,{...proof(job),cardHashes:['0'.repeat(64)]}),/图片内容/);
  await assert.rejects(f.service.xhsComplete(job.id,randomUUID(),proof(job)),/profile/);
  const partial=await f.service.xhsComplete(job.id,user.instanceId,proof(job));
  assert.equal(partial.status,'attention'); assert.equal(partial.platforms.xiaohongshu.stage,'draft_saved');
  const other=await f.service.start('example',target(),PLATFORMS); assert.notEqual(other.id,job.id); await ready(f.service,other);
});
test('lossless re-encoding requires exact decoded pixels; one changed pixel still fails',async t=>{
  const f=await fixture(t),job=await ready(f.service,await f.service.start('example',target(),PLATFORMS));
  const source=await f.service.card(job.id,0);
  const repacked=await sharp(source).png({compressionLevel:0}).toBuffer();
  assert.notEqual(sha256(source),sha256(repacked));
  const a=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b=await sharp(repacked).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(sha256(a.data),sha256(b.data));
  const pixelCheck={originalFileHash:sha256(source),savedFileHash:sha256(repacked),original:{width:a.info.width,height:a.info.height,sha256:sha256(a.data)},saved:{width:b.info.width,height:b.info.height,sha256:sha256(b.data)}};
  const readback={...proof(job),cardHashes:[sha256(repacked)],pixelChecks:[pixelCheck]};
  assert.equal(verifyXhsProof(job,readback),true);
  b.data[0]^=1;pixelCheck.saved.sha256=sha256(b.data);
  assert.throws(()=>verifyXhsProof(job,readback),/图片内容/);
});
test('repeating a completed delivery rechecks browser-local storage; manual website edits are protected', async t=>{
  const f=await fixture(t),user=target(); const job=await ready(f.service,await f.service.start('example',user,PLATFORMS));
  await f.service.xhsComplete(job.id,user.instanceId,proof(job));
  const next=await f.service.start('example',user,PLATFORMS); const refreshed=await ready(f.service,next);
  assert.equal(refreshed.platforms.xiaohongshu.requireExisting,true);
  await assert.rejects(f.service.xhsAttempt(job.id,user.instanceId),/不能再次保存/);
  await writeFile(join(f.directory,'platforms/website/draft/article.md'),'人工修改');
  const again=await f.service.start('example',user,PLATFORMS); await f.service.active.get(again.id);
  assert.equal(await readFile(join(f.directory,'platforms/website/draft/article.md'),'utf8'),'人工修改');
  assert.equal((await f.service.get(job.id)).platforms.website.stage,'failed');
});
test('loopback endpoints require token even for reads and reject webpage origins, paths and oversize bodies',async t=>{
  const f=await fixture(t),token='a'.repeat(64);
  const server=createHub({root:f.root,token,port:0,service:f.service});
  // Use a known Host for the test's ephemeral port; production binds port 4389.
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}`;
  const headers={Authorization:`Bearer ${token}`};
  assert.equal((await fetch(url+'/projects')).status,403);
  assert.equal((await fetch(url+'/projects',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
  assert.equal((await fetch(url+'/projects',{headers})).status,200);
  assert.equal(authorized({headers:{host:'evil.example',authorization:`Bearer ${token}`}},token,0),false);
  assert.equal(authorized({headers:{host:'127.0.0.1:0',authorization:'Bearer é'+'0'.repeat(63)}},token,0),false);
  assert.throws(()=>validateTarget({...target(),browser:'iab'}),/Edge/);
  await assert.rejects(f.service.start('../outside',target()),/无效/);
  const response=await fetch(url+'/deliver',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({padding:'x'.repeat(65_000)})});
  assert.equal(response.status,400);
});
