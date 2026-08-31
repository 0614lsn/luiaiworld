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

function tagAttributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/\s([:\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]),
  );
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

test('built diagram navigation structure is complete; native fragment scrolling remains a browser regression', () => {
  const articleHtml = read(routes.get('/articles/codex-harness-beyond-model/'));
  const navigationBlocks = [...articleHtml.matchAll(
    /<nav\b[^>]*\bclass="[^"]*\bdiagram-nav\b[^"]*"[^>]*>[\s\S]*?<\/nav>/g,
  )].map((match) => match[0]);
  const viewportBlocks = [...articleHtml.matchAll(
    /<span\b[^>]*\bclass="[^"]*\bdiagram-viewport\b[^"]*"[^>]*>\s*<span\b[^>]*\bclass="[^"]*\bdiagram-canvas\b[^"]*"[^>]*>[\s\S]*?<\/span>\s*<\/span>/g,
  )].map((match) => match[0]);

  assert.equal(navigationBlocks.length, 3, 'article must render three native diagram navigations');
  assert.equal(viewportBlocks.length, 3, 'article must render three local diagram viewports');

  const viewports = new Map();
  const targets = new Map();
  const expectedPositions = ['left', 'middle', 'right'];

  for (const block of viewportBlocks) {
    const viewportTag = block.match(/^<span\b[^>]*>/)?.[0];
    const canvasTag = block.match(/<span\b[^>]*\bclass="[^"]*\bdiagram-canvas\b[^"]*"[^>]*>/)?.[0];
    const image = block.match(/<img\b[^>]*>/)?.[0];
    assert.ok(viewportTag && canvasTag, 'diagram viewport must contain its named canvas');

    const viewportAttributes = tagAttributes(viewportTag);
    const canvasAttributes = tagAttributes(canvasTag);
    const diagram = viewportAttributes['data-diagram'];
    assert.ok(diagram, 'diagram viewport must have a stable association key');
    assert.equal(viewports.has(diagram), false, `duplicate viewport association ${diagram}`);
    assert.equal(viewportAttributes.id, `diagram-${diagram}-viewport`);
    assert.equal(viewportAttributes.tabindex, '0');
    assert.equal(viewportAttributes.role, 'region');
    assert.match(viewportAttributes['aria-label'], /触摸横向浏览/);
    assert.doesNotMatch(viewportAttributes['aria-label'], /方向键/);
    assert.equal(canvasAttributes['data-diagram'], diagram);
    assert.ok(image, 'diagram viewport must retain its optimized image');
    assert.match(image, /alt="[^"]+"/);
    assert.match(image, /src="\/_astro\/[^"]+"/);
    assert.match(image, /width="\d+"/);
    assert.match(image, /height="\d+"/);

    const targetTags = [...block.matchAll(
      /<a\b[^>]*\bclass="[^"]*\bdiagram-target\b[^"]*"[^>]*>[^<]+<\/a>/g,
    )].map((match) => match[0]);
    assert.equal(targetTags.length, 3, `${diagram} viewport must contain three visible fragment targets`);

    const targetPositions = targetTags.map((tag) => {
      const attributes = tagAttributes(tag);
      const position = attributes['data-position'];
      assert.match(tag, new RegExp(`\\bdiagram-target--${position}\\b`));
      assert.match(tag, />[左中右]<\/a>$/);
      assert.ok(attributes.id, `${diagram} ${position} target must have an id`);
      assert.equal(targets.has(attributes.id), false, `duplicate fragment target ${attributes.id}`);
      targets.set(attributes.id, { diagram, position, viewportId: viewportAttributes.id });
      return position;
    });
    assert.deepEqual(targetPositions, expectedPositions, `${diagram} targets must remain left-to-right ordered`);
    viewports.set(diagram, viewportAttributes.id);
  }

  assert.equal(targets.size, 9, 'article must render nine unique fragment targets');

  const referencedTargets = new Set();
  for (const block of navigationBlocks) {
    const navigationTag = block.match(/^<nav\b[^>]*>/)?.[0];
    assert.ok(navigationTag, 'diagram navigation must have an opening tag');
    const navigationAttributes = tagAttributes(navigationTag);
    const diagram = navigationAttributes['data-diagram'];
    const viewportId = viewports.get(diagram);
    assert.ok(viewportId, `navigation ${diagram} must have a matching viewport`);
    assert.match(navigationAttributes['aria-label'], /局部导航/);
    assert.equal(navigationAttributes['aria-controls'], viewportId);
    assert.match(block, /触摸横滑，或用 Tab 选择后按 Enter 定位/);
    assert.doesNotMatch(block, /方向键/);

    const controlTags = [...block.matchAll(/<a\b[^>]*>[^<]+<\/a>/g)].map((match) => match[0]);
    assert.equal(controlTags.length, 3, `${diagram} navigation must contain three native links`);
    assert.deepEqual(
      controlTags.map((tag) => tagAttributes(tag)['data-position']),
      expectedPositions,
      `${diagram} controls must remain left-to-right ordered`,
    );

    for (const tag of controlTags) {
      const attributes = tagAttributes(tag);
      const targetId = attributes.href?.slice(1);
      const target = targets.get(targetId);
      assert.ok(target, `${diagram} navigation contains orphan fragment ${attributes.href}`);
      assert.equal(attributes['aria-controls'], viewportId);
      assert.equal(target.diagram, diagram);
      assert.equal(target.position, attributes['data-position']);
      assert.equal(target.viewportId, viewportId);
      referencedTargets.add(targetId);
    }
  }

  assert.equal(referencedTargets.size, targets.size, 'every fragment target must have one navigation reference');
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
    .filter((path) => ['.astro', '.ts', '.md'].includes(extname(path)))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  assert.doesNotMatch(sourceAstro, /client:(?:load|idle|visible|media|only)/);
  assert.equal(filesBelow(join(root, 'public')).filter((path) => extname(path) === '.png').length, 0);
  assert.equal(existsSync(join(dist, 'codex-architecture')), false, 'raw diagram directory copied to dist');
});
