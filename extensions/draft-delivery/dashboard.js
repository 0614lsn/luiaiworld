import { xhsOperation } from './xhs-page.js';
const $ = id => document.getElementById(id);
const CLIENT_VERSION = chrome.runtime.getManifest().version;
$('version').textContent = ` · 扩展 ${CLIENT_VERSION}`;
const API = 'http://127.0.0.1:4389';
const CREATOR = 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=image';
const labels = { queued: '等待适配', preparing: '正在处理', awaiting_browser: '等待 Edge', submission_unknown: '保存结果待核实', draft_saved: '草稿已核实', failed: '尚未完成', blocked: '需要处理', needs_merge: '需要合并人工修改', needs_account_check: '需要核对账号', verification_failed: '内容核验未通过', missing_draft: '旧草稿已不在草稿箱' };
let settings = await chrome.storage.local.get(['token', 'instanceId', 'profileLabel', 'account', 'jobId', 'inspectionTab', 'inspectionJobId']);
await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
if (!settings.instanceId) { settings.instanceId = crypto.randomUUID(); await chrome.storage.local.set({ instanceId: settings.instanceId }); }
let running = false, current = null;
$('profile').value = settings.profileLabel || '';
$('account').value = settings.account || '';
$('token').value = settings.token || '';
async function api(path, value) {
  const response = await fetch(API + path, { method: value === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${settings.token}`, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }), signal: AbortSignal.timeout(20000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '本地服务请求失败'); return data;
}
function message(text) { $('notice').textContent = text; }
function render(job) {
  current = job;
  for (const [name, row] of Object.entries(job.platforms)) { $(name + '-state').textContent = labels[row.stage] || row.stage; $(name + '-message').textContent = row.message || ''; }
  $('recovery').hidden = job.status === 'complete' || running;
  if (job.status === 'complete') message('三站草稿已交付并核实。可以开始人工审核；没有公开发表。');
}
async function connect() {
  await api('/health');
  const projects = await api('/projects');
  $('project').replaceChildren();
  for (const p of projects) { const option = document.createElement('option'); option.value = p.id; option.textContent = `${p.title}${p.ready ? '' : ' · 写作稿待补齐'}`; option.disabled = !p.ready; $('project').append(option); }
  $('deliver').disabled = !projects.some(p => p.ready);
  $('connection').textContent = '已连接本机服务'; $('setup').open = false;
  message(`小红书交付位置：Edge · ${settings.profileLabel} · ${settings.account}`);
  if (settings.jobId) { try { render(await api(`/jobs/${settings.jobId}`)); } catch { /* An old local job may have been archived. */ } }
}
$('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  settings = { ...settings, token: $('token').value.trim(), profileLabel: $('profile').value.trim(), account: $('account').value.trim() };
  await chrome.storage.local.set(settings);
  try { await connect(); } catch { $('connection').textContent = '连接失败，请确认服务已启动、连接码正确'; }
});
async function page(tabId, operation, job, extra = {}, navigating = false) {
  const data = { ...job.xhs, account: job.target.account, ...extra };
  const readOnly = ['find','read'].includes(operation);
  for (let attempt=0;attempt<(readOnly?3:1);attempt++) {
    let results;
    try { results = await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, func: xhsOperation, args: [operation, data] }); }
    catch(error) { if(!readOnly || !/frame.*removed|frame.*not found|context.*invalid|frame.*unloaded/i.test(error.message)) throw error; }
    if (results?.length === 1 && results[0].result) {
      if (results[0].result.error) { const error=new Error(results[0].result.error); error.imageEvidence=results[0].result.imageEvidence; throw error; }
      return results[0].result;
    }
    if (navigating && ['save','open'].includes(operation)) return { navigationPending: true };
    if (readOnly && attempt<2) { await pause(700); await loaded(tabId); }
  }
  throw new Error(`${{find:'查找草稿',fill:'填写内容',read:'读取保存内容',open:'打开草稿',save:'暂存'}[operation]}未返回结果（扩展 ${CLIENT_VERSION}），页面可能仍在重载，请保留小红书页以便核对`);
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function loaded(tabId) {
  for (let i = 0; i < 60; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete' && tab.url?.startsWith('https://creator.xiaohongshu.com/publish/')) {
      await pause(600); const settled=await chrome.tabs.get(tabId);
      if(settled.status==='complete'&&settled.url===tab.url)return;
    }
    await pause(500);
  }
  throw new Error('小红书页面加载超时；请检查网络或登录');
}
async function navigateAction(tabId, operation, job) {
  let resolveNavigation;
  const navigation = new Promise(resolve => { resolveNavigation = resolve; });
  const listener = (id, change) => { if (id === tabId && change.status === 'complete') resolveNavigation(); };
  chrome.tabs.onUpdated.addListener(listener);
  try {
    // A full navigation can destroy the injected script's response. Never repeat
    // the action: wait for the new document and use a separate read-only check.
    try { await page(tabId, operation, job, {}, true); }
    catch (error) { if (!/frame.*removed|frame.*not found|context.*invalid|frame.*unloaded/i.test(error.message)) throw error; }
    await Promise.race([navigation, pause(4000)]);
    await loaded(tabId);
  } finally { chrome.tabs.onUpdated.removeListener(listener); }
}
async function readFound(tabId, job, found, files) {
  await navigateAction(tabId, 'open', job);
  return (await page(tabId, 'read', job, { savedAt: found.savedAt, files })).proof;
}
async function localFiles(job) {
  const files = [];
  for (let i = 0; i < job.xhs.cards.length; i++) {
    const response = await fetch(`${API}/jobs/${job.id}/cards/${i}`, { headers: { Authorization: `Bearer ${settings.token}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('本地图片读取失败');
    const bytes = new Uint8Array(await response.arrayBuffer()); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    files.push(btoa(binary));
  }
  return files;
}
async function deliverXhs(job) {
  if (job.target.instanceId !== settings.instanceId || job.target.account !== settings.account) throw new Error('任务属于其他 Edge profile 或账号，请使用原连接设置');
  const files = await localFiles(job);
  // Reuse our own upload/list page. Never navigate away from an editor the user
  // may have started to review or modify, or reuse an unrelated user-owned tab.
  let tab;
  if (settings.inspectionJobId === job.id && settings.inspectionTab) {
    try {
      const previous = await chrome.tabs.get(settings.inspectionTab);
      if (previous.url?.startsWith(CREATOR.split('?')[0])) {
        const probe = await chrome.scripting.executeScript({target:{tabId:previous.id},func:()=>Boolean(document.querySelector('.tiptap[contenteditable="true"]'))});
        if (probe.length===1 && probe[0].result===false) tab=previous;
      }
    } catch { /* Closed or navigated inspection tabs are never force-recovered. */ }
  }
  if (!tab) {
    tab = await chrome.tabs.create({ url: CREATOR, active: true });
    settings.inspectionTab=tab.id;settings.inspectionJobId=job.id;
    await chrome.storage.local.set({inspectionTab:tab.id,inspectionJobId:job.id});
  }
  await chrome.tabs.update(tab.id, {active:true});
  await loaded(tab.id);
  const existing = await page(tab.id, 'find', job);
  const attemptId = job.platforms.xiaohongshu.attemptId;
  if (existing.exists) return api(`/jobs/${job.id}/complete`, { instanceId: settings.instanceId, proof: { ...await readFound(tab.id, job, existing, files), attemptId } });
  if (job.platforms.xiaohongshu.stage === 'submission_unknown' || job.platforms.xiaohongshu.requireExisting) throw new Error('本任务曾保存过，但当前草稿箱未找到；需人工核实是否删除、改名或换了 profile。没有重复新增');
  await chrome.tabs.update(tab.id, { active: true });
  await page(tab.id, 'fill', job, { files });
  const permit = await api(`/jobs/${job.id}/attempt`, { instanceId: settings.instanceId });
  await navigateAction(tab.id, 'save', job);
  const saved = await page(tab.id, 'find', job);
  if (!saved.exists) throw new Error('暂存后未找到对应草稿；请核实，不重复保存');
  return api(`/jobs/${job.id}/complete`, { instanceId: settings.instanceId, proof: { ...await readFound(tab.id, job, saved, files), attemptId: permit.attemptId } });
}
async function run(job) {
  running = true; $('deliver').disabled = true; $('resume').disabled = true; $('recovery').hidden = true;
  settings.jobId = job.id; await chrome.storage.local.set({ jobId: job.id });
  let browserHandled = false;
  try {
    for (;;) {
      job = await api(`/jobs/${job.id}`); render(job);
      if (!browserHandled && job.xhs && ['awaiting_browser', 'submission_unknown'].includes(job.platforms.xiaohongshu.stage)) {
        browserHandled = true;
        try { job = await deliverXhs(job); render(job); }
        catch (error) { job = await api(`/jobs/${job.id}/problem`, { instanceId: settings.instanceId, message: error.message, imageEvidence:error.imageEvidence }); render(job); }
      }
      if (!Object.values(job.platforms).some(row => ['queued', 'preparing'].includes(row.stage)) && (browserHandled || !['awaiting_browser', 'submission_unknown'].includes(job.platforms.xiaohongshu.stage))) break;
      await pause(1000);
    }
    if (job.status !== 'complete') message('本次交付还有待处理项。已成功的草稿保留；请查看各平台说明。');
  } catch { message('与本地服务的连接中断。请保留小红书页面，重新连接后继续核对；不要再次手动保存同一份内容。'); }
  finally { running = false; $('deliver').disabled = false; $('resume').disabled = false; if (current) render(current); }
}
$('deliver').addEventListener('click', async () => {
  if (running || !$('project').value) return;
  $('deliver').disabled = true;
  try { await run(await api('/deliver', { slug: $('project').value, target: { browser: 'edge', instanceId: settings.instanceId, profileLabel: settings.profileLabel, account: settings.account } })); }
  catch (error) { message(error.message); $('deliver').disabled = false; }
});
$('resume').addEventListener('click', async () => {
  if (running || !current) return;
  try { await run(await api(`/jobs/${current.id}/resume`, { instanceId: settings.instanceId })); } catch (error) { message(error.message); }
});
if (settings.token && settings.account && settings.profileLabel) { try { await connect(); } catch { $('setup').open = true; message('本地服务尚未启动。请运行 npm run content:hub，然后重新连接。'); } }
else $('setup').open = true;
