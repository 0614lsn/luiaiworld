const cjk = /\p{Script=Han}/u;
const latin = /[A-Za-z0-9]/;
const word = /[\p{L}\p{N}]/u;

function inLiteral(node, ctx) {
  for (let parent = ctx.parent(node); parent; parent = ctx.parent(parent)) {
    if (parent.type === 'element' && ['pre', 'code', 'script', 'style', 'textarea'].includes(parent.tagName)) return true;
  }
  return false;
}

export function spaceMixedText(value) {
  // URLs are opaque; only prose segments are eligible for spacing.
  return value.split(/(https?:\/\/[^\s<>]+)/g).map((part) => /^https?:\/\//.test(part) ? part : part
    .replace(/(\p{Script=Han})([A-Za-z0-9])/gu, '$1 $2')
    .replace(/([A-Za-z0-9])(\p{Script=Han})/gu, '$1 $2')).join('');
}

export const proseTypography = {
  name: 'prose-typography',
  text(node, ctx) {
    if (inLiteral(node, ctx)) return;
    const parent = ctx.parent(node);
    if (parent?.type === 'element' && parent.tagName === 'a' && parent.properties?.href === node.value) return;
    const value = spaceMixedText(node.value);
    if (value !== node.value) return { type: 'text', value };
  },
  element: {
    filter: ['a', 'code', 'strong', 'em'],
    visit(node, ctx) {
      if (inLiteral(node, ctx)) return;
      const parent = ctx.parent(node);
      const index = ctx.indexOf(node);
      if (!parent?.children || index === undefined) return;
      const text = ctx.textContent(node);
      if (!text) return;
      const before = parent.children[index - 1];
      const after = parent.children[index + 1];
      const left = before ? ctx.textContent(before).slice(-1) : '';
      const right = after ? ctx.textContent(after).slice(0, 1) : '';
      const mixed = (a, b) => (cjk.test(a) && latin.test(b)) || (latin.test(a) && cjk.test(b));
      const needsSpace = (a, b) => word.test(a) && word.test(b) && (['a', 'code'].includes(node.tagName) || mixed(a, b));
      if (left && needsSpace(left, text[0])) ctx.insertBefore(node, { type: 'text', value: ' ' });
      if (right && needsSpace(text.slice(-1), right)) ctx.insertAfter(node, { type: 'text', value: ' ' });
    },
  },
};

export const blockLanguage = {
  name: 'block-language',
  element: {
    filter: ['pre'],
    visit(node, ctx) {
      const code = node.children?.find((child) => child.type === 'element' && child.tagName === 'code');
      if (!code) return;
      const meta = String(code.data?.meta ?? '');
      const classes = String(code.properties?.className ?? code.properties?.class ?? '');
      const language = /\bcodex\b/.test(meta) ? 'codex' : String(node.properties?.dataLanguage
        ?? node.properties?.['data-language'] ?? code.data?.lang ?? classes.match(/language-([\w-]+)/)?.[1] ?? 'text');
      ctx.setProperty(node, 'dataLanguage', language);
    },
  },
};
