// Runs only in the extension's isolated world on the explicitly selected XHS tab.
// No page credentials, private application state, network API or publish endpoint.
export async function xhsOperation(operation, data) {
  try {
  if (location.origin !== 'https://creator.xiaohongshu.com' || !location.pathname.startsWith('/publish/publish')) throw new Error('请在小红书创作平台图文编辑页操作');
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function wait(check, description, timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) { const result = check(); if (result) return result; await pause(250); }
    throw new Error(description);
  }
  const visible = e => e && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
  const leaf = (root, pattern) => [...root.querySelectorAll('*')].filter(e => e.children.length === 0 && visible(e) && pattern.test(e.textContent.trim()));
  const account = () => document.querySelector('.user-info .name-box')?.textContent.trim();
  const assertAccount = () => { if (account() !== data.account) throw new Error('小红书未登录，或当前账号与连接设置不一致；请核对右上角账号'); };
  const titleInput = () => document.querySelector('input[placeholder="填写标题会有更多赞哦"]');
  const editor = () => document.querySelector('.tiptap[contenteditable="true"]');
  const images = () => [...document.querySelectorAll('.img-container .format-img img.img.preview')];
  const normalize = value => value.replace(/\s+/gu, '');
  const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  async function pixelFingerprint(bytes) {
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const result = { width: bitmap.width, height: bitmap.height, sha256: await digest(pixels) };
    bitmap.close(); return result;
  }
  async function proof(savedAt) {
    assertAccount();
    await wait(() => titleInput() && editor() && images().length === data.cards.length && images().every(e => e.complete && e.naturalWidth), '草稿图片尚未完整加载');
    const title = titleInput().value, caption = editor().innerText;
    if (title !== data.title || normalize(caption) !== normalize(data.caption)) throw new Error('发现同名但正文不同的草稿，已停止，保留平台人工内容');
    const cardHashes = [], pixelChecks = [];
    for (const [index, img] of images().entries()) {
      // Only the images visibly rendered in the current editor are read.
      if (!img.src.startsWith(`blob:${location.origin}/`)) throw new Error('图片不是当前本地草稿文件，需人工核对，未记为成功');
      const response = await fetch(img.src);
      const bytes = await response.arrayBuffer();
      const fileHash = await digest(bytes); cardHashes.push(fileHash);
      let pixelCheck = null;
      if (fileHash !== data.cards[index].sha256) {
        if (!data.files?.[index]) throw new Error(`缺少第 ${index + 1} 张本地原图，无法核对存稿后的图片`);
        const originalBytes = Uint8Array.from(atob(data.files[index]), c => c.charCodeAt(0));
        const originalFileHash = await digest(originalBytes);
        if (originalFileHash !== data.cards[index].sha256) throw new Error('本地原图传输校验失败');
        const original = await pixelFingerprint(originalBytes), saved = await pixelFingerprint(bytes);
        pixelCheck = { originalFileHash, savedFileHash: fileHash, original, saved };
        if (original.width !== saved.width || original.height !== saved.height || original.sha256 !== saved.sha256) {
          const error = new Error(`草稿第 ${index + 1} 张图片的实际像素与本地图不符（原图 ${original.width}×${original.height}，草稿 ${saved.width}×${saved.height}），已保留，未覆盖`);
          if (bytes.byteLength < 1500000) { let binary=''; const sample=new Uint8Array(bytes); for(let offset=0;offset<sample.length;offset+=8192)binary+=String.fromCharCode(...sample.subarray(offset,offset+8192)); error.imageEvidence={index,base64:btoa(binary),mime:response.headers.get('Content-Type'),pixelCheck}; }
          throw error;
        }
      }
      pixelChecks.push(pixelCheck);
    }
    return { account: account(), title, caption, cardHashes, pixelChecks, savedAt, location: 'draft-reopened' };
  }
  async function findDraft(open = false) {
    assertAccount();
    if (editor()) throw new Error('当前页已有编辑内容。请使用“继续核对”打开独立草稿页，避免覆盖');
    let tab = leaf(document, /^图文笔记\(\d+\)$/)[0];
    if (!tab) {
      const boxes = leaf(document, /^草稿箱\(\d+\)$/);
      if (boxes.length !== 1) throw new Error('未找到唯一草稿箱入口，页面结构可能已变化');
      boxes[0].click();
      tab = await wait(() => leaf(document, /^图文笔记\(\d+\)$/)[0], '草稿箱未打开');
    }
    tab.click();
    await wait(() => tab.closest('.tab-item')?.classList.contains('active'), '图文草稿分类未选中');
    const count = Number(tab.textContent.match(/\((\d+)\)/)?.[1]);
    await wait(() => count === 0 ? leaf(document, /^暂无草稿$/).length > 0 : [...document.querySelectorAll('.draft-title-text')].filter(visible).length === count, '图文草稿列表未完整加载，不能判断草稿不存在');
    const names = [...document.querySelectorAll('.draft-title-text')].filter(e => visible(e) && e.textContent.trim() === data.title);
    if (names.length > 1) throw new Error('草稿箱有多篇同名内容，请先人工区分；没有覆盖或新增');
    if (!names.length) return { exists: false };
    let row = names[0].parentElement;
    for (let i = 0; i < 5 && row && !leaf(row, /^编辑$/).length; i++) row = row.parentElement;
    const edits = row && leaf(row, /^编辑$/);
    if (edits?.length !== 1) throw new Error('未能唯一定位这篇草稿的编辑入口');
    const savedAt = row.querySelector('.draft-time')?.textContent.trim();
    if (!savedAt) throw new Error('草稿没有可核实保存时间');
    if (open) edits[0].click();
    // Opening a draft replaces the document. Verification runs in a new script.
    return { exists: true, savedAt };
  }
  await wait(() => account(), '请先在此 Edge profile 登录小红书创作平台'); assertAccount();
  if (operation === 'find') return findDraft();
  if (operation === 'open') return findDraft(true);
  if (operation === 'read') return { proof: await proof(data.savedAt) };
  if (operation === 'fill') {
    if (editor() || titleInput()) throw new Error('编辑器已有内容，未覆盖');
    const close = document.querySelector('.d-drawer-close'); if (visible(close)) close.click();
    const fileInput = document.querySelector('input.upload-input[type="file"][multiple]');
    if (!fileInput || !fileInput.accept.includes('.png')) throw new Error('图文上传控件不可用');
    const transfer = new DataTransfer();
    for (let i = 0; i < data.files.length; i++) {
      const bytes = Uint8Array.from(atob(data.files[i]), c => c.charCodeAt(0));
      transfer.items.add(new File([bytes], `${String(i + 1).padStart(2, '0')}.png`, { type: 'image/png' }));
    }
    fileInput.files = transfer.files; fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(() => titleInput() && editor() && images().length === data.cards.length, '图片上传未完成；请保留页面检查', 60000);
    assertAccount();
    if (titleInput().value.trim() || editor().innerText.trim()) throw new Error('图片上传后出现已有文案，停止覆盖');
    const input = titleInput(); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, data.title);
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    editor().focus();
    if (!document.execCommand('insertText', false, data.caption)) throw new Error('正文写入失败，请检查编辑器');
    await pause(500);
    // Validate editor content before requesting a one-time save permit from the hub.
    const filled = await proof('尚未保存');
    const host = document.querySelector('xhs-publish-btn');
    const shadow = host && chrome.dom.openOrClosedShadowRoot(host);
    const saveButtons = shadow && [...shadow.querySelectorAll('button')].filter(e => e.textContent.trim() === '暂存离开');
    if (saveButtons?.length !== 1 || saveButtons[0].disabled || host.getAttribute('save-disabled') === 'true') throw new Error('暂存按钮不可用，请检查标题长度或图片状态；尚未执行保存');
    return { filled: true, title: filled.title, count: filled.cardHashes.length };
  }
  if (operation === 'save') {
    assertAccount(); await proof('保存前核对');
    const host = document.querySelector('xhs-publish-btn');
    const shadow = host && chrome.dom.openOrClosedShadowRoot(host);
    const buttons = shadow && [...shadow.querySelectorAll('button')].filter(e => e.textContent.trim() === '暂存离开');
    if (buttons?.length !== 1 || buttons[0].disabled || host.getAttribute('save-disabled') === 'true') throw new Error('暂存按钮不可用；保存许可已发出，下一步只回读核实');
    buttons[0].click(); // The only submission action; never select the publish button.
    // Saving also replaces the document, so do not await anything in this context.
    return { clicked: true };
  }
  throw new Error('不支持的页面操作');
  } catch (error) {
    return { error: error instanceof Error ? error.message : '小红书页面操作失败', ...(error.imageEvidence ? {imageEvidence:error.imageEvidence} : {}) };
  }
}
