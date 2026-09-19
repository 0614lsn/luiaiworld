import { readFile, writeFile, mkdir, readdir, lstat, realpath, rm, rename } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, sha256, verifyRelease, withLock } from './core.mjs';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const hashPattern = /^[a-f0-9]{64}$/;

async function plainDirectory(path) {
  if ((await lstat(path)).isSymbolicLink()) throw new Error(`拒绝清理链接目录：${path}`);
  return realpath(path);
}

function strings(value) {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

async function documentReferences(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('文档引用目录中发现链接，请先人工核对');
    if (entry.isDirectory()) result.push(...await documentReferences(path));
    else if (/\.(md|json|txt)$/.test(entry.name)) result.push(await readFile(path, 'utf8'));
  }
  return result;
}

export async function planPrune(root, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('无效文章 ID');
  await plainDirectory(root);
  await plainDirectory(join(root, '.content'));
  const releasesRoot = await plainDirectory(join(root, '.content/releases'));
  await plainDirectory(join(root, '.content/state'));
  const states = [];
  for (const entry of await readdir(join(root, '.content/state'), { withFileTypes: true })) {
    if (!entry.name.endsWith('.json')) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('状态文件不是普通文件');
    states.push(JSON.parse(await readFile(join(root, '.content/state', entry.name), 'utf8')));
  }
  const state = states.find(value => value.slug === slug);
  if (!state || !hashPattern.test(state.currentRelease)) throw new Error('没有有效的当前版本，停止清理');
  const references = [...states.flatMap(strings), ...await documentReferences(join(root, 'docs')),
    ...await documentReferences(join(root, '.content/delivery/jobs')),
    ...await documentReferences(join(root, 'content-projects'))];
  // Human evidence often cites abbreviated hashes (for example `247c8b…`).
  // Conservatively preserve every matching version if a prefix is ambiguous.
  const referencedHashes = references.flatMap(text => text.match(/(?<![a-f0-9])[a-f0-9]{6,64}(?![a-f0-9])/g) ?? []);
  const entries = [];
  for (const entry of await readdir(releasesRoot, { withFileTypes: true })) {
    if (!hashPattern.test(entry.name)) continue;
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('发布包不是普通目录，停止清理');
    const directory = join(releasesRoot, entry.name);
    const resolved = await plainDirectory(directory);
    if (!resolved.startsWith(releasesRoot + sep)) throw new Error('发布包超出允许清理目录');
    let manifest;
    try { manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')); }
    catch { continue; } // Unfinished/unknown artifacts are not cleanup candidates.
    if (manifest.slug !== slug) continue;
    const history = state.releases[entry.name];
    const reasons = [];
    if (!history) reasons.push('没有所属状态记录');
    if (entry.name === state.currentRelease) reasons.push('当前版本');
    if (history?.events?.length || Object.values(history?.platforms ?? {}).some(p => !['local_ready', 'skipped'].includes(p.stage) || p.approval || p.remoteId || p.url)) reasons.push('平台或审核历史');
    if (referencedHashes.some(prefix => entry.name.startsWith(prefix))) reasons.push('状态或文档引用');
    try { await verifyRelease(root, slug, entry.name, { current: false }); }
    catch { reasons.push('产物变化或不完整，保留人工修改'); }
    entries.push({ hash: entry.name, createdAt: manifest.createdAt, reasons, manifest });
  }
  if (!entries.some(entry => entry.hash === state.currentRelease)) throw new Error('当前内容包不存在，停止清理');
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.hash.localeCompare(b.hash));
  const currentIndex = entries.findIndex(entry => entry.hash === state.currentRelease);
  if (currentIndex > 0) entries[currentIndex - 1].reasons.push('当前版本的上一版');
  const plan = { slug, currentRelease: state.currentRelease,
    keep: entries.filter(entry => entry.reasons.length).map(({ hash, reasons }) => ({ hash, reasons })),
    remove: entries.filter(entry => !entry.reasons.length).map(({ hash, manifest }) => ({ hash, artifacts: Object.keys(manifest.artifacts).length })),
  };
  return { ...plan, planHash: sha256(json({ plan, states, manifests: entries.map(e => e.manifest), references })) };
}

export async function applyPrune(root, slug, expectedPlan) {
  if (!hashPattern.test(expectedPlan ?? '')) throw new Error('执行清理必须提供预览得到的 --plan <hash>');
  return withLock(root, slug, async () => {
    const plan = await planPrune(root, slug);
    if (plan.planHash !== expectedPlan) throw new Error('清理候选或引用已变化，请重新预览');
    const releasesRoot = await realpath(join(root, '.content/releases'));
    const statePath = join(root, '.content/state', `${slug}.json`);
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const deleted = [];
    for (const { hash } of plan.remove) {
      const target = await plainDirectory(join(releasesRoot, hash));
      if (!target.startsWith(releasesRoot + sep) || target === releasesRoot) throw new Error('拒绝清理目录之外的路径');
      const { manifest } = await verifyRelease(root, slug, hash, { current: false });
      const archiveRoot = join(root, '.content/pruned');
      await mkdir(archiveRoot, { recursive: true });
      await plainDirectory(archiveRoot);
      const receiptRoot = join(archiveRoot, slug);
      await mkdir(receiptRoot, { recursive: true });
      await plainDirectory(receiptRoot);
      const at = new Date().toISOString();
      // Save metadata before deleting artifacts; interrupted operations retain provenance.
      await writeFile(join(receiptRoot, `${hash}.json`), json({ at, planHash: plan.planHash, manifest, state: state.releases[hash] }), { flag: 'wx' });
      await rm(target, { recursive: true });
      state.releases[hash].artifactsPrunedAt = at;
      const temp = `${statePath}.prune.tmp`;
      await writeFile(temp, json(state));
      await rename(temp, statePath);
      deleted.push(hash);
    }
    return { ...plan, deleted };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [slug, ...args] = process.argv.slice(2);
  try {
    if (args.some((arg, i) => !['--apply', '--plan'].includes(arg) && args[i - 1] !== '--plan')) throw new Error('未知参数');
    const result = args.includes('--apply')
      ? await applyPrune(ROOT, slug, args[args.indexOf('--plan') + 1])
      : await planPrune(ROOT, slug);
    console.log(json(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
