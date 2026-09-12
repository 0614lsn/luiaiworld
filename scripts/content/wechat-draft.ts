/// <reference types="node" />
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// This command reads/updates an existing draft. It never publishes or broadcasts.
const [action, slug, candidatePath, expectedHash] = process.argv.slice(2);
if (!['read', 'update'].includes(action) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '')) {
  console.error('用法：wechat-draft.ts read <id>；update <id> <HTML路径> <回读bodyHash>。只操作已登记的草稿，不公开发表。');
  process.exit(1);
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = path.join(root, 'content-projects', slug, 'platforms', 'wechat');
const receiptPath = path.join(directory, 'receipt.json');
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
if (!receipt.mediaId) throw new Error('尚未登记草稿 mediaId；先使用 Baoyu 保存草稿并登记回执');
const skillRoot = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', 'baoyu-post-to-wechat', 'scripts');
const { loadWechatExtendConfig, resolveAccount, loadCredentials } = await import(pathToFileURL(path.join(skillRoot, 'wechat-extend-config.ts')).href);
const { normalizeRemoteConfig, withSshTunnel } = await import(pathToFileURL(path.join(skillRoot, 'wechat-remote-publish.ts')).href);
const account = resolveAccount(loadWechatExtendConfig());
const credentials = loadCredentials(account);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const config = normalizeRemoteConfig({ host: account.remote_publish_host, user: account.remote_publish_user, port: account.remote_publish_port, identityFile: account.remote_publish_identity_file, knownHostsFile: account.remote_publish_known_hosts_file, strictHostKeyChecking: account.remote_publish_strict_host_key_checking, connectTimeout: account.remote_publish_connect_timeout });

await withSshTunnel(config, async (client: any) => {
  const tokenResponse = await client('https://api.weixin.qq.com/cgi-bin/token?' + new URLSearchParams({ grant_type: 'client_credential', appid: credentials.appId, secret: credentials.appSecret }));
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) throw new Error(`获取凭据失败，errcode=${tokenData.errcode}；检查账号配置和出口 IP 白名单`);
  const request = async (endpoint: string, payload: object) => {
    const response = await client(`https://api.weixin.qq.com/cgi-bin/${endpoint}?access_token=${encodeURIComponent(tokenData.access_token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (data.errcode) throw new Error(`${endpoint} 失败，errcode=${data.errcode}`);
    return data;
  };
  let draft = await request('draft/get', { media_id: receipt.mediaId });
  if (draft.news_item?.length !== 1) throw new Error('预期单篇草稿，请先核对平台记录');
  if (action === 'update') {
    if (!candidatePath || !/^[a-f0-9]{64}$/.test(expectedHash ?? '')) throw new Error('更新须提供 HTML 和最近回读的完整 bodyHash');
    const current = draft.news_item[0];
    if (hash(current.content) !== expectedHash) throw new Error('平台稿已被修改，停止覆盖；先重新回读合并人工修改');
    if (!current.thumb_media_id) throw new Error('平台返回的封面素材 ID 为空；先核对当前封面，不自动恢复旧封面');
    const content = fs.readFileSync(path.resolve(candidatePath), 'utf8');
    if (/<(?:script|iframe|svg|button)\b/i.test(content)) throw new Error('正文包含公众号不支持的交互或装饰标签');
    const articles: Record<string, unknown> = { content };
    for (const key of ['title', 'author', 'digest', 'content_source_url', 'thumb_media_id', 'show_cover_pic', 'need_open_comment', 'only_fans_can_comment']) if (current[key] !== undefined) articles[key] = current[key];
    fs.writeFileSync(path.join(directory, 'previous-draft.json'), JSON.stringify(draft, null, 2));
    fs.writeFileSync(path.join(directory, 'last-operation.json'), JSON.stringify({ action: 'update', status: 'submission_unknown', expectedHash, candidateHash: hash(content), at: new Date().toISOString() }, null, 2));
    await request('draft/update', { media_id: receipt.mediaId, index: 0, articles });
    draft = await request('draft/get', { media_id: receipt.mediaId });
    fs.writeFileSync(path.join(directory, 'last-operation.json'), JSON.stringify({ action: 'update', status: 'saved', bodyHash: hash(draft.news_item[0].content), at: new Date().toISOString() }, null, 2));
  }
  const article = draft.news_item[0];
  fs.writeFileSync(path.join(directory, 'draft.json'), JSON.stringify(draft, null, 2));
  fs.writeFileSync(path.join(directory, 'body.html'), article.content);
  Object.assign(receipt, { at: new Date().toISOString(), bodyHash: hash(article.content), currentReadback: 'draft.json', stage: 'draft_saved' });
  delete receipt.previousManualReadback;
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  const title = String(article.title).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  fs.writeFileSync(path.join(directory, 'preview.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>公众号草稿</title><body style="margin:24px 16px;font-family:system-ui,sans-serif"><main style="max-width:677px;margin:auto"><p style="font-size:13px;color:#999">公众号草稿 · 尚未公开发表</p><h1 style="font-size:22px;line-height:1.5">${title}</h1>${article.content}</main></body></html>`);
  console.log(JSON.stringify({ action, title: article.title, bodyHash: receipt.bodyHash, savedLocally: directory, publiclyPublished: false }, null, 2));
});
