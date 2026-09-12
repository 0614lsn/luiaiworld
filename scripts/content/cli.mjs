import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, prepare, status, record, verifyRelease } from './core.mjs';

const { positionals, values } = parseArgs({ allowPositionals: true, options: {
  release: { type: 'string' }, platform: { type: 'string' }, stage: { type: 'string' },
  target: { type: 'string' }, evidence: { type: 'string' }, 'remote-id': { type: 'string' },
  url: { type: 'string' }, resolution: { type: 'string' }, port: { type: 'string', default: '4322' },
  action: { type: 'string' },
} });
const [command, slug] = positionals;
try {
  let result;
  if (command === 'prepare' && slug) result = await prepare(ROOT, slug);
  else if (command === 'status' && slug) result = await status(ROOT, slug);
  else if (command === 'verify' && slug && values.release) result = (await verifyRelease(ROOT, slug, values.release)).manifest;
  else if (command === 'record' && slug) result = await record(ROOT, slug, { ...values, remoteId: values['remote-id'] });
  else if (command === 'preview' && slug) {
    const state = await status(ROOT, slug);
    const hash = values.release ?? state.currentRelease;
    await verifyRelease(ROOT, slug, hash);
    if (!/^\d+$/.test(values.port) || Number(values.port) < 1024 || Number(values.port) > 65535) throw new Error('预览端口应在 1024–65535 之间');
    const child = spawn(process.execPath, [join(ROOT, 'node_modules/astro/bin/astro.mjs'), 'dev', '--host', '127.0.0.1', '--port', values.port], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, CONTENT_PREVIEW_RELEASE: hash } });
    child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', (code) => { process.exitCode = code ?? 1; });
  } else {
    throw new Error('用法：content prepare|status <id>；verify <id> --release <hash>；preview <id> [--port 4322]；record <id> --release <hash> --platform <platform> --stage <stage> --target <目标> --evidence <证据>。record 仅登记已观察事实，不执行上传或发布。');
  }
  if (result) console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
