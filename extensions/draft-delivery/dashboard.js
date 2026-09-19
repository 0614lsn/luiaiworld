import { xhsOperation } from './xhs-page.js';
const $ = id => document.getElementById(id);
const CLIENT_VERSION = chrome.runtime.getManifest().version;
$('version').textContent = ` · 扩展 ${CLIENT_VERSION}`;
const API = 'http://127.0.0.1:4389';
const CREATOR = 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=image';
const platformNames = { website: '个人网站', wechat: '微信公众号', xiaohongshu: '小红书' };
const choices = [...document.querySelectorAll('input[name="platform"]')];
const selection = () => choices.filter(input => input.checked).map(input => input.value);
const jobSelection = job => job.selectedPlatforms ?? Object.keys(platformNames);
const labels = { skipped: '本次未选择', queued: '等待适配', preparing: '正在处理', awaiting_browser: '等待 Edge', submission_unknown: '保存结果待核实', draft_saved: '草稿已核实', failed: '尚未完成', blocked: '需要处理', needs_merge: '需要合并人工修改', needs_account_check: '需要核对账号', verification_failed: '内容核验未通过', missing_draft: '旧草稿已不在草稿箱' };
let settings = await chrome.storage.local.get(['token', 'instanceId', 'profileLabel', 'account', 'jobId', 'inspectionTab', 'inspectionJobId', 'selectedProject', 'platformSelections']);
await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
if (!settings.instanceId) { settings.instanceId = crypto.randomUUID(); await chrome.storage.local.set({ instanceId: settings.instanceId }); }
let running = false, connected = false, current = null, projects = [];
$('profile').value = settings.profileLabel || '';
$('account').value = settings.account || '';
$('token').value = settings.token || '';
async function api(path, value) {
  const response = await fetch(API + path, { method: value === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${settings.token}`, ...(value === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }), signal: AbortSignal.timeout(20000) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '本地服务请求失败'); return data;
}
function message(text) { $('notice').textContent = text; }
function updateSelection() {
  const selected = selection(), project = projects.find(p => p.id === $('project').value);
  const unavailable = selected.filter(platform => !project?.availability?.[platform]?.ready);
  const needsAccount = selected.includes('xiaohongshu') && (!settings.account || !settings.profileLabel);
  $('account').required = $('profile').required = selected.includes('xiaohongshu');
  $('deliver').disabled = running || !connected || !selected.length || unavailable.length > 0 || needsAccount;
  $('project').disabled = running; $('platform-choice').disabled = running;
  $('selection-status').textContent = !selected.length ? '请至少选择一个平台。' : unavailable.length ? unavailable.map(platform => `${platformNames[platform]}：${project?.availability?.[platform]?.message || '写作稿待补齐'}`).join('；') : needsAccount ? '选择小红书需要先在连接设置中填写 Edge profile 备注和账号显示名称。' : `本次将交付：${selected.map(platform => platformNames[platform]).join('、')}。`;
}
function restoreSelection() {
  const saved = settings.platformSelections?.[$('project').value] ?? [];
  for (const input of choices) input.checked = saved.includes(input.value);
  updateSelection();
}
async function rememberSelection() {
  settings.selectedProject = $('project').value;
  settings.platformSelections = { ...settings.platformSelections, [settings.selectedProject]: selection() };
  await chrome.storage.local.set({ selectedProject: settings.selectedProject, platformSelections: settings.platformSelections });
}
function render(job) {
  current = job;
  for (const [name, row] of Object.entries(job.platforms)) { $(name + '-state').textContent = labels[row.stage] || row.stage; $(name + '-message').textContent = row.message || ''; }
  $('recovery').hidden = job.status === 'complete' || running;
  $('task-platforms').hidden = false;
  $('task-platforms').textContent = `当前任务：${job.slug} · ${jobSelection(job).map(platform => platformNames[platform]).join('、')}`;
  if (job.status === 'complete') message('所选平台的草稿已交付并核实。可以开始人工审核；没有公开发表。');
}
async function connect() {
  await api('/health');
  projects = await api('/projects');
  if (projects.some(p => !p.availability)) throw new Error('请重启本地服务以使用平台选择');
  connected = true;
  $('project').replaceChildren();
  for (const p of projects) { const option = document.createElement('option'); option.value = p.id; option.textContent = `${p.title}${p.ready ? '' : ' · 写作稿待补齐'}`; option.disabled = !p.ready; $('project').append(option); }
  if (projects.some(p => p.id === settings.selectedProject)) $('project').value = settings.selectedProject;
  restoreSelection();
  $('connection').textContent = '已连接本机服务'; $('setup').open = false;
  message('已连接。请选择本篇需要交付的平台；仅保存草稿，不公开发表。');
  if (settings.jobId) { try { render(await api(`/jobs/${settings.jobId}`)); } catch { /* An old local job may have been archived. */ } }
}
$('connect-form').addEventListener('submit', async event => {
  event.preventDefault();
  settings = { ...settings, token: $('token').value.trim(), profileLabel: $('profile').value.trim(), account: $('account').value.trim() };
  await chrome.storage.local.set(settings);
  try { await connect(); } catch (error) { connected = false; updateSelection(); $('connection').textContent = `连接失败：${error.message}`; }
});
$('project').addEventListener('change', async () => { restoreSelection(); await rememberSelection(); });
for (const input of choices) input.addEventListener('change', async () => { updateSelection(); await rememberSelection(); });
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
  if (!jobSelection(job).includes('xiaohongshu')) throw new Error('本任务未选择小红书');
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
  running = true; updateSelection(); $('resume').disabled = true; $('recovery').hidden = true;
  settings.jobId = job.id; await chrome.storage.local.set({ jobId: job.id });
  let browserHandled = false;
  try {
    for (;;) {
      job = await api(`/jobs/${job.id}`); render(job);
      if (jobSelection(job).includes('xiaohongshu') && !browserHandled && job.xhs && ['awaiting_browser', 'submission_unknown'].includes(job.platforms.xiaohongshu.stage)) {
        browserHandled = true;
        try { job = await deliverXhs(job); render(job); }
        catch (error) { job = await api(`/jobs/${job.id}/problem`, { instanceId: settings.instanceId, message: error.message, imageEvidence:error.imageEvidence }); render(job); }
      }
      if (!Object.values(job.platforms).some(row => ['queued', 'preparing'].includes(row.stage)) && (browserHandled || !['awaiting_browser', 'submission_unknown'].includes(job.platforms.xiaohongshu.stage))) break;
      await pause(1000);
    }
    if (job.status !== 'complete') message('本次交付还有待处理项。已成功的草稿保留；请查看各平台说明。');
  } catch { message('与本地服务的连接中断。请保留小红书页面，重新连接后继续核对；不要再次手动保存同一份内容。'); }
  finally { running = false; updateSelection(); $('resume').disabled = false; if (current) render(current); }
}
$('deliver').addEventListener('click', async () => {
  if (running || $('deliver').disabled || !$('project').value) return;
  const selectedPlatforms = selection();
  const payload = { slug: $('project').value, selectedPlatforms, target: selectedPlatforms.includes('xiaohongshu') ? { browser: 'edge', instanceId: settings.instanceId, profileLabel: settings.profileLabel, account: settings.account } : null };
  running = true; updateSelection(); $('resume').disabled = true;
  try { await rememberSelection(); await run(await api('/deliver', payload)); }
  catch (error) { message(error.message); }
  finally { running = false; updateSelection(); $('resume').disabled = false; }
});
$('resume').addEventListener('click', async () => {
  if (running || !current) return;
  const id = current.id, instanceId = settings.instanceId;
  running = true; updateSelection(); $('resume').disabled = true;
  try { await run(await api(`/jobs/${id}/resume`, { instanceId })); } catch (error) { message(error.message); }
  finally { running = false; updateSelection(); $('resume').disabled = false; }
});
if (settings.token) { try { await connect(); } catch (error) { connected = false; updateSelection(); $('setup').open = true; message(`本地服务连接失败：${error.message}。请运行 npm run content:hub，然后重新连接。`); } }
else $('setup').open = true;
