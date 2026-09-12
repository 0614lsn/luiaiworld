// Kept self-contained so the offline review page can embed the same behavior.
export function enhanceCodeBlocks(root = document) {
  root.querySelectorAll('.article-content pre').forEach((pre, index) => {
    const code = pre.querySelector('code');
    if (!code || pre.dataset.copyReady) return;
    pre.dataset.copyReady = 'true';
    const language = pre.dataset.language || 'text';
    const label = ['text', 'plaintext'].includes(language) ? '提示词' : language === 'codex' ? 'Codex 指令' : language.toUpperCase();
    const frame = document.createElement('figure');
    frame.className = 'code-frame';
    frame.dataset.language = language;
    const toolbar = document.createElement('figcaption');
    toolbar.className = 'code-toolbar';
    const caption = document.createElement('span');
    caption.className = 'code-language';
    caption.textContent = label;
    const feedback = document.createElement('span');
    feedback.className = 'copy-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code';
    button.textContent = '复制';
    button.setAttribute('aria-label', `复制第 ${index + 1} 段${label}`);
    button.addEventListener('click', async () => {
      button.disabled = true;
      feedback.textContent = '';
      try {
        await navigator.clipboard.writeText(code.textContent ?? '');
        button.textContent = '已复制';
        feedback.textContent = `第 ${index + 1} 段已复制`;
      } catch {
        button.textContent = '重试复制';
        feedback.textContent = '复制未成功，请选中文字后复制。';
      } finally {
        button.disabled = false;
      }
    });
    toolbar.append(caption, feedback, button);
    pre.before(frame);
    frame.append(toolbar, pre);
  });
}
