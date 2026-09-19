import { join } from 'node:path';

// Synthetic content exercises rendering; no personal manuscript is distributed.
export const articleFixture = `---
title: "测试文章：内容与代码分离"
description: "用于验证文章渲染、来源信息和完整提示词的合成测试样例。"
publishedAt: 2026-01-02
tags: [测试]
featured: false
status: published
source:
  label: "测试来源"
  url: "https://example.test/source"
  checkedAt: "2026-01-02"
contentNote: "这是合成测试数据，不是实际发表的文章。"
---

## 保留完整文字

正文包含 **强调**、[来源](https://example.test/source)和中文标点。

\`\`\`text
<instruction>完整提示词
下一行 & 特殊字符</instruction>
\`\`\`

\`\`\`javascript
const answer = 1 < 2 ? "yes" : "no";
\`\`\`

\`\`\`plaintext
多行说明
不应被截断或改写。
\`\`\`
`;

export function siteTestPaths(root) {
  const id = process.env.CONTENT_TEST_RUN;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error('网站构建测试请通过 npm test 运行');
  const base = join(root, '.content/tests', `site-${id}`);
  return { base, dist: join(base, 'dist'), content: join(base, 'content') };
}
