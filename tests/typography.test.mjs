import assert from 'node:assert/strict';
import test from 'node:test';
import { createSatteriMarkdownProcessor } from '@astrojs/markdown-satteri';
import { parse, ELEMENT_NODE } from 'ultrahtml';
import { inlineWechat } from '../scripts/content/core.mjs';
import { proseTypography, blockLanguage, spaceMixedText } from '../src/lib/markdown-typography.mjs';

const markdown = '中文AI助手，请参阅[官方文档](https://example.test/路径)获取说明。中文**AI**助手，参数`model`值。\n\n```text\n中文AI保持原样。\n  缩进与空格保留\n```\n\n```text codex\n$openai-docs migrate this project to GPT-6 Astra\n```\n\n```bash\necho "hello"\n```';
const renderer = (plugins = [proseTypography, blockLanguage]) => createSatteriMarkdownProcessor({
  syntaxHighlight: { type: 'shiki', excludeLangs: ['text', 'plaintext'] },
  shikiConfig: { theme: 'github-light', wrap: true },
  hastPlugins: plugins,
});

function elements(html, name) {
  const found = [];
  const visit = (node) => {
    if (node.type === ELEMENT_NODE && node.name === name) found.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(parse(html));
  return found;
}

test('shared typography spaces prose across links and emphasis, preserves URLs and literal blocks', async () => {
  const html = (await (await renderer()).render(markdown)).code;
  assert.match(html, /中文 AI 助手/);
  assert.match(html, /参阅 <a href="[^"]+">官方文档<\/a> 获取说明/);
  const baseline = (await (await renderer([])).render(markdown)).code;
  assert.equal(elements(html, 'a')[0].attributes.href, elements(baseline, 'a')[0].attributes.href);
  assert.match(html, /中文 <strong>AI<\/strong> 助手/);
  assert.match(html, /参数 <code>model<\/code> 值/);
  assert.match(html, /中文AI保持原样。\n  缩进与空格保留/);
  assert.match(html, /data-language="codex"/);
  assert.match(html, /data-language="bash"/);
  assert.doesNotMatch(html, /<pre[^>]*data-language="bash"[^>]*data-language=/);
  assert.match(html, /<span style="color:#[0-9A-Fa-f]+">echo<\/span>/);
  assert.equal(spaceMixedText('文档https://example.test/中文API地址 继续AI工作'), '文档https://example.test/中文API地址 继续 AI 工作');
});

test('typography is idempotent and does not add spaces before Chinese punctuation', async () => {
  const input = '看[文档](https://example.test)，再看**AI**。';
  const once = (await (await renderer()).render(input)).code;
  const twice = (await (await renderer([proseTypography, { ...proseTypography, name: 'second-spacing-pass' }, blockLanguage])).render(input)).code;
  assert.equal(twice, once);
  assert.match(once, /<\/a>，/);
  assert.match(once, /<\/strong>。/);
});

test('WeChat export distinguishes inline code, prose prompts, commands and syntax colors without fake controls', async () => {
  const html = inlineWechat((await (await renderer()).render(markdown)).code);
  const codes = elements(html, 'code');
  assert.match(codes[0].attributes.style, /background:#f1f3f6/);
  assert.match(codes[0].attributes.style, /padding:0.12em 0.3em/);
  assert.match(codes[1].attributes.style, /font-family:system-ui,Microsoft YaHei,sans-serif/);
  assert.match(codes[2].attributes.style, /font-family:ui-monospace/);
  assert.match(html, /<span style="color:#[0-9A-Fa-f]+;">echo<\/span>/);
  assert.doesNotMatch(html, /<button|<script|onclick=|navigator\.clipboard/);
  assert.match(html, /中文AI保持原样。\n  缩进与空格保留/);
});
