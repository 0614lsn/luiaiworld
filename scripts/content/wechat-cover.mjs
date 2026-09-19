import sharp from 'sharp';

// Existing WeChat fallback cover only. XHS images are authored with a skill.
const FONT = 'Microsoft YaHei, Noto Sans CJK SC, sans-serif';
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export function wrapText(text, units, maxLines = 30) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '', size = 0;
    for (const char of paragraph) {
      const width = /[\x00-\x7f]/.test(char) ? 0.57 : 1;
      if (size + width > units && line) {
        if (/^[，。！？；：、）》」』】”’]$/.test(char) && [...line].length > 1) {
          const chars = [...line], last = chars.pop();
          lines.push(chars.join('')); line = last;
          size = /[\x00-\x7f]/.test(last) ? 0.57 : 1;
        } else { lines.push(line); line = ''; size = 0; }
      }
      line += char; size += width;
    }
    lines.push(line);
  }
  if (lines.length > maxLines) throw new Error(`封面文字超过 ${maxLines} 行，请缩短内容`);
  return lines;
}

function text(lines, x, y, size, { color = '#18243a', weight = 400, lineHeight = 1.55 } = {}) {
  return `<text font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}">${lines.map((line, i) => `<tspan x="${x}" y="${y + i * size * lineHeight}">${escape(line)}</tspan>`).join('')}</text>`;
}

export async function renderWechatCover(title, { kicker = '内容笔记', subtitle = '路易的AI新世界' } = {}) {
  const lines = wrapText(title.replace('（中文整理）', ''), 20, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="510"><rect width="1200" height="510" fill="#f6f0e5"/><rect width="18" height="510" fill="#2454cc"/>${text(wrapText(kicker, 42, 1), 72, 82, 24, { color: '#2454cc' })}${text(lines, 72, 205, 60, { weight: 700 })}${text(wrapText(subtitle, 31, 1), 72, 373, 31, { color: '#536078' })}${text(['路易的AI新世界'], 72, 452, 28, { weight: 600 })}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
