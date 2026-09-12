import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse, renderSync } from 'ultrahtml';
import { sha256, verifyRelease, withLock } from './core.mjs';
import { renderWechatEditorialTheme, inspectWechatArticle } from './wechat-editorial-theme.mjs';

const readJson = async (file, fallback = null) => {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
};
async function atomic(file, value) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await rename(temporary, file);
}
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const textOf = node => node.type === 2 ? node.value : (node.children ?? []).map(textOf).join('');
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
const baseResult = (release) => ({ platform: 'wechat', candidateRelease: release, publiclyPublished: false });

// Convert links before theming: the theme deliberately removes anchor attributes.
// Citations stay on the text baseline and numbering follows first occurrence.
export function adaptWechatDeliveryHtml(html) {
  if (/<(?:script|iframe|svg|button|form|object|embed)\b/i.test(html)) throw new Error('微信正文含不支持的标签');
  const tree = parse(html), references = [], byUrl = new Map();
  function visit(node, literal = false) {
    literal ||= ['pre', 'code'].includes(node.name);
    if (!literal && node.name === 'a') {
      const href = decode(node.attributes?.href ?? '');
      const label = textOf(node).trim();
      node.name = 'span'; node.attributes = {};
      if (/^https?:\/\//i.test(href)) {
        const url = new URL(href);
        if (url.username || url.password) throw new Error('引用 URL 不允许包含凭据');
        let number = byUrl.get(href);
        if (!number) { number = references.length + 1; references.push({ number, label, href }); byUrl.set(href, number); }
        node.children.push(...parse(`<span>[${number}]</span>`).children);
      } else if (href && !href.startsWith('#')) throw new Error('微信引用仅支持 HTTP(S) URL 或页内锚点');
    }
    for (const child of node.children ?? []) visit(child, literal);
  }
  visit(tree);
  const bibliography = references.length ? '<h2>引用链接</h2>' + references.map(ref => `<p>[${ref.number}] ${escape(ref.label)}：${escape(ref.href)}</p>`).join('') : '';
  return renderWechatEditorialTheme(`<section>${renderSync(tree)}${bibliography}</section>`).html;
}

function articleFrom(draft) {
  if (draft.news_item?.length !== 1 || typeof draft.news_item[0].content !== 'string') throw new Error('微信回读不是单篇有效草稿');
  return draft.news_item[0];
}
export function verifyWechatReadback(candidate, actual, title, actualTitle) {
  const expected = inspectWechatArticle(candidate), found = inspectWechatArticle(actual);
  const normalize = text => text.replace(/\s+/gu, '');
  const imageSources = html => {
    const src = []; function visit(node) { if (node.name === 'img') src.push(decode(node.attributes?.src ?? '').replace(/^http:/,'https:')); for (const child of node.children ?? []) visit(child); } visit(parse(html)); return src;
  };
  return title === actualTitle && normalize(expected.body) === normalize(found.body) && normalize(expected.references) === normalize(found.references) && JSON.stringify(expected.prompts) === JSON.stringify(found.prompts) && JSON.stringify(expected.headings) === JSON.stringify(found.headings) && JSON.stringify(imageSources(candidate)) === JSON.stringify(imageSources(actual));
}
async function saveReadback(directory, draft, receipt) {
  const article = articleFrom(draft);
  const previous = await readJson(join(directory, 'draft.json'));
  if (previous && JSON.stringify(previous) !== JSON.stringify(draft)) await atomic(join(directory, 'previous-draft.json'), previous);
  await atomic(join(directory, 'draft.json'), draft);
  await atomic(join(directory, 'body.html'), article.content);
  await atomic(join(directory, 'preview.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>公众号草稿</title><body style="margin:24px 16px;font-family:system-ui,sans-serif"><main style="max-width:677px;margin:auto"><p style="font-size:13px;color:#999">公众号草稿 · 尚未公开发表</p><h1 style="font-size:22px;line-height:1.5">${escape(article.title)}</h1>${article.content}</main></body></html>`);
  await atomic(join(directory, 'receipt.json'), receipt);
}

/** Transport is injected so all delivery decisions are tested without network.
 * request(endpoint, body), upload(type, file), defaults, accountKey (hashed AppID).
 * Only add/get endpoints are used. Existing drafts are never overwritten here.
 */
export async function deliverWechat(root, slug, release, transport) {
  return withLock(root, `wechat-${slug}`, async () => {
    const pack = await verifyRelease(root, slug, release, { current: true });
    const projectDirectory = join(root, 'content-projects', slug);
    const directory = join(projectDirectory, 'platforms', 'wechat');
    const project = await readJson(join(projectDirectory, 'project.json'), {});
    const receiptPath = join(directory, 'receipt.json');
    const operationPath = join(directory, 'delivery-operation.json');
    const receipt = await readJson(receiptPath, {});
    const operation = await readJson(operationPath, {});
    const result = { ...baseResult(release), receiptPath: `content-projects/${slug}/platforms/wechat/receipt.json` };
    if (receipt.accountKey && receipt.accountKey !== transport.accountKey) return { ...result, success: false, stage: 'needs_account_check', message: '当前配置账号与已登记草稿账号不同' };
    if (operation.accountKey && operation.accountKey !== transport.accountKey && (operation.status === 'submission_unknown' || (!receipt.mediaId && operation.mediaId))) return { ...result, success: false, stage: 'needs_account_check', message: '已登记的提交属于另一个配置账号' };
    const mediaId = receipt.mediaId || operation.mediaId;
    if (mediaId) {
      const draft = await transport.request('draft/get', { media_id: mediaId });
      const article = articleFrom(draft);
      let sourceHash = receipt.sourceHash || (operation.mediaId === mediaId ? operation.sourceHash : null);
      if (!sourceHash && project.preparedRelease && /^[a-f0-9]{64}$/.test(project.preparedRelease)) {
        const baseline = await verifyRelease(root, slug, project.preparedRelease, { current: false });
        sourceHash = baseline.manifest.sourceHash;
      }
      const sameSource = sourceHash === pack.manifest.sourceHash;
      if (!receipt.mediaId && operation.mediaId === mediaId) {
        const candidate = await readFile(join(directory, 'candidate.html'), 'utf8');
        if (!verifyWechatReadback(candidate, article.content, operation.title || pack.manifest.title, article.title)) return { ...result, success: false, stage: 'verification_failed', mediaId, message: '新草稿回读与提交内容不符；保留已创建草稿，禁止重复新增' };
      }
      const updated = { ...receipt, mediaId, accountKey: transport.accountKey, title: article.title, bodyHash: sha256(article.content), sourceHash: sourceHash || null, at: new Date().toISOString(), stage: 'draft_saved', currentReadback: 'draft.json', publiclyPublished: false };
      if (!receipt.mediaId && operation.mediaId === mediaId) Object.assign(updated, { release: operation.release, theme: 'editorial-orange' });
      if (sameSource) updated.verifiedForRelease = release;
      await saveReadback(directory, draft, updated);
      if (operation.status === 'submission_unknown' && operation.mediaId === mediaId) await atomic(operationPath, { ...operation, status: 'saved', bodyHash: updated.bodyHash, at: updated.at });
      return { ...result, success: sameSource, stage: sameSource ? 'draft_saved' : 'needs_merge', disposition: 'existing_preserved', sourceHash: updated.sourceHash, bodyHash: updated.bodyHash, mediaId, title: article.title, message: sameSource ? '已回读并保留平台现有草稿与人工修改' : '原稿与现有草稿的来源版本不同，需要合并；平台稿已保留' };
    }
    if (operation.status === 'submission_unknown') return { ...result, success: false, stage: 'submission_unknown', message: '上次新增草稿结果未确认，先核实平台草稿，禁止重复新增' };
    const reviewed = project.delivery?.wechat?.reviewed;
    async function reviewedFile(name) {
      const file = resolve(projectDirectory, name);
      const rel = relative(projectDirectory, file);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('审核稿文件必须在本期项目内');
      return file;
    }
    let html;
    if (reviewed) {
      html = await readFile(await reviewedFile(reviewed.html), 'utf8');
      if (reviewed.sourceHash !== pack.manifest.sourceHash || reviewed.bodyHash !== sha256(html)) throw new Error('审核稿绑定的来源或正文已变化，请先合并');
      if (/<(?:script|iframe|svg|button|form|object|embed)\b/i.test(html)) throw new Error('审核稿含公众号不支持的标签');
    } else html = adaptWechatDeliveryHtml(await readFile(join(pack.directory, 'wechat', 'body.html'), 'utf8'));
    const assetCachePath = join(directory, 'uploaded-assets.json');
    const assetCache = await readJson(assetCachePath, {});
    async function upload(type, file) {
      const key = `${transport.accountKey}:${type}:${sha256(await readFile(file))}`;
      if (assetCache[key]) return assetCache[key];
      const response = await transport.upload(type, file);
      if (type === 'material' ? !response.media_id : !response.url) throw new Error('图片上传未返回有效结果');
      assetCache[key] = response;
      await atomic(assetCachePath, assetCache);
      return response;
    }
    const tree = parse(html), imageNodes = [];
    function collect(node) { if (node.name === 'img') imageNodes.push(node); for (const child of node.children ?? []) collect(child); }
    collect(tree);
    for (const node of imageNodes) {
      const source = decode(node.attributes?.src ?? '');
      if (/^https:\/\/mmbiz\.qpic\.cn\//i.test(source)) continue;
      // Authoring requires local assets, so do not turn arbitrary URLs into downloads.
      if (!source || /^[a-z][a-z\d+.-]*:/i.test(source) || source.startsWith('//')) throw new Error('微信正文图片须来自本篇 assets 或微信图片 CDN');
      const file = resolve(pack.directory, 'wechat', source);
      const fromAssets = relative(join(pack.directory, 'wechat', 'assets'), file);
      if (fromAssets.startsWith('..') || isAbsolute(fromAssets)) throw new Error('微信图片超出本篇 assets 目录');
      const uploaded = await upload('body', file);
      if (!/^https?:\/\/mmbiz\.qpic\.cn\//i.test(uploaded.url)) throw new Error('微信图片 URL 无效');
      node.attributes.src = uploaded.url.replace(/^http:/, 'https:');
    }
    html = renderSync(tree);
    const cover = await upload('material', reviewed?.cover ? await reviewedFile(reviewed.cover) : join(pack.directory, 'wechat', 'cover.png'));
    const defaults = transport.defaults ?? {};
    const article = { article_type: 'news', title: pack.manifest.title, content: html, thumb_media_id: cover.media_id, need_open_comment: defaults.need_open_comment ?? 1, only_fans_can_comment: defaults.only_fans_can_comment ?? 0 };
    if (defaults.default_author) article.author = defaults.default_author;
    const sourceUrl = project.platforms?.website?.url;
    if (sourceUrl && /^https:\/\//.test(sourceUrl)) article.content_source_url = sourceUrl;
    for (const key of ['title','author','digest','content_source_url','need_open_comment','only_fans_can_comment','show_cover_pic']) if (reviewed?.metadata?.[key] !== undefined) article[key] = reviewed.metadata[key];
    const pending = { action: 'add', status: 'submission_unknown', release, title: article.title, sourceHash: pack.manifest.sourceHash, accountKey: transport.accountKey, candidateHash: sha256(html), at: new Date().toISOString() };
    await atomic(join(directory, 'candidate.html'), html);
    await atomic(operationPath, pending);
    let added;
    try { added = await transport.request('draft/add', { articles: [article] }); }
    catch (error) {
      if (error.definiteRejection) await atomic(operationPath, { ...pending, status: 'rejected', errcode: error.errcode });
      throw error;
    }
    if (!added.media_id) throw new Error('新增草稿未返回 mediaId，须先核实平台结果');
    // Persist the recoverable ID before any further request or local snapshot write.
    pending.mediaId = added.media_id;
    await atomic(operationPath, pending);
    const draft = await transport.request('draft/get', { media_id: added.media_id });
    const savedArticle = articleFrom(draft);
    if (!verifyWechatReadback(html, savedArticle.content, article.title, savedArticle.title)) return { ...result, success: false, stage: 'verification_failed', mediaId: added.media_id, message: '新草稿回读与提交内容不符；保留草稿，禁止重复新增' };
    const saved = { mediaId: added.media_id, release, sourceHash: pack.manifest.sourceHash, accountKey: transport.accountKey, title: savedArticle.title, bodyHash: sha256(savedArticle.content), theme: 'editorial-orange', stage: 'draft_saved', currentReadback: 'draft.json', publiclyPublished: false, at: new Date().toISOString() };
    await saveReadback(directory, draft, saved);
    await atomic(operationPath, { ...pending, status: 'saved', bodyHash: saved.bodyHash, at: saved.at });
    return { ...result, success: true, stage: 'draft_saved', disposition: 'created', mediaId: saved.mediaId, title: saved.title, sourceHash: saved.sourceHash, bodyHash: saved.bodyHash };
  });
}
