import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './core.mjs';
import { DeliveryService } from './delivery.mjs';

const PORT = 4389;
export function authorized(req, token, port) {
  if (req.headers.host !== `127.0.0.1:${port}`) return false;
  const origin = req.headers.origin;
  if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return false;
  const candidate = req.headers.authorization ?? '', expected = `Bearer ${token}`;
  return /^Bearer [a-f0-9]{64}$/.test(candidate) && Buffer.byteLength(candidate) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}
async function body(req, limit = 64_000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('仅接受 JSON 请求');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error('请求过大'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createHub({ root = ROOT, token, port = PORT, service = new DeliveryService(root) }) {
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    if (req.method === 'OPTIONS' && req.headers.host === `127.0.0.1:${port}` && /^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin ?? '')) {
      res.writeHead(204, { 'Access-Control-Allow-Origin': req.headers.origin, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }); return res.end();
    }
    if (!authorized(req, token, req.socket.localPort ?? port)) return send(403, { error: '连接未授权。请在 Edge 扩展中填写本地服务连接码' });
    if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`), path = url.pathname;
      if (req.method === 'GET' && path === '/health') return send(200, { ok: true, version: 1 });
      if (req.method === 'GET' && path === '/projects') return send(200, await service.list());
      if (req.method === 'POST' && path === '/deliver') { const data = await body(req); return send(202, await service.start(data.slug, data.target, data.selectedPlatforms)); }
      const route = path.match(/^\/jobs\/([\da-f-]{36})(?:\/(resume|attempt|complete|problem|cards\/\d+))?$/);
      if (!route) return send(404, { error: '接口不存在' });
      const [, id, action] = route;
      if (req.method === 'GET' && !action) return send(200, await service.get(id));
      if (req.method === 'GET' && action?.startsWith('cards/')) { const bytes = await service.card(id, Number(action.slice(6))); res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(bytes); }
      if (req.method === 'POST') {
        const data = await body(req, action === 'problem' ? 2_100_000 : 64_000);
        if (action === 'resume') return send(200, await service.resume(id, data.instanceId));
        if (action === 'attempt') return send(200, await service.xhsAttempt(id, data.instanceId));
        if (action === 'complete') return send(200, await service.xhsComplete(id, data.instanceId, data.proof));
        if (action === 'problem') return send(200, await service.xhsProblem(id, data.instanceId, data.message, data.imageEvidence));
      }
      send(405, { error: '方法不支持' });
    } catch (error) { send(400, { error: error.message }); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const directory = join(ROOT, '.content/delivery'); await mkdir(directory, { recursive: true });
  const tokenPath = join(directory, 'connection.txt');
  let token = await readFile(tokenPath, 'utf8').then(s => s.trim()).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!token) { token = randomBytes(32).toString('hex'); await writeFile(tokenPath, token + '\n', { flag: 'wx', mode: 0o600 }); }
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('本地连接码格式无效，请检查 .content/delivery/connection.txt');
  const server = createHub({ token });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '4389 端口已占用。请检查已有内容服务，不会另开公网端口。' : '本地内容服务启动失败'); process.exitCode = 1; });
  server.listen(PORT, '127.0.0.1', () => console.log(`三站草稿服务已启动：http://127.0.0.1:${PORT}\n请在 Edge 加载 extensions/draft-delivery，然后打开扩展。\n连接码只保存在本机：${tokenPath}\n按 Ctrl+C 停止；任务记录保留，重新启动后可继续核对。`));
}
