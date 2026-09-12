import { parse, renderSync } from 'ultrahtml';

// Unquoted multi-word family names also avoid quotes inside inline HTML attributes.
const FONT = '-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,Arial,sans-serif';
const ORANGE = '#ff7800';
const text = node => node.name === 'br' ? '\n' : node.type === 2 ? node.value : (node.children ?? []).map(text).join('');
const decode = value => value.replace(/&(nbsp|amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, key) => {
  if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(key[1] === 'x' ? 2 : 1), key[1] === 'x' ? 16 : 10));
  return { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[key];
});
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const children = html => parse(html).children;

export function fixDuplicateListMarkers(html) {
  const tree = parse(html);
  let fixed = 0;
  function visit(node, list = null, literal = false) {
    literal = literal || node.name === 'pre' || node.name === 'code';
    if (node.name === 'ul' || node.name === 'ol') list = node.name;
    if (!literal && node.name === 'li' && list === 'ul' && /^[•●]\s/.test(decode(text(node)).trimStart())) {
      node.attributes ??= {};
      const style = node.attributes.style ?? '';
      if (!/(?:^|;)\s*list-style-type\s*:\s*none\s*(?:;|$)/i.test(style)) {
        node.attributes.style = style.replace(/(?:^|;)\s*list-style-type\s*:[^;]*/gi, '') + ';list-style-type:none';
        fixed++;
      }
    }
    for (const child of node.children ?? []) visit(child, list, literal);
  }
  visit(tree);
  return { html: renderSync(tree), fixed };
}

export function inspectWechatArticle(html) {
  const tree = parse(html), prompts = [], headings = [];
  let inReferences = false, body = '', references = '';
  function visit(node, inPre = false) {
    if (/^h[1-6]$/.test(node.name ?? '')) {
      const label = decode(text(node)).trim();
      if (/^(引用链接|参考资料|参考文献|References)$/i.test(label)) inReferences = true;
      else headings.push(label);
    }
    if (node.name === 'code' && inPre) prompts.push(decode(text(node)));
    if (node.type === 2 && !inPre) {
      if (inReferences) references += decode(node.value);
      else body += decode(node.value);
    }
    if (node.name === 'br' && !inPre) {
      if (inReferences) references += '\n';
      else body += '\n';
    }
    for (const child of node.children ?? []) visit(child, inPre || node.name === 'pre');
    if (!inPre && ['p', 'section', 'li'].includes(node.name)) {
      if (inReferences) references += '\n';
      else body += '\n';
    }
  }
  visit(tree);
  body = body.replace(/\s*\n\s*/g, '\n').trim();
  references = references.replace(/\s*\n\s*/g, '\n').trim();
  return { prompts, headings, body, references,
    usedReferences: [...body.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])),
    definedReferences: [...references.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])),
  };
}

// Recreates the typography visible in the user's reference screenshots.
// Works on the current platform HTML, preserving manual edits and metadata.
export function renderWechatEditorialTheme(html) {
  const tree = parse(html);
  let sectionNumber = 0, subsectionNumber = 0, subheadings = 0;
  const referenceNodes = [];
  let referencesStarted = false;
  const styles = {
    p: 'margin:0 0 24px;text-align:justify',
    ul: 'margin:18px 0 26px;padding-left:24px',
    ol: 'margin:18px 0 26px;padding-left:24px',
    li: 'margin:7px 0;padding:0',
    strong: 'font-weight:700;color:#272727',
    b: 'font-weight:700;color:#272727',
    em: 'font-style:italic', i: 'font-style:italic',
    blockquote: 'margin:24px 0 32px;padding:0 0 0 16px;border-left:3px solid #dedede;color:#888;font-size:14px;line-height:1.8',
    pre: `box-sizing:border-box;width:100%;max-width:100%;margin:24px 0 30px;padding:18px 20px;border:0;border-radius:2px;background:#f7f7f9;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;font-family:${FONT};font-size:15px;line-height:1.85;color:#454545;letter-spacing:0`,
    code: 'padding:1px 3px;background:#f4f4f6;color:#555;font-size:0.92em;border-radius:2px',
    hr: 'margin:32px 0;border:0;border-top:1px solid #eee',
    img: 'display:block;max-width:100%;height:auto;margin:24px auto',
    table: 'width:100%;border-collapse:collapse;font-size:14px;line-height:1.7;margin:24px 0',
    th: 'border:1px solid #e7e7e7;background:#f7f7f9;padding:10px;text-align:left;font-weight:600',
    td: 'border:1px solid #e7e7e7;padding:10px;text-align:left',
  };
  function visit(node, context = { pre: false, quote: false, root: true }) {
    if (!node.name) { for (const child of node.children ?? []) visit(child, context); return; }
    const oldStyle = node.attributes?.style ?? '';
    const attrs = node.attributes ?? {};
    const label = decode(text(node)).trim();
    const referenceHeading = /^h[1-6]$/.test(node.name) && /^(引用链接|参考资料|参考文献|References)$/i.test(label);
    if (referenceHeading) referencesStarted = true;
    if (referencesStarted && node.name === 'p' && /\[\d+\]/.test(label) && /https?:\/\//.test(label)) referenceNodes.push(node);
    node.attributes = {};
    if (attrs.id) node.attributes.id = attrs.id;
    if (node.name === 'img') for (const key of ['src', 'alt', 'width', 'height']) if (attrs[key]) node.attributes[key] = attrs[key];
    if (node.name === 'a') node.name = 'span';
    if (styles[node.name]) node.attributes.style = styles[node.name];
    if (context.root && node.name === 'section') node.attributes.style = `box-sizing:border-box;max-width:677px;margin:0 auto;padding:0 8px;background:#fff;color:#3f3f3f;font-family:${FONT};font-size:16px;line-height:1.9;letter-spacing:0.4px;word-break:normal;overflow-wrap:break-word`;
    if (context.quote && node.name === 'p') node.attributes.style = 'margin:0 0 10px;color:inherit;font-family:inherit;font-size:inherit;line-height:inherit;text-align:left';
    if (node.name === 'span') {
      let semantic = '';
      if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(oldStyle)) semantic += 'font-weight:700;';
      if (/font-style\s*:\s*italic/i.test(oldStyle)) semantic += 'font-style:italic;';
      if (/^\[\d+\]$/.test(label)) semantic += 'font-size:inherit;line-height:inherit;vertical-align:baseline;color:inherit;';
      if (semantic) node.attributes.style = semantic;
    }
    if (node.name === 'code' && context.pre) node.attributes.style = 'display:block;padding:0;background:transparent;color:inherit;font-family:inherit;font-size:inherit;line-height:inherit;white-space:pre-wrap;overflow-wrap:anywhere';
    node.children = (node.children ?? []).filter(child => !['script', 'style', 'iframe', 'svg', 'button'].includes(child.name));
    for (const child of node.children) visit(child, { pre: context.pre || node.name === 'pre', quote: context.quote || node.name === 'blockquote', root: false });
    if (referenceHeading) {
      node.name = 'h4';
      node.attributes.style = 'margin:48px 0 14px;color:#999;font-size:14px;font-style:italic;font-weight:600';
    } else if (node.name === 'h2') {
      sectionNumber++;
      subsectionNumber = 0;
      const title = label.replace(/^\d{2}\s*\n\s*/, '');
      node.attributes.style = `margin:52px 0 30px;padding:0;background:transparent;border:0;color:${ORANGE};text-align:center;font-size:20px;line-height:1.65;font-weight:400;letter-spacing:0`;
      node.children = children(`<span style="font-size:19px;line-height:1.8;color:${ORANGE};font-weight:400">${String(sectionNumber).padStart(2, '0')}</span><br/><span>${escape(title)}</span>`);
    } else if (node.name === 'h3') {
      subsectionNumber++; subheadings++;
      const title = label.replace(/^\d+\.\d+\s+/, '');
      node.attributes.style = 'margin:32px 0 22px;padding:0;border:0;background:transparent;font-size:16px;line-height:1.9;font-weight:700';
      node.children = children(`<span style="background:#ffa900;color:#171717;padding:1px 3px;font-weight:700;box-decoration-break:clone;-webkit-box-decoration-break:clone">${sectionNumber}.${subsectionNumber} ${escape(title)}</span>`);
    }
  }
  visit(tree);
  let referenceCount = 0;
  for (const node of referenceNodes) {
    const entries = [...decode(text(node)).matchAll(/\[(\d+)\]\s*([\s\S]*?)(?=\[\d+\]|$)/g)];
    if (!entries.length || entries.some(entry => !/https?:\/\//.test(entry[2]))) throw new Error('参考资料格式无法安全转换');
    node.name = 'section';
    node.attributes = { style: 'margin:0;color:#999;font-size:12px;line-height:1.85;letter-spacing:0.3px;font-style:italic;text-align:left' };
    node.children = entries.flatMap(entry => {
      const urlMatch = entry[2].match(/https?:\/\/\S+/);
      if (!urlMatch || entry[2].slice(urlMatch.index + urlMatch[0].length).trim()) throw new Error('参考 URL 后仍有文字，停止转换');
      const name = entry[2].slice(0, urlMatch.index).trim().replace(/[:：]\s*$/, '');
      referenceCount++;
      return children(`<p style="margin:0 0 16px"><span>[${entry[1]}] ${escape(name)}</span><br/><span style="color:#5b91d8;overflow-wrap:anywhere;word-break:break-all">${escape(urlMatch[0])}</span></p>`);
    });
  }
  const output = fixDuplicateListMarkers(renderSync(tree)).html;
  return { html: output, report: { theme: 'editorial-orange', source: 'user-reference-screenshots', sections: sectionNumber, subsections: subheadings, references: referenceCount } };
}
