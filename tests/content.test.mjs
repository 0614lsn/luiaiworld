import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const articlePath = 'src/content/articles/codex-harness-beyond-model.md';
const article = read(articlePath);

function articleBody(markdown) {
  return markdown.replace(/^---\s*[\s\S]*?\s*---\s*/, '');
}

function visibleProse(markdown) {
  return articleBody(markdown)
    .replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_~>#\[\]]/g, '');
}

function paragraphContaining(markdown, needle) {
  const paragraph = articleBody(markdown)
    .split(/\r?\n\s*\r?\n/)
    .find((candidate) => candidate.includes(needle));
  assert.ok(paragraph, `missing article paragraph containing ${needle}`);
  return paragraph;
}

test('package manifest and lock pin only the planned direct dependencies', () => {
  const manifest = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));

  assert.equal(manifest.engines.node, '>=22.12.0');
  assert.deepEqual(manifest.dependencies, { astro: '7.2.9' });
  assert.deepEqual(manifest.devDependencies, {
    '@astrojs/check': '0.9.10',
    typescript: '6.0.3',
  });
  assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
});

test('content collection uses the Content Layer glob loader and validates metadata', () => {
  const config = read('src/content.config.ts');

  assert.match(config, /from 'astro\/loaders'/);
  assert.match(config, /glob\(\{ pattern: '\*\*\/\*\.\{md,mdx\}', base: '\.\/src\/content\/articles' \}\)/);

  for (const field of ['title', 'description', 'publishedAt', 'tags', 'featured', 'sourceBaseline']) {
    assert.match(config, new RegExp(`\\b${field}:`));
  }

  assert.match(config, /sourceBaseline: z\.string\(\)\.regex\(\/\^\[0-9a-f\]\{40\}\$\/\)/);
});

test('article metadata, source boundary, images and nearby evidence links are present', () => {
  assert.match(article, /^title: "我把 Codex 的源码拆开看了看，最让我意外的不是模型"$/m);
  assert.match(article, /^publishedAt: 2026-08-31$/m);
  assert.match(article, /^featured: true$/m);
  assert.match(article, /^sourceBaseline: "d52478c52ef09f001142a4b82339467c3880877f"$/m);

  const imagePaths = [
    '../../assets/codex-architecture/01-system-context.png',
    '../../assets/codex-architecture/02-turn-loop.png',
    '../../assets/codex-architecture/03-tool-approval-sandbox.png',
  ];
  for (const imagePath of imagePaths) {
    assert.match(article, new RegExp(`!\\[[^\\]]+\\]\\(${imagePath.replaceAll('.', '\\.') }\\)`));
  }

  const evidenceUrls = [
    'https://developers.openai.com/blog/codex-as-a-platform',
    'https://learn.chatgpt.com/docs/open-source',
    'https://learn.chatgpt.com/docs/app-server',
    'https://github.com/openai/codex/commit/d52478c52ef09f001142a4b82339467c3880877f',
  ];
  for (const url of evidenceUrls) {
    assert.ok(article.includes(url), `missing evidence URL ${url}`);
  }

  assert.match(article, /官方/);
  assert.match(article, /源码事实/);
  assert.match(article, /架构归纳/);
  assert.doesNotMatch(article, /数字生命卡兹克|wzglyay@virxact\.com|作者[：:]卡兹克/);
});

test('official open-source entries stay separate from pinned repository source facts', () => {
  const officialParagraph = paragraphContaining(article, 'https://learn.chatgpt.com/docs/open-source');
  const officialComponents = [
    'Codex CLI',
    'Codex SDK',
    'Codex Security CLI',
    'Codex Security TypeScript SDK',
    'Codex App Server',
    'Skills',
    'Plugins',
  ];
  for (const component of officialComponents) {
    assert.ok(officialParagraph.includes(component), `official component list missing ${component}`);
  }
  assert.doesNotMatch(officialParagraph, /Rust Core|协议类型|沙箱辅助组件/);

  const snapshotParagraph = paragraphContaining(article, '/codex-rs/core');
  for (const path of ['/codex-rs/core', '/codex-rs/protocol', '/codex-rs/sandboxing']) {
    assert.ok(snapshotParagraph.includes(`d52478c52ef09f001142a4b82339467c3880877f${path}`));
  }
  assert.match(snapshotParagraph, /源码事实/);
});

test('visible article prose stays inside the length, heading and L1 contract', () => {
  const body = articleBody(article);
  const prose = visibleProse(article);
  const chineseCharacters = prose.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g)?.length ?? 0;
  const headings = body.match(/^#{1,6}\s+/gm) ?? [];

  assert.ok(
    chineseCharacters >= 4000 && chineseCharacters <= 8000,
    `expected 4000-8000 Chinese characters, received ${chineseCharacters}`,
  );
  assert.equal(headings.length, 0, 'article body must not use Markdown headings');

  const bannedLiterals = [
    '说白了',
    '意味着什么',
    '这意味着',
    '本质上',
    '换句话说',
    '不可否认',
    '综上所述',
    '总的来说',
    '首先',
    '其次',
    '最后',
    '值得注意的是',
    '不难发现',
    '让我们来看看',
    '接下来让我们',
    'AI工具',
    '某个模型',
    '相关技术',
    '：',
    '——',
    '“',
    '”',
    '"',
  ];

  const literalHits = bannedLiterals.filter((term) => prose.includes(term));
  const structuralHits = [
    /在当今[^。\n]*的时代/,
    /随着[^。\n]*的发展/,
    /(?:^|\n)\s*[-*+]\s+.*(?:\n\s*[-*+]\s+.*){3,}/m,
  ].filter((pattern) => pattern.test(prose));

  assert.deepEqual(literalHits, [], `L1 literal hits: ${literalHits.join(', ')}`);
  assert.deepEqual(structuralHits, [], 'L1 structural prose scan must have zero hits');
});

test('README exposes only the verified local path', () => {
  const readme = read('README.md');

  assert.match(readme, /Node\.js `>=22\.12\.0`/);
  for (const command of ['npm ci', 'npm run dev', 'npm run check', 'npm run build', 'npm run preview']) {
    assert.ok(readme.includes(command), `README missing ${command}`);
  }

  assert.doesNotMatch(readme, /[A-Za-z]:\\|(?:\d{1,3}\.){3}\d{1,3}|服务器|密钥|部署承诺/);
  assert.ok(readme.split(/\r?\n/).length < 40, 'README should remain a short project entry');
});
