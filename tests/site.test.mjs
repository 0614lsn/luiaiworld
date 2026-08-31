import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

const routes = new Map([
  ['/', 'dist/index.html'],
  ['/articles/', 'dist/articles/index.html'],
  ['/articles/codex-harness-beyond-model/', 'dist/articles/codex-harness-beyond-model/index.html'],
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

test('static build contains every required route and a resolvable internal link graph', () => {
  for (const [route, relativePath] of routes) {
    assert.ok(existsSync(join(root, relativePath)), `missing output for ${route}`);
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
    assert.equal(ogType, route.includes('/codex-harness-beyond-model/') ? 'article' : 'website');
    titles.push(title);
  }

  assert.equal(new Set(titles).size, routes.size, 'page titles must be unique');

  const articleHtml = read(routes.get('/articles/codex-harness-beyond-model/'));
  assert.match(articleHtml, /<meta property="article:published_time" content="2026-08-31T/);
});

test('built pages retain semantic accessibility and all three optimized diagrams', () => {
  for (const [route, relativePath] of routes) {
    const html = read(relativePath);
    assert.match(html, /<html lang="zh-CN">/, `${route} missing language`);
    assert.match(html, /class="skip-link" href="#main-content"/, `${route} missing skip link`);
    assert.match(html, /<header class="site-header">/, `${route} missing header`);
    assert.match(html, /<nav aria-label="主导航">/, `${route} missing navigation`);
    assert.match(html, /<main id="main-content" tabindex="-1">/, `${route} missing main landmark`);
    assert.match(html, /<footer class="site-footer">/, `${route} missing footer`);
  }

  const articleHtml = read(routes.get('/articles/codex-harness-beyond-model/'));
  const diagramViewports = [...articleHtml.matchAll(/<span\b[^>]*class="diagram-viewport"[^>]*>[\s\S]*?<\/span>/g)]
    .map((match) => match[0]);

  assert.equal(diagramViewports.length, 3, 'article must render three local diagram viewports');
  for (const viewport of diagramViewports) {
    const openingTag = viewport.match(/^<span\b[^>]*>/)[0];
    const image = viewport.match(/<img\b[^>]*>/)?.[0];

    assert.match(openingTag, /tabindex="0"/);
    assert.match(openingTag, /role="region"/);
    assert.match(openingTag, /aria-label="[^"]*方向键[^"]*"/);
    assert.ok(image, 'diagram viewport must retain its image');
    assert.match(image, /alt="[^"]+"/);
    assert.match(image, /src="\/_astro\/[^"]+"/);
    assert.match(image, /width="\d+"/);
    assert.match(image, /height="\d+"/);
  }
});

test('output remains static, self-contained and low-bandwidth aware', () => {
  const outputFiles = filesBelow(dist);
  const htmlAndCss = outputFiles
    .filter((path) => ['.html', '.css'].includes(extname(path)))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  assert.equal(outputFiles.filter((path) => extname(path) === '.js').length, 0, 'client JavaScript bundle detected');
  assert.doesNotMatch(htmlAndCss, /client:(?:load|idle|visible|media|only)/);
  assert.doesNotMatch(htmlAndCss, /<script\b[^>]*src=/i);
  assert.doesNotMatch(htmlAndCss, /@import|fonts\.(?:googleapis|gstatic)\.com|google-analytics|googletagmanager|doubleclick/i);

  const css = read('src/styles/global.css');
  assert.doesNotMatch(css, /gradient\s*\(/i);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /body\s*\{[^}]*overflow-x\s*:\s*hidden/s);
  assert.match(css, /\.diagram-viewport\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /\.diagram-viewport:focus-visible\s*\{/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.diagram-viewport img\s*\{[^}]*min-width:\s*64rem/s);

  const paper = cssCustomProperty(css, '--paper');
  const red = cssCustomProperty(css, '--red');
  const redAccent = cssCustomProperty(css, '--red-accent');
  assert.ok(contrastRatio(red, paper) >= 4.5, 'normal red text must meet WCAG AA contrast');
  assert.equal(redAccent.toLowerCase(), '#d84a2f', 'the decorative vermilion accent must remain');
  assert.doesNotMatch(css, /color:\s*var\(--red-accent\)/);

  const sourceAstro = filesBelow(join(root, 'src'))
    .filter((path) => ['.astro', '.ts', '.md'].includes(extname(path)))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  assert.doesNotMatch(sourceAstro, /client:(?:load|idle|visible|media|only)/);
  assert.equal(filesBelow(join(root, 'public')).filter((path) => extname(path) === '.png').length, 0);
  assert.equal(existsSync(join(dist, 'codex-architecture')), false, 'raw diagram directory copied to dist');
});
