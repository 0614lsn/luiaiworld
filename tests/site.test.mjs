import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { siteTestPaths, articleFixture } from './helpers/site-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { dist, base } = siteTestPaths(root);
const read = relativePath => readFileSync(relativePath.startsWith('dist/') ? join(dist, relativePath.slice(5)) : join(root, relativePath), 'utf8');

const routes = new Map([
  ['/', 'dist/index.html'],
  ['/articles/', 'dist/articles/index.html'],
  ['/articles/test-guide/', 'dist/articles/test-guide/index.html'],
  ['/about/', 'dist/about/index.html'],
  ['/404.html', 'dist/404.html'],
]);

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

function attribute(html, selector) {
  const match = html.match(selector);
  assert.ok(match, `missing HTML metadata matching ${selector}`);
  return match[1];
}

function localTarget(urlPath) {
  const clean = urlPath.split(/[?#]/, 1)[0];
  if (clean.endsWith('/')) return join(dist, clean.slice(1), 'index.html');
  return join(dist, clean.slice(1));
}

function cssCustomProperty(css, property) {
  const match = css.match(new RegExp(`${property}:\\s*(#[0-9a-f]{6})`, 'i'));
  assert.ok(match, `missing CSS custom property ${property}`);
  return match[1];
}

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const linear = channels.map((value) => (
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  ));
  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('a code-only checkout renders useful pages without any authored articles', () => {
  const home = readFileSync(join(base, 'empty-home.html'), 'utf8');
  const archive = readFileSync(join(base, 'empty-archive.html'), 'utf8');
  assert.match(home, /文章正在准备中/);
  assert.match(home, /href="\/articles\/"/);
  assert.doesNotMatch(home, /href="\/articles\/[^"/]+\//);
  assert.match(archive, /暂无公开文章/);
  assert.doesNotMatch(archive, /href="\/articles\/[^"/]+\//);
});

test('static build contains every required route and a resolvable internal link graph', () => {
  for (const [route, relativePath] of routes) {
    assert.ok(existsSync(join(dist, relativePath.slice(5))), `missing output for ${route}`);
  }
  assert.ok(existsSync(join(dist, 'favicon.svg')), 'missing built favicon');

  for (const [route, relativePath] of routes) {
    const html = read(relativePath);
    const internalHrefs = [...html.matchAll(/\bhref="(\/[^"]*)"/g)].map((match) => match[1]);
    for (const href of internalHrefs) {
      assert.ok(existsSync(localTarget(href)), `${route} links to missing ${href}`);
    }
  }
});

test('every route has unique SEO metadata and the article has publication metadata', () => {
  const titles = [];

  for (const [route, relativePath] of routes) {
    const html = read(relativePath);
    const title = attribute(html, /<title>([^<]+)<\/title>/);
    const description = attribute(html, /<meta name="description" content="([^"]+)"/);
    const canonical = attribute(html, /<link rel="canonical" href="([^"]+)"/);
    const ogTitle = attribute(html, /<meta property="og:title" content="([^"]+)"/);
    const ogDescription = attribute(html, /<meta property="og:description" content="([^"]+)"/);
    const ogType = attribute(html, /<meta property="og:type" content="([^"]+)"/);
    const ogUrl = attribute(html, /<meta property="og:url" content="([^"]+)"/);

    assert.ok(description.length > 10, `${route} description is too short`);
    assert.equal(ogTitle, title);
    assert.equal(ogDescription, description);
    assert.equal(ogUrl, canonical);
    assert.equal(canonical, new URL(route, 'https://luiaiworld.com').href);
    assert.equal(ogType, route.includes('/test-guide/') ? 'article' : 'website');
    titles.push(title);
  }

  assert.equal(new Set(titles).size, routes.size, 'page titles must be unique');

  const articleHtml = read(routes.get('/articles/test-guide/'));
  assert.match(articleHtml, /<meta property="article:published_time" content="2026-01-02T/);
});

test('built pages retain semantic accessibility landmarks', () => {
  for (const [route, relativePath] of routes) {
    const html = read(relativePath);
    assert.match(html, /<html lang="zh-CN">/, `${route} missing language`);
    assert.match(html, /class="skip-link" href="#main-content"/, `${route} missing skip link`);
    assert.match(html, /<header class="site-header">/, `${route} missing header`);
    assert.match(html, /<nav aria-label="主导航">/, `${route} missing navigation`);
    assert.match(html, /<main id="main-content" tabindex="-1">/, `${route} missing main landmark`);
    assert.match(html, /<footer class="site-footer">/, `${route} missing footer`);
  }
});

test('published synthetic article preserves attribution and every literal prompt while drafts stay excluded', () => {
  const html = read(routes.get('/articles/test-guide/'));
  assert.match(html, /测试来源/);
  assert.match(html, /https:\/\/example.test\/source/);
  assert.equal(existsSync(join(dist, 'articles/private-draft/index.html')), false);
  for (const page of ['dist/index.html', 'dist/articles/index.html']) {
    assert.match(read(page), /href="\/articles\/test-guide\/"/);
    assert.doesNotMatch(read(page), /href="\/articles\/private-draft\/"/);
  }
  const source = articleFixture;
  const prompts = [...source.matchAll(/^```[^\n]*\n([\s\S]*?)^```\s*$/gm)].map(m => m[1].replaceAll('\r\n','\n'));
  const decode = s => s.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&');
  const rendered = [...html.matchAll(/<pre\b[^>]*>[\s\S]*?<code\b[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/g)].map(m => decode(m[1].replace(/<[^>]+>/g,'')).replaceAll('\r\n','\n'));
  assert.equal(prompts.length, 3);
  assert.equal(rendered.length, prompts.length);
  for (let i=0;i<prompts.length;i++) assert.equal(rendered[i].replace(/\n$/, ''), prompts[i].replace(/\n$/, ''));
  assert.match(html, /navigator.clipboard|clipboard.writeText/);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for (const m of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(decodeURIComponent(m[1])), 'missing fragment '+m[1]);
});

test('output remains static, self-contained and low-bandwidth aware', () => {
  const outputFiles = filesBelow(dist);
  const htmlAndCss = outputFiles
    .filter((path) => ['.html', '.css'].includes(extname(path)))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  const clientScripts = outputFiles.filter((path) => extname(path) === '.js');
  assert.ok(clientScripts.length <= 1, 'only the article copy helper is allowed');
  for (const file of clientScripts) {
    const script = readFileSync(file, 'utf8');
    assert.ok(Buffer.byteLength(script) < 6000, 'article helper must remain small');
    assert.match(script, /clipboard/);
    assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket|google-analytics/);
  }
  assert.doesNotMatch(htmlAndCss, /client:(?:load|idle|visible|media|only)/);
  for (const [route, relativePath] of routes) {
    const html = read(relativePath);
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    if (!route.includes('/test-guide/')) {
      assert.equal(scripts.length, 0, 'non-article pages must not load client scripts');
      assert.doesNotMatch(html, /navigator\.clipboard/);
    }
    assert.ok(scripts.length <= 1);
    for (const [, attributes, inline] of scripts) {
      const source = attributes.match(/\bsrc="([^"]+)"/)?.[1];
      if (source) {
        assert.ok(source.startsWith('/_astro/'), 'article script must be hosted locally');
        assert.ok(existsSync(localTarget(source)), 'article script must resolve');
      }
      const script = source ? readFileSync(localTarget(source), 'utf8') : inline;
      assert.ok(Buffer.byteLength(script) < 6000, 'article helper must remain small');
      assert.match(script, /clipboard/);
      assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket|google-analytics/);
    }
  }
  assert.doesNotMatch(htmlAndCss, /@import|fonts\.(?:googleapis|gstatic)\.com|google-analytics|googletagmanager|doubleclick/i);

  const css = read('src/styles/global.css');
  assert.doesNotMatch(css, /gradient\s*\(/i);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x\s*:\s*hidden/s);
  assert.match(css, /\.diagram-viewport\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.diagram-viewport:focus-visible\s*\{/);
  assert.match(css, /\.diagram-nav\s*\{/);
  assert.match(css, /\.diagram-target:target\s*\{/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.diagram-canvas\s*\{[^}]*min-width:\s*64rem/s);

  const paper = cssCustomProperty(css, '--paper');
  const red = cssCustomProperty(css, '--red');
  const redAccent = cssCustomProperty(css, '--red-accent');
  assert.ok(contrastRatio(red, paper) >= 4.5, 'normal red text must meet WCAG AA contrast');
  assert.equal(redAccent.toLowerCase(), '#d84a2f', 'the decorative vermilion accent must remain');
  assert.doesNotMatch(css, /color:\s*var\(--red-accent\)/);

  const sourceAstro = filesBelow(join(root, 'src'))
    .filter((path) => ['.astro', '.ts'].includes(extname(path)))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  assert.doesNotMatch(sourceAstro, /client:(?:load|idle|visible|media|only)/);
  const articleAssets = join(root, 'public/content') + sep;
  assert.equal(filesBelow(join(root, 'public')).filter(path => !path.startsWith(articleAssets) && extname(path) === '.png').length, 0);
  assert.equal(existsSync(join(dist, 'codex-architecture')), false, 'raw diagram directory copied to dist');
});
