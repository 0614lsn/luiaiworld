import { readFile, writeFile, mkdir, rename, readdir, copyFile, lstat, realpath } from 'node:fs/promises';
import { join, dirname, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { getInputs, prepare, verifyRelease, sha256, PLATFORMS, selectPlatforms } from './core.mjs';

export async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function atomic(file, data) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  await rename(temp, file);
}
export function validateTarget(target) {
  if (target?.browser !== 'edge' || !/^[\da-f-]{36}$/.test(target.instanceId ?? '') || !target.account?.trim() || target.account.length > 100 || !target.profileLabel?.trim() || target.profileLabel.length > 80) throw new Error('请连接 Edge，并填写此 profile 和小红书账号显示名称');
  return { browser: 'edge', instanceId: target.instanceId, profileLabel: target.profileLabel.trim(), account: target.account.trim() };
}
export async function projectPath(root, slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '')) throw new Error('无效内容项目 ID');
  const base = resolve(root, 'content-projects'), path = join(base, slug);
  if ((await lstat(path)).isSymbolicLink() || !(await realpath(path)).startsWith(base + sep)) throw new Error('不支持指向项目目录外的链接');
  return path;
}
const normalized = text => text.replace(/\s+/gu, '');
export function verifyXhsProof(job, proof) {
  const expected = job.xhs;
  if (proof?.account !== job.target.account || proof.title !== expected.title || normalized(proof.caption ?? '') !== normalized(expected.caption) || proof.cardHashes?.length !== expected.cards.length || !proof.savedAt || proof.location !== 'draft-reopened') throw new Error('草稿回读与本次标题、正文、账号或图片数不符');
  for (let i = 0; i < expected.cards.length; i++) if (proof.cardHashes[i] !== expected.cards[i].sha256) {
    const p = proof.pixelChecks?.[i];
    if (!p || p.originalFileHash !== expected.cards[i].sha256 || p.savedFileHash !== proof.cardHashes[i] || !/^[a-f0-9]{64}$/.test(p.original?.sha256 ?? '') || p.original.sha256 !== p.saved?.sha256 || !Number.isInteger(p.original.width) || p.original.width < 1 || !Number.isInteger(p.original.height) || p.original.height < 1 || p.original.width !== p.saved.width || p.original.height !== p.saved.height) throw new Error(`第 ${i + 1} 张图片内容或顺序与交付包不符`);
  }
  return true;
}
export function summarize(job) {
  const rows = jobPlatforms(job).map(platform => job.platforms[platform]);
  return rows.every(row => row.stage === 'draft_saved') ? 'complete' : rows.some(row => !['queued', 'preparing', 'awaiting_browser', 'draft_saved'].includes(row.stage)) ? 'attention' : 'running';
}
export const jobPlatforms = job => selectPlatforms(job.selectedPlatforms ?? PLATFORMS);
function requireXhs(job) {
  if (!jobPlatforms(job).includes('xiaohongshu')) throw new Error('本任务未选择小红书');
}
export function runWechat(root, slug, release) {
  return new Promise((done) => {
    // npm_execpath is available under npm run; avoid cmd.exe string interpolation.
    const npm = process.env.npm_execpath;
    if (!npm) return done({ stage: 'failed', message: '请用 npm run content:hub 启动服务，以定位本机 npm/Bun 运行器' });
    const child = spawn(process.execPath, [npm, 'exec', '--yes', '--', 'bun', 'scripts/content/wechat-delivery.ts', 'deliver', slug, release], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { if (output.length < 100_000) output += data; });
    child.stderr.on('data', () => {}); // Upstream diagnostics can contain API URLs.
    child.on('error', () => done({ stage: 'failed', message: '无法启动公众号交付进程' }));
    child.on('close', async () => {
      try {
        const result = JSON.parse(output.trim());
        const operation = await readJson(join(root, 'content-projects', slug, 'platforms/wechat/delivery-operation.json'));
        if (!result.success && operation?.status === 'submission_unknown') result.stage = 'submission_unknown';
        done(result);
      }
      catch {
        const operation = await readJson(join(root, 'content-projects', slug, 'platforms/wechat/delivery-operation.json'));
        done({ stage: operation?.status === 'submission_unknown' ? 'submission_unknown' : 'failed', message: '公众号任务未返回有效结果，请检查账号配置和交付记录；不要重复新增草稿' });
      }
    });
  });
}

export class DeliveryService {
  constructor(root, { wechat = runWechat } = {}) { this.root = root; this.wechat = wechat; this.active = new Map(); this.queue = Promise.resolve(); }
  jobPath(id) { if (!/^[\da-f-]{36}$/.test(id ?? '')) throw new Error('无效任务 ID'); return join(this.root, '.content/delivery/jobs', `${id}.json`); }
  async get(id) { const job = await readJson(this.jobPath(id)); if (!job) throw new Error('任务不存在'); return job; }
  async save(job) { job.status = summarize(job); job.updatedAt = new Date().toISOString(); await atomic(this.jobPath(job.id), job); return job; }
  async serial(callback) { const run = this.queue.then(callback); this.queue = run.catch(() => {}); return run; }
  async list() {
    const entries = await readdir(join(this.root, 'content-projects'), { withFileTypes: true });
    const projects = [];
    for (const e of entries) {
      if (!e.isDirectory() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.name)) continue;
      const availability = {}; let title = e.name;
      for (const platform of PLATFORMS) {
        try { const input = await getInputs(this.root, e.name, { platforms: [platform] }); title = input.metadata.title; availability[platform] = { ready: true }; }
        catch { availability[platform] = { ready: false, message: platform === 'xiaohongshu' ? '请先用 baoyu-xhs-images 完成本篇图片，并核对 xiaohongshu.json 文案、图片清单和提示词文件' : '请完成有效的 article.md 与正文附件' }; }
      }
      projects.push({ id: e.name, title, ready: Object.values(availability).some(row => row.ready), availability });
    }
    return projects;
  }
  async assertNoUnknownXhs(slug, instanceId, exceptId) {
    const index = await readJson(join(this.root, '.content/delivery/index.json'), {});
    for (const id of new Set(Object.values(index))) {
      if (id === exceptId) continue;
      const previous = await this.get(id);
      if (previous.slug === slug && previous.target?.instanceId === instanceId && jobPlatforms(previous).includes('xiaohongshu') && ['submission_unknown', 'saving'].includes(previous.platforms.xiaohongshu.stage)) throw new Error('本项目有待核实的小红书保存，先恢复旧任务');
    }
  }
  async start(slug, inputTarget, platforms) {
    return this.serial(async () => {
      await projectPath(this.root, slug);
      if (platforms === undefined) throw new Error('请更新交付扩展并明确选择本次平台');
      const selectedPlatforms = selectPlatforms(platforms);
      const target = selectedPlatforms.includes('xiaohongshu') ? validateTarget(inputTarget) : null;
      const input = await getInputs(this.root, slug, { platforms: selectedPlatforms });
      const key = sha256(JSON.stringify({ slug, release: input.releaseHash, selectedPlatforms, target }));
      const indexPath = join(this.root, '.content/delivery/index.json'), index = await readJson(indexPath, {});
      if (target) await this.assertNoUnknownXhs(slug, target.instanceId, index[key]);
      if (index[key]) {
        const old = await this.get(index[key]);
        if (!this.active.has(old.id)) {
          // Revalidate the browser-local draft even when an older receipt said saved.
          if (selectedPlatforms.includes('xiaohongshu') && old.platforms.xiaohongshu.stage === 'draft_saved') old.platforms.xiaohongshu = { ...old.platforms.xiaohongshu, stage: 'awaiting_browser', requireExisting: true };
          await this.save(old); this.process(old.id);
        }
        return old;
      }
      const rows = Object.fromEntries(PLATFORMS.map(platform => [platform, selectedPlatforms.includes(platform) ? { stage: 'queued' } : { stage: 'skipped', message: '本次未选择，不生成或保存草稿' }]));
      const job = { version: 2, id: randomUUID(), key, slug, release: input.releaseHash, sourceHash: sha256(input.source), selectedPlatforms, target, createdAt: new Date().toISOString(), platforms: rows };
      await this.save(job); index[key] = job.id; await atomic(indexPath, index); this.process(job.id); return job;
    });
  }
  process(id) {
    if (this.active.has(id)) return;
    const task = this.prepareJob(id).catch(async (error) => {
      // These errors come from local input/rendering operations, not credential HTTP.
      await this.serial(async () => { const job = await this.get(id); for (const row of Object.values(job.platforms)) if (['queued', 'preparing'].includes(row.stage)) Object.assign(row, { stage: 'failed', message: `本地适配未完成：${String(error.message).slice(0, 300)}` }); await this.save(job); });
    }).finally(() => this.active.delete(id));
    this.active.set(id, task);
  }
  async resume(id, instanceId) {
    return this.serial(async () => {
      const job = await this.get(id);
      const selected = jobPlatforms(job);
      if (selected.includes('xiaohongshu') && job.target.instanceId !== instanceId) throw new Error('请在原 Edge profile 恢复任务');
      await verifyRelease(this.root, job.slug, job.release, { current: false });
      if (job.xhs && job.platforms.xiaohongshu.stage === 'submission_unknown') return job;
      if (this.active.has(id)) return job;
      const current = await getInputs(this.root, job.slug, { platforms: selected });
      if (current.releaseHash !== job.release) throw new Error('本地版本已变化，旧任务仅允许核实未知提交；请交付新版本');
      if (selected.includes('xiaohongshu') && job.platforms.xiaohongshu.stage === 'draft_saved') job.platforms.xiaohongshu = { ...job.platforms.xiaohongshu, stage: 'awaiting_browser', requireExisting: true };
      await this.save(job); this.process(id); return job;
    });
  }
  async prepareJob(id) {
    let job;
    await this.serial(async () => {
      job = await this.get(id);
      for (const platform of jobPlatforms(job).filter(platform => platform !== 'xiaohongshu')) job.platforms[platform] = { stage: 'preparing', message: '正在验证本地工作稿' };
      await this.save(job);
    });
    const selected = jobPlatforms(job);
    const pack = await prepare(this.root, job.slug, { platforms: selected });
    if (pack.releaseHash !== job.release) throw new Error('任务期间工作稿已变化，请重新交付');
    const { manifest } = await verifyRelease(this.root, job.slug, job.release);
    const project = await projectPath(this.root, job.slug);
    if (selected.includes('website')) {
      const draftDirectory = join(project, 'platforms/website/draft');
      // The local draft is a separate directory from previously published artifacts.
      const websiteReceipt = await readJson(join(draftDirectory, 'receipt.json'));
      const existing = await readFile(join(draftDirectory, 'article.md'), 'utf8').catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
      if (existing && (!websiteReceipt || sha256(existing) !== websiteReceipt.bodyHash)) throw new Error('网站交付稿被人工修改，请先合并回工作稿');
      const website = Object.keys(manifest.artifacts).filter(name => name.startsWith('website/'));
      const websiteFiles = Object.fromEntries(website.map(name => [name === `website/${job.slug}.md` ? 'article.md' : name.slice(8), manifest.artifacts[name]]));
      for (const [file, digest] of Object.entries(websiteReceipt?.files ?? {})) {
        if (!Object.hasOwn(websiteFiles, file)) throw new Error('新版已移除网站附件；请先整理本地上一版附件，未自动删除');
        const current = await readFile(join(draftDirectory, file));
        if (sha256(current) !== digest) throw new Error('网站草稿附件被人工修改，请先合并回工作稿');
      }
      for (const file of Object.keys(websiteFiles).filter(file => file !== 'article.md')) {
        const local = await readFile(join(draftDirectory, file)).catch(e => e.code === 'ENOENT' ? null : Promise.reject(e));
        if (local && !websiteReceipt?.files?.[file]) throw new Error('草稿目标已有未登记的附件，停止覆盖');
      }
      await mkdir(draftDirectory, { recursive: true });
      for (const name of website) {
        const relative = name === `website/${job.slug}.md` ? 'article.md' : name.slice(8);
        await mkdir(dirname(join(draftDirectory, relative)), { recursive: true });
        await copyFile(join(pack.directory, name), join(draftDirectory, relative));
      }
      await atomic(join(draftDirectory, 'receipt.json'), { stage: 'draft_saved', release: job.release, bodyHash: manifest.sourceHash, files: websiteFiles, publiclyPublished: false, at: new Date().toISOString() });
    }
    let xhs;
    if (selected.includes('xiaohongshu')) {
      const post = await readJson(join(pack.directory, 'xiaohongshu/post.json'));
      const cards = Object.entries(manifest.artifacts).filter(([name]) => /^xiaohongshu\/cards\/\d+\.png$/.test(name)).sort(([a], [b]) => a.localeCompare(b)).map(([file, sha256]) => ({ file, sha256 }));
      xhs = { ...post, cards, payloadHash: sha256(JSON.stringify({ post, cards })) };
    }
    await this.serial(async () => {
      job = await this.get(id);
      if (selected.includes('website')) job.platforms.website = { stage: 'draft_saved', path: `content-projects/${job.slug}/platforms/website/draft/article.md`, message: '网站草稿已保存本地，未部署' };
      if (xhs) {
        job.xhs = xhs;
        if (!['submission_unknown', 'draft_saved'].includes(job.platforms.xiaohongshu.stage)) job.platforms.xiaohongshu = { ...job.platforms.xiaohongshu, stage: 'awaiting_browser', message: '等待 Edge 核对并保存图文草稿' };
      }
      if (selected.includes('wechat')) job.platforms.wechat = { stage: 'preparing', message: '正在核对公众号草稿' };
      await this.save(job);
    });
    if (selected.includes('wechat')) {
      const wechat = await this.wechat(this.root, job.slug, job.release);
      await this.serial(async () => { job = await this.get(id); job.platforms.wechat = wechat; await this.save(job); });
    }
  }
  async xhsAttempt(id, instanceId) {
    return this.serial(async () => {
      const job = await this.get(id);
      requireXhs(job);
      if (instanceId !== job.target.instanceId || job.platforms.xiaohongshu.stage !== 'awaiting_browser' || job.platforms.xiaohongshu.requireExisting) throw new Error('不能再次保存；请回读已有或未确认的草稿');
      await this.assertNoUnknownXhs(job.slug, instanceId, job.id);
      await verifyRelease(this.root, job.slug, job.release);
      const attemptId = randomUUID();
      job.platforms.xiaohongshu = { stage: 'submission_unknown', attemptId, message: '已发放一次保存操作，正在等待草稿箱回读' };
      await this.save(job); return { attemptId };
    });
  }
  async xhsComplete(id, instanceId, proof) {
    return this.serial(async () => {
      const job = await this.get(id);
      requireXhs(job);
      if (instanceId !== job.target.instanceId) throw new Error('浏览器 profile 与任务目标不符');
      if (!['awaiting_browser', 'submission_unknown', 'draft_saved'].includes(job.platforms.xiaohongshu.stage)) throw new Error('此任务尚未进入浏览器交付');
      verifyXhsProof(job, proof);
      if (job.platforms.xiaohongshu.stage === 'submission_unknown' && proof.attemptId !== job.platforms.xiaohongshu.attemptId) throw new Error('保存操作回执不匹配');
      const directory = join(await projectPath(this.root, job.slug), 'platforms/xiaohongshu');
      const receipt = { stage: 'draft_saved', storage: 'browser-local', target: job.target, contentRelease: job.release, payloadHash: job.xhs.payloadHash, evidence: proof, at: new Date().toISOString(), publiclyPublished: false };
      const prior = await readJson(join(directory, 'receipt.json'));
      if (prior && prior.target?.instanceId !== instanceId) await atomic(join(directory, 'previous-target-receipt.json'), prior);
      for (const card of job.xhs.cards) { const to = join(directory, 'cards', card.file.split('/').at(-1)); await mkdir(dirname(to), { recursive: true }); await copyFile(join(this.root, '.content/releases', job.release, card.file), to); }
      await atomic(join(directory, 'post.json'), { title: job.xhs.title, caption: job.xhs.caption, sourceHash: job.sourceHash });
      await atomic(join(directory, 'caption.txt'), `${job.xhs.title}\n\n${job.xhs.caption}\n`);
      await atomic(join(directory, 'receipt.json'), receipt);
      job.platforms.xiaohongshu = { stage: 'draft_saved', message: `Edge · ${job.target.profileLabel}：已从草稿箱重新打开并核对标题、正文和 ${job.xhs.cards.length} 张图片`, proof };
      await this.save(job); return job;
    });
  }
  async xhsProblem(id, instanceId, message, imageEvidence) {
    return this.serial(async () => {
      const job = await this.get(id); requireXhs(job); if (instanceId !== job.target.instanceId) throw new Error('目标不匹配');
      const row = job.platforms.xiaohongshu; if (row.stage === 'draft_saved') return job;
      row.message = String(message).slice(0,400);
      if (imageEvidence && Number.isInteger(imageEvidence.index) && job.xhs?.cards[imageEvidence.index] && typeof imageEvidence.base64 === 'string' && imageEvidence.base64.length < 2000000) {
        const bytes = Buffer.from(imageEvidence.base64, 'base64');
        const extension = bytes.subarray(1,4).toString() === 'PNG' ? 'png' : bytes[0] === 255 && bytes[1] === 216 ? 'jpg' : bytes.subarray(8,12).toString() === 'WEBP' ? 'webp' : null;
        if (extension) { const evidencePath=join(this.root,'.content/delivery/evidence',id,`card-${imageEvidence.index+1}.${extension}`); await mkdir(dirname(evidencePath),{recursive:true}); await writeFile(evidencePath,bytes); row.imageEvidence={path:evidencePath,index:imageEvidence.index,mime:imageEvidence.mime,pixelCheck:imageEvidence.pixelCheck}; }
      }
      if (row.stage !== 'submission_unknown') row.stage = 'blocked'; return this.save(job);
    });
  }
  async card(id, index) { const job = await this.get(id); requireXhs(job); const card = job.xhs?.cards[index]; if (!card) throw new Error('图片不存在'); const bytes = await readFile(join(this.root, '.content/releases', job.release, card.file)); if (sha256(bytes) !== card.sha256) throw new Error('图片已变动'); return bytes; }
}
