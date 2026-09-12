import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'ultrahtml';
import { fixDuplicateListMarkers, inspectWechatArticle, renderWechatEditorialTheme } from '../scripts/content/wechat-editorial-theme.mjs';

const input = `<section><blockquote><p>用户保留的来源说明[1]。</p><p>中文整理说明。</p></blockquote>
<h2>主章节</h2><p>人工修改后的正文 <span style="font-weight: bold">保留强调</span><span>[1]</span>。</p>
<h3>提示词</h3><pre><code>  保留开头空格\n下一行 &lt;literal&gt;\n\n末行\n</code></pre>
<h4>引用链接</h4><p><code>[1]</code> 官方来源:&nbsp;<i>https://example.test/guide?a=1&amp;b=2</i><br/></p></section>`;

test('editorial theme preserves manual prose, literal prompts and citation targets while adding heading hierarchy', () => {
  const before = inspectWechatArticle(input);
  const { html, report } = renderWechatEditorialTheme(input);
  const after = inspectWechatArticle(html);
  assert.deepEqual(after.prompts, before.prompts);
  assert.deepEqual(after.usedReferences, before.usedReferences);
  assert.deepEqual(after.definedReferences, before.definedReferences);
  assert.deepEqual(after.headings, ['01\n主章节', '1.1 提示词']);
  assert.match(html, /人工修改后的正文/);
  assert.match(html, /font-weight:700[^>]*>保留强调/);
  assert.match(html, /https:\/\/example.test\/guide\?a=1&amp;b=2/);
  assert.match(html, /white-space:pre-wrap/);
  const parsed = parse(html);
  const tags = [];
  function walk(node) { if (node.name) tags.push(node); for (const child of node.children ?? []) walk(child); }
  walk(parsed);
  const pre = tags.find(node => node.name === 'pre');
  assert.deepEqual(Object.keys(pre.attributes), ['style']);
  assert.match(pre.attributes.style, /font-family:[^;]*Microsoft YaHei[^;]*;font-size:15px;line-height:1.85;color:#454545/);
  assert.doesNotMatch(html, /<sup|<svg|<script|<a\b/);
  assert.equal(report.sections, 1);
  assert.equal(report.subsections, 1);
  assert.equal(report.references, 1);
});

test('reapplying the theme keeps one set of heading numbers and unchanged prompts and references', () => {
  const first = renderWechatEditorialTheme(input).html;
  const second = renderWechatEditorialTheme(first).html;
  assert.deepEqual(inspectWechatArticle(second), inspectWechatArticle(first));
});

test('unexpected reference text after a URL is retained by rejecting conversion', () => {
  assert.throws(() => renderWechatEditorialTheme(input.replace('</i><br/>', ' 人工补充</i><br/>')), /URL 后仍有文字/);
});

test('manual unordered bullets suppress only duplicate native markers and preserve all text', () => {
  const source = '<section><ul><li><section><span>•&nbsp;</span><strong>保留文字</strong></section></li><li>普通列表项</li><li>正文中的 • 符号</li></ul><ol><li>• 有序项</li></ol><pre><code>• 示例文字</code></pre></section>';
  const result = fixDuplicateListMarkers(source);
  assert.equal(result.fixed, 1);
  assert.match(result.html, /<li style=";list-style-type:none"><section>/);
  assert.match(result.html, /<li>普通列表项<\/li>/);
  assert.match(result.html, /<ol><li>• 有序项<\/li><\/ol>/);
  assert.deepEqual(inspectWechatArticle(result.html), inspectWechatArticle(source));
  assert.equal(fixDuplicateListMarkers(result.html).fixed, 0);
  assert.match(renderWechatEditorialTheme(source).html, /list-style-type:none/);
});
