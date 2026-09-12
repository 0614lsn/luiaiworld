/// <reference types="node" />
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deliverWechat } from './wechat-delivery.mjs';

// One machine-readable JSON response. Credentials never enter argv or logs.
const originalError = console.error;
console.error = () => {};
try {
  const [action, slug, release] = process.argv.slice(2);
  if (action !== 'deliver' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug ?? '') || !/^[a-f0-9]{64}$/.test(release ?? '')) throw new Error('invalid_arguments');
  const skillRoot = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', 'baoyu-post-to-wechat', 'scripts');
  const load = (name: string) => import(pathToFileURL(path.join(skillRoot, name)).href);
  const { loadWechatExtendConfig, resolveAccount, loadCredentials } = await load('wechat-extend-config.ts');
  const { normalizeRemoteConfig, withSshTunnel } = await load('wechat-remote-publish.ts');
  const { wechatHttp, buildMultipart } = await load('wechat-http.ts');
  const { loadUploadAsset } = await load('wechat-image-loader.ts');
  const { needsWechatBodyImageProcessing, prepareWechatBodyImageUpload } = await load('wechat-image-processor.ts');
  const config = loadWechatExtendConfig();
  if (config.accounts?.length > 1 && config.accounts.filter((item: any) => item.default).length !== 1) throw new Error('account_selection_required');
  const account = resolveAccount(config);
  const credentials = loadCredentials(account);
  const accountKey = createHash('sha256').update(credentials.appId).digest('hex');
  const run = async (client: any) => {
    let token: string;
    const jsonCall = async (endpoint: string, init: object = {}, query: Record<string, string> = {}) => {
      const response = await client(`https://api.weixin.qq.com/cgi-bin/${endpoint}?` + new URLSearchParams({ access_token: token, ...query }), init);
      if (response.status < 200 || response.status >= 300) throw new Error('wechat_http_error');
      const data = await response.json();
      if (data.errcode) { const error: any = new Error('wechat_api_error'); error.errcode = data.errcode; error.endpoint = endpoint; error.definiteRejection = true; throw error; }
      return data;
    };
    const response = await client('https://api.weixin.qq.com/cgi-bin/token?' + new URLSearchParams({ grant_type: 'client_credential', appid: credentials.appId, secret: credentials.appSecret }));
    const credential = await response.json();
    if (!credential.access_token) { const error: any = new Error('wechat_credentials_error'); error.errcode = credential.errcode; throw error; }
    token = credential.access_token;
    return deliverWechat(fileURLToPath(new URL('../../', import.meta.url)), slug, release, {
      accountKey, defaults: account,
      request: (endpoint: string, payload: object) => {
        if (!['draft/get', 'draft/add'].includes(endpoint)) throw new Error('unsupported_endpoint');
        return jsonCall(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      },
      upload: async (type: string, file: string) => {
        let asset = await loadUploadAsset(file);
        if (type === 'body' && needsWechatBodyImageProcessing(asset)) asset = { ...asset, ...await prepareWechatBodyImageUpload(asset) };
        const multipart = buildMultipart([{ name: 'media', filename: asset.filename, contentType: asset.contentType, data: asset.buffer }]);
        const endpoint = type === 'body' ? 'media/uploadimg' : 'material/add_material';
        return jsonCall(endpoint, { method: 'POST', headers: { 'Content-Type': multipart.contentType }, body: multipart.body }, { type: 'image' });
      },
    });
  };
  const remote = account.default_publish_method === 'remote-api';
  const result = remote ? await withSshTunnel(normalizeRemoteConfig({ host: account.remote_publish_host, user: account.remote_publish_user, port: account.remote_publish_port, identityFile: account.remote_publish_identity_file, knownHostsFile: account.remote_publish_known_hosts_file, strictHostKeyChecking: account.remote_publish_strict_host_key_checking, connectTimeout: account.remote_publish_connect_timeout, proxyJump: account.remote_publish_proxy_jump }), run) : await run(wechatHttp);
  console.log(JSON.stringify(result));
  if (!result.success) process.exitCode = 2;
} catch (error: any) {
  const known = ['invalid_arguments', 'account_selection_required', 'wechat_http_error', 'wechat_api_error', 'wechat_credentials_error', 'unsupported_endpoint'];
  const missing = error.endpoint === 'draft/get' && error.errcode === 40007;
  console.log(JSON.stringify({ platform: 'wechat', success: false, stage: missing ? 'missing_draft' : 'failed', code: known.includes(error.message) ? error.message : 'delivery_failed', ...(Number.isInteger(error.errcode) ? { errcode: error.errcode } : {}), message: missing ? '旧草稿已不存在，可能已发表或删除。本地定稿保留；需要明确确认后才能重建。' : '公众号交付未完成；检查本地交付记录。未确认提交不得重复新增。', publiclyPublished: false }));
  process.exitCode = 1;
} finally {
  console.error = originalError;
}
