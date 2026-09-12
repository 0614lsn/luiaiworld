import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, lstat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { ROOT, sha256 } from '../scripts/content/core.mjs';
import { planPrune, applyPrune } from '../scripts/content/prune.mjs';

const json = value => `${JSON.stringify(value, null, 2)}\n`;
async function fixture(t) {
  const parent = join(ROOT, '.content/tests');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'prune-'));
  t.after(async () => { assert.ok(!relative(parent, root).startsWith('..')); await rm(root, { recursive: true }); });
  await mkdir(join(root, '.content/state'), { recursive: true });
  await mkdir(join(root, 'docs'));
  const state = { version: 1, slug: 'example', releases: {}, currentRelease: '' };
  const hashes = [];
  for (let i = 0; i < 6; i++) {
    const inputs = { revision: String(i) };
    const hash = sha256(json({ version: 1, slug: 'example', inputs }));
    hashes.push(hash);
    const folder = join(root, '.content/releases', hash);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'body.txt'), 'reviewed');
    await writeFile(join(folder, 'manifest.json'), json({ version: 1, slug: 'example', releaseHash: hash, inputs, createdAt: `2026-09-0${i + 1}`, artifacts: { 'body.txt': sha256('reviewed') } }));
    state.releases[hash] = { platforms: { website: { stage: 'local_ready' } }, events: [] };
  }
  state.currentRelease = hashes[5];
  state.releases[hashes[1]].events.push({ stage: 'draft_saved' });
  await writeFile(join(root, '.content/releases', hashes[2], 'body.txt'), 'manual change');
  await writeFile(join(root, 'docs/evidence.md'), `${hashes[3].slice(0, 6)}…`);
  const statePath = join(root, '.content/state/example.json');
  await writeFile(statePath, json(state));
  return { root, hashes, state, statePath };
}

test('prune keeps current, previous, platform history, document references and manual edits; apply requires unchanged preview', async t => {
  const f = await fixture(t);
  const plan = await planPrune(f.root, 'example');
  assert.deepEqual(plan.remove.map(e => e.hash), [f.hashes[0]]);
  assert.equal(plan.keep.length, 5);
  await lstat(join(f.root, '.content/releases', f.hashes[0]));
  f.state.releases[f.hashes[0]].events.push({ stage: 'review_pending' });
  await writeFile(f.statePath, json(f.state));
  await assert.rejects(applyPrune(f.root, 'example', plan.planHash), /已变化/);
  f.state.releases[f.hashes[0]].events = [];
  await writeFile(f.statePath, json(f.state));
  const result = await applyPrune(f.root, 'example', plan.planHash);
  assert.deepEqual(result.deleted, [f.hashes[0]]);
  await assert.rejects(lstat(join(f.root, '.content/releases', f.hashes[0])), { code: 'ENOENT' });
  const receipt = JSON.parse(await readFile(join(f.root, '.content/pruned/example', `${f.hashes[0]}.json`), 'utf8'));
  assert.equal(receipt.manifest.releaseHash, f.hashes[0]);
  assert.ok(JSON.parse(await readFile(f.statePath, 'utf8')).releases[f.hashes[0]].artifactsPrunedAt);
  for (const hash of f.hashes.slice(1)) await lstat(join(f.root, '.content/releases', hash));
  assert.equal((await planPrune(f.root, 'example')).remove.length, 0);
});

test('prune rejects directory links before deleting any artifacts', async t => {
  const f = await fixture(t);
  const outside = join(f.root, 'unrelated');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.txt'), 'keep');
  await symlink(outside, join(f.root, '.content/releases', 'f'.repeat(64)), 'junction');
  await assert.rejects(planPrune(f.root, 'example'), /普通目录/);
  assert.equal(await readFile(join(outside, 'keep.txt'), 'utf8'), 'keep');
});

test('pending delivery tasks protect their exact historical package from pruning',async t=>{
  const f=await fixture(t); const before=await planPrune(f.root,'example');
  await mkdir(join(f.root,'.content/delivery/jobs'),{recursive:true});
  await writeFile(join(f.root,'.content/delivery/jobs/pending.json'),json({release:f.hashes[0],stage:'submission_unknown'}));
  const after=await planPrune(f.root,'example'); assert.equal(after.remove.length,0);
  await assert.rejects(applyPrune(f.root,'example',before.planHash),/已变化/);
});
