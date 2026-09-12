import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');

test('package manifest and lock pin only the planned direct dependencies', () => {
  const manifest = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));

  assert.equal(manifest.engines.node, '>=22.12.0');
  assert.deepEqual(manifest.dependencies, {
    astro: '7.2.9', '@astrojs/markdown-satteri': '0.3.8', sharp: '0.35.4', ultrahtml: '1.7.0',
  });
  assert.deepEqual(manifest.devDependencies, {
    '@types/node': '24.13.4',
    '@astrojs/check': '0.9.10',
    typescript: '6.0.3',
  });
  assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
});

test('content collection uses the Content Layer glob loader and validates metadata', () => {
  const config = read('src/content.config.ts');

  assert.match(config, /from 'astro\/loaders'/);
  assert.match(config, /pattern: '\*\*\/\*\.\{md,mdx\}'/);
  assert.ok(config.includes('./src/content/articles'));

  for (const field of ['title', 'description', 'publishedAt', 'tags', 'featured', 'sourceBaseline']) {
    assert.match(config, new RegExp(`\\b${field}:`));
  }

  assert.match(config, /sourceBaseline: z\.string\(\)\.regex\(\/\^\[0-9a-f\]\{40\}\$\/\)/);
});

test('published guide retains its source, attribution and all prompt blocks', () => {
  const article = read('src/content/articles/gpt-6-astra.md');
  assert.match(article, /^status: published$/m);
  assert.match(article, /^featured: true$/m);
  assert.ok(article.includes('https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra'));
  assert.ok(article.includes('本文不代表 OpenAI 官方中文发布'));
  assert.equal([...article.matchAll(/^```[^\n]*\n[\s\S]*?^```\s*$/gm)].length, 12);
});

test('README exposes only the verified local path', () => {
  const readme = read('README.md');

  assert.match(readme, /Node\.js `>=22\.12\.0`/);
  for (const command of ['npm ci', 'npm run dev', 'npm run check', 'npm run build', 'npm run preview']) {
    assert.ok(readme.includes(command), `README missing ${command}`);
  }

  // The documented preview binds to loopback; personal machine/network details stay absent.
  assert.doesNotMatch(readme.replaceAll('127.0.0.1', 'localhost'), /[A-Za-z]:\\|(?:\d{1,3}\.){3}\d{1,3}|服务器|密钥|部署承诺/);
  assert.ok(readme.includes('npm run content -- prepare'));
});
