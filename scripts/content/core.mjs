import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rename, open, rm, stat } from 'node:fs/promises';
import { dirname, resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from 'astro/markdown';
import { z } from 'astro/zod';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { parse, renderSync, ELEMENT_NODE } from 'ultrahtml';
import { renderCards, renderWechatCover } from './cards.mjs';
import { proseTypography, blockLanguage } from '../../src/lib/markdown-typography.mjs';
import { enhanceCodeBlocks } from '../../src/lib/code-copy.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PLATFORMS = ['website', 'wechat', 'xiaohongshu'];
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const json = (data) => `${JSON.stringify(data, null, 2)}\n`;
const safeSlug = (slug) => { if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('文章 ID 只允许小写字母、数字和连字符'); return slug; };
const safeHash = (hash) => { if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('请提供完整的 64 位内容版本'); return hash; };
const postSchema = z.object({
  title: z.string().min(1), description: z.string().min(1), publishedAt: z.coerce.date(),
  tags: z.array(z.string().min(1)).min(1), featured: z.boolean(), status: z.literal('draft'),
  source: z.object({ label: z.string().min(1), url: z.url(), checkedAt: z.string().min(1) }).optional(),
  cover: z.object({ kicker: z.string().max(42), subtitle: z.string().max(62) }).optional(),
  eyebrow: z.string().optional(), contentNote: z.string().optional(),
});
const cardSchema = z.object({ layout: z.enum(['body', 'cover']).optional(), kicker: z.string().min(1), heading: z.string().min(1), summary: z.string().min(1), promptLabel: z.string().optional(), prompt: z.string().min(1), note: z.string().min(1) });
const xhsSchema = z.object({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/), title: z.string().min(1).max(40), caption: z.string().min(1), footerLabel: z.string().max(12).optional(), cards: z.array(cardSchema).min(1).max(18) });
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function exists(path) { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function atomicJson(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, json(data), { flag: 'wx' });
  await rename(temp, path);
}

export async function withLock(root, slug, callback) {
  safeSlug(slug);
  const path = join(root, '.content', 'locks', `${slug}.lock`);
  await mkdir(dirname(path), { recursive: true });
  let lock;
  try { lock = await open(path, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('内容任务已上锁；先检查运行中的任务或上次中断，勿直接重复提交');
    throw error;
  }
  try { await lock.writeFile(json({ pid: process.pid, startedAt: new Date().toISOString() })); return await callback(); }
  finally { await lock.close(); await rm(path); }
}

async function filesIn(directory) {
  if (!await exists(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error('内容目录不支持符号链接');
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export async function getInputs(root, slug) {
  safeSlug(slug);
  const directory = join(root, 'content-projects', slug);
  const source = await readFile(join(directory, 'article.md'), 'utf8');
  const parsed = parseFrontmatter(source);
  const metadata = postSchema.parse(parsed.frontmatter);
  if (metadata.source && !metadata.source.url.startsWith('https://')) throw new Error('外部来源须使用 HTTPS URL');
  const xhs = xhsSchema.parse(await readJson(join(directory, 'xiaohongshu.json')));
  if (xhs.sourceHash !== sha256(source)) throw new Error('原稿已变化；请重新审阅小红书改写，并更新 sourceHash 后再准备');
  if (/<\/?(?:script|iframe|form|object|embed)\b/i.test(parsed.content) || /\]\(\s*(?:javascript|file|data):/i.test(parsed.content)) throw new Error('正文包含不支持的可执行 HTML 或链接协议');
  const inputs = {};
  // Sources and platform deliveries belong to the content project, but only
  // authoring inputs affect rendering. A saved API receipt must not invalidate it.
  for (const file of [join(directory, 'article.md'), join(directory, 'xiaohongshu.json'), ...await filesIn(join(directory, 'assets'))]) {
    inputs[relative(root, file).split(sep).join('/')] = sha256(await readFile(file));
  }
  for (const name of ['scripts/content/core.mjs', 'scripts/content/cards.mjs', 'scripts/content/cli.mjs', 'package-lock.json', 'astro.config.mjs', 'src/content.config.ts']) {
    const file = join(root, name);
    if (await exists(file)) inputs[name] = sha256(await readFile(file));
  }
  // Site templates and stylesheet are part of the reviewed representation.
  for (const folder of ['src/layouts', 'src/components', 'src/styles', 'src/pages', 'src/lib']) {
    for (const file of await filesIn(join(root, folder))) inputs[relative(root, file).split(sep).join('/')] = sha256(await readFile(file));
  }
  const releaseHash = sha256(json({ version: 1, slug, inputs }));
  return { directory, source, body: parsed.content, metadata, xhs, inputs, releaseHash };
}

const styles = {
  h1: 'font-size:26px;line-height:1.5;margin:24px 0 18px;font-weight:700;color:#18243a;',
  h2: 'font-size:23px;line-height:1.5;margin:34px 0 16px;font-weight:700;color:#2454cc;',
  h3: 'font-size:19px;line-height:1.6;margin:28px 0 14px;font-weight:700;color:#18243a;',
  p: 'font-size:16px;line-height:1.9;margin:0 0 18px;color:#26344d;word-break:break-word;',
  ul: 'padding-left:24px;margin:16px 0;', ol: 'padding-left:24px;margin:16px 0;',
  li: 'font-size:16px;line-height:1.9;margin:10px 0;color:#26344d;',
  blockquote: 'margin:24px 0;padding:12px 16px;border-left:4px solid #2454cc;background:#eef2f8;',
  pre: 'box-sizing:border-box;width:100%;max-width:100%;margin:22px 0;padding:18px;background:#f5f7fa;border:1px solid #dfe4ec;border-radius:6px;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;',
  code: 'font-family:ui-monospace,Consolas,Microsoft YaHei,monospace;font-size:0.9em;line-height:1.7;background:#f1f3f6;color:#9b3d50;border:1px solid #e4e7ec;border-radius:3px;padding:0.12em 0.3em;word-break:break-word;',
  strong: 'font-weight:700;color:#18243a;', em: 'font-style:italic;',
  a: 'color:#2454cc;text-decoration:underline;word-break:break-all;',
  img: 'max-width:100%;height:auto;display:block;margin:20px auto;',
  hr: 'border:0;border-top:1px solid #ccd3df;margin:28px 0;',
  table: 'border-collapse:collapse;width:100%;font-size:14px;',
  th: 'border:1px solid #ccd3df;padding:8px;background:#eef2f8;',
  td: 'border:1px solid #ccd3df;padding:8px;word-break:break-word;',
};

export function inlineWechat(html) {
  const tree = parse(html);
  const sanitize = (node, language = null) => {
    if (node.children) node.children = node.children.filter((child) => !(child.type === ELEMENT_NODE && ['script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed'].includes(child.name)));
    if (node.type === ELEMENT_NODE) {
      let old = node.attributes;
      if (node.name === 'pre') language = old['data-language'] ?? 'text';
      if (node.name === 'img' && old.__ASTRO_IMAGE_) {
        const decoded = old.__ASTRO_IMAGE_.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        old = JSON.parse(decoded);
      }
      node.attributes = {};
      if (node.name === 'a' && /^https?:\/\//.test(old.href ?? '')) node.attributes.href = old.href;
      if (node.name === 'a' && !node.attributes.href) node.name = 'span';
      if (node.name === 'img') {
        if (!/^(https:\/\/|assets\/)/.test(old.src ?? '')) throw new Error('公众号图片须为 HTTPS 地址或本篇 assets/ 素材');
        node.attributes.src = old.src;
        node.attributes.alt = old.alt ?? '';
      }
      if (!Object.hasOwn(styles, node.name) && !['span', 'br', 'thead', 'tbody', 'tr', 'del'].includes(node.name)) node.name = 'span';
      if (styles[node.name]) node.attributes.style = styles[node.name];
      if (node.name === 'pre') node.attributes['data-language'] = language;
      if (node.name === 'code' && language !== null) {
        const font = ['text', 'plaintext'].includes(language) ? 'system-ui,Microsoft YaHei,sans-serif' : 'ui-monospace,Consolas,Microsoft YaHei,monospace';
        node.attributes.style = `font-family:${font};font-size:16px;line-height:1.8;color:#26344d;background:transparent;padding:0;white-space:pre-wrap;word-break:break-word;`;
      }
      if (node.name === 'span' && language && !['text', 'plaintext', 'codex'].includes(language)) {
        const tokenColor = String(old.style ?? '').match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8})(?=\s*(?:;|$))/i)?.[1];
        if (tokenColor) node.attributes.style = `color:${tokenColor};`;
      }
    }
    for (const child of node.children ?? []) sanitize(child, language);
  };
  sanitize(tree);
  return `<section style="max-width:760px;margin:0 auto;font-family:system-ui,Microsoft YaHei,sans-serif;">${renderSync(tree)}</section>`;
}

function previewHtml(title, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} · 本地草稿</title><style>.code-frame{margin:22px 0;border:1px solid #dfe4ec;border-radius:6px;overflow:hidden;background:#f5f7fa}.code-frame pre{margin:0!important;border:0!important;border-radius:0!important}.code-toolbar{display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid #dfe4ec;font:13px/1.5 system-ui;color:#52617a}.copy-feedback{margin-left:auto}.copy-code{padding:6px 10px;font:inherit;background:white;border:1px solid #c5ceda;border-radius:4px;cursor:pointer}.copy-code:focus-visible{outline:2px solid #2454cc;outline-offset:2px}</style></head><body style="margin:0;background:#f6f0e5;padding:20px;"><p style="font:14px/1.6 system-ui;color:#52617a;text-align:center;">本地富文本预览 · 尚未保存到公众号 · 尚未发布<br>复制按钮仅用于本地审核；公众号导出正文保留可选择的文字，不包含交互按钮。</p><main class="article-content" style="max-width:800px;margin:auto;padding:clamp(16px,4vw,36px);background:white;">${body}</main><script>(${enhanceCodeBlocks.toString()})(document);</script></body></html>`;
}

export async function verifyRelease(root, slug, hash, { current = true } = {}) {
  safeSlug(slug); safeHash(hash);
  const directory = join(root, '.content', 'releases', hash);
  const manifest = await readJson(join(directory, 'manifest.json'));
  if (manifest.slug !== slug || manifest.releaseHash !== hash || sha256(json({ version: 1, slug, inputs: manifest.inputs })) !== hash) throw new Error('内容版本清单不匹配');
  const present = (await filesIn(directory)).map((file) => relative(directory, file).split(sep).join('/')).filter((file) => file !== 'manifest.json').sort();
  if (json(present) !== json(Object.keys(manifest.artifacts).sort())) throw new Error('产物文件清单已变化，请保留人工修改并重新整理输入');
  for (const [file, digest] of Object.entries(manifest.artifacts)) {
    const path = resolve(directory, file);
    if (!path.startsWith(`${resolve(directory)}${sep}`) || sha256(await readFile(path)) !== digest) throw new Error(`产物已被修改：${file}；保留人工修改，重新整理输入并生成新版本`);
  }
  if (current && (await getInputs(root, slug)).releaseHash !== hash) throw new Error('当前输入或模板已变化，旧版本不可继续登记批准或提交结果');
  return { directory, manifest };
}

export async function prepare(root, slug) {
  return withLock(root, slug, async () => {
    const input = await getInputs(root, slug);
    const finalDirectory = join(root, '.content', 'releases', input.releaseHash);
    const selectRelease = async () => {
      const path = join(root, '.content', 'state', `${slug}.json`);
      const state = await exists(path) ? await readJson(path) : { version: 1, slug, releases: {} };
      state.currentRelease = input.releaseHash;
      state.releases[input.releaseHash] ??= { platforms: Object.fromEntries(PLATFORMS.map((platform) => [platform, { stage: 'local_ready', updatedAt: new Date().toISOString() }])), events: [] };
      await atomicJson(path, state);
    };
    if (await exists(finalDirectory)) {
      if (!await exists(join(finalDirectory, 'manifest.json'))) throw new Error('发现中断的未完成内容包；请保留并检查该版本目录，勿覆盖后重复提交');
      await verifyRelease(root, slug, input.releaseHash); await selectRelease();
      return { releaseHash: input.releaseHash, directory: finalDirectory, reused: true };
    }
    // Windows may deny renaming a directory just populated with image artifacts.
    // Exclusively create the version directory; manifest.json is its completion marker.
    await mkdir(dirname(finalDirectory), { recursive: true });
    await mkdir(finalDirectory);
    const temp = finalDirectory;
    const artifacts = {};
    const put = async (name, value) => { const path = join(temp, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, value, { flag: 'wx' }); artifacts[name] = sha256(value); };
    try {
      const processor = await createSatteriMarkdownProcessor({
        syntaxHighlight: { type: 'shiki', excludeLangs: ['text', 'plaintext'] },
        shikiConfig: { theme: 'github-light', wrap: true },
        hastPlugins: [proseTypography, blockLanguage],
      });
      const rendered = await processor.render(input.body);
      for (const image of rendered.metadata.localImagePaths) {
        if (!image.startsWith('assets/') || image.split(/[\\/]/).includes('..') || !await exists(join(input.directory, image))) throw new Error(`本地图片必须存在于本篇 assets/：${image}`);
      }
      const sourceNote = input.metadata.source ? `<p>来源：<a href="${escape(input.metadata.source.url)}">${escape(input.metadata.source.label)}</a>。来源核对日期：${escape(input.metadata.source.checkedAt)}。</p>` : '';
      const wechat = inlineWechat(`<h1>${escape(input.metadata.title)}</h1>${sourceNote}${rendered.code}`);
      await put(`website/${slug}.md`, input.source);
      await put('wechat/body.html', wechat);
      await put('wechat/preview.html', previewHtml(input.metadata.title, wechat));
      await put('wechat/cover.png', await renderWechatCover(input.metadata.title, input.metadata.cover));
      await put('wechat/instructions.txt', '正文见 body.html；preview.html 可在本地浏览器预览。封面 cover.png。请在平台后台粘贴富文本并核对全部提示词、图片和来源。此导出不代表已保存平台草稿；发表与群发是不同动作，本工作流不群发。\n');
      await put('xiaohongshu/caption.txt', `${input.xhs.title}\n\n${input.xhs.caption}\n`);
      await put('xiaohongshu/post.json', json({ title: input.xhs.title, caption: input.xhs.caption, sourceHash: sha256(input.source) }));
      for (const card of await renderCards(input.xhs.cards, input.xhs.footerLabel)) await put(`xiaohongshu/cards/${card.name}`, card.buffer);
      for (const file of await filesIn(join(input.directory, 'assets'))) {
        const asset = relative(join(input.directory, 'assets'), file).split(sep).join('/');
        const buffer = await readFile(file);
        await put(`website/assets/${asset}`, buffer); await put(`wechat/assets/${asset}`, buffer);
      }
      const manifest = { version: 1, slug, releaseHash: input.releaseHash, sourceHash: sha256(input.source), title: input.metadata.title, source: input.metadata.source, createdAt: new Date().toISOString(), inputs: input.inputs, artifacts };
      await atomicJson(join(temp, 'manifest.json'), manifest);
      await selectRelease();
      return { releaseHash: input.releaseHash, directory: finalDirectory, reused: false };
    } catch (error) {
      // Preserve incomplete output and complete packs after interrupted state writes.
      // A later run can recover state from a completed manifest without regenerating it.
      throw error;
    }
  });
}

export async function status(root, slug) {
  const state = await readJson(join(root, '.content', 'state', `${safeSlug(slug)}.json`));
  let verification;
  try { await verifyRelease(root, slug, state.currentRelease); verification = { valid: true }; }
  catch (error) { verification = { valid: false, reason: error.message }; }
  return { ...state, verification };
}

export async function record(root, slug, options) {
  return withLock(root, slug, async () => {
    const { platform, stage, release: hash, target, evidence, remoteId, url, resolution } = options;
    if (!PLATFORMS.includes(platform)) throw new Error('未知平台');
    if (!['draft_saved', 'review_pending', 'approved', 'submission_unknown', 'published', 'blocked'].includes(stage)) throw new Error('不支持的登记状态');
    if (!target?.trim() || !evidence?.trim()) throw new Error('登记需要明确目标与实际观察证据');
    if (resolution && !['confirmed-existing', 'confirmed-absent'].includes(resolution)) throw new Error('resolution 只能是 confirmed-existing 或 confirmed-absent');
    if (resolution === 'confirmed-absent' && ['draft_saved', 'published'].includes(stage)) throw new Error('核实不存在的结果不能登记为已保存或已发布');
    if (url && (!URL.canParse(url) || !/^https?:\/\//.test(url))) throw new Error('回读网址须为 HTTP 或 HTTPS URL');
    // Historical receipts describe facts already observed; new approvals and
    // attempts must still refer to the current, reviewed inputs.
    const historicalReceipt = stage === 'published' || (resolution && ['draft_saved', 'review_pending', 'blocked'].includes(stage));
    const { manifest } = await verifyRelease(root, slug, hash, { current: !historicalReceipt });
    const path = join(root, '.content', 'state', `${slug}.json`);
    const state = await readJson(path);
    const release = state.releases[hash];
    if (!release) throw new Error('没有该版本的状态记录');
    const previous = release.platforms[platform];
    const action = platform === 'wechat' ? 'publish_without_broadcast' : 'publish';
    const attemptAction = options.action ?? action;
    if (![action, 'draft_save'].includes(attemptAction)) throw new Error('动作不受支持；微信公众号没有群发回退动作');
    if (previous.stage === 'published') {
      if (stage === 'published' && previous.target === target && previous.evidence === evidence) return state;
      throw new Error('已发布事实不覆盖；新的修改请生成新内容版本');
    }
    if (previous.stage === 'submission_unknown' && !resolution) throw new Error('提交结果未知；先回读平台，再通过 resolution 登记核实结论');
    if (stage === 'approved' && previous.stage === 'blocked') throw new Error('平台通道仍受限；先处理限制并回读可审核结果');
    if (stage === 'approved' && platform !== 'website' && previous.stage !== 'review_pending' && previous.stage !== 'draft_saved') throw new Error('请先登记具体平台草稿或待人工审核结果');
    if (stage === 'approved' && previous.target && previous.target !== target) throw new Error('批准目标与已审草稿目标不一致');
    if (stage === 'published' || (stage === 'submission_unknown' && attemptAction !== 'draft_save')) {
      if (!previous.approval || previous.approval.releaseHash !== hash || previous.approval.artifactsHash !== sha256(json(manifest.artifacts)) || previous.approval.target !== target || previous.approval.action !== action) throw new Error('没有绑定本版本、产物、平台目标及动作的用户批准');
    }
    if (stage === 'published' && !remoteId && !url) throw new Error('已发布需要回读得到的标识或网址');
    const at = new Date().toISOString();
    const next = { ...previous, stage, target, evidence, updatedAt: at, ...(remoteId ? { remoteId } : {}), ...(url ? { url } : {}) };
    if (previous.target && previous.target !== target) {
      if (!remoteId) delete next.remoteId;
      if (!url) delete next.url;
      delete next.resolution;
    }
    if (stage === 'submission_unknown') next.attemptAction = attemptAction;
    if (stage === 'approved') next.approval = { releaseHash: hash, artifactsHash: sha256(json(manifest.artifacts)), target, action, evidence, approvedAt: at };
    else if (!['published', 'submission_unknown'].includes(stage)) delete next.approval;
    if (stage === 'submission_unknown' && attemptAction === 'draft_save') delete next.approval;
    if (resolution) next.resolution = resolution;
    release.platforms[platform] = next;
    release.events.push({ platform, stage, target, evidence, at, ...(stage === 'submission_unknown' ? { attemptAction } : {}), ...(resolution ? { resolution } : {}) });
    await atomicJson(path, state);
    return state;
  });
}
