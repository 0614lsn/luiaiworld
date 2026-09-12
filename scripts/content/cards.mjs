import sharp from 'sharp';

const WIDTH = 1080;
const HEIGHT = 1440;
const FONT = 'Microsoft YaHei, Noto Sans CJK SC, sans-serif';
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export function wrapText(text, units, maxLines = 30) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    let size = 0;
    for (const char of paragraph) {
      const width = /[\x00-\x7f]/.test(char) ? 0.57 : 1;
      if (size + width > units && line) {
        if (/^[，。！？；：、）》」』】”’]$/.test(char) && [...line].length > 1) {
          const chars = [...line];
          const last = chars.pop();
          lines.push(chars.join(''));
          line = last;
          size = /[\x00-\x7f]/.test(last) ? 0.57 : 1;
        } else { lines.push(line); line = ''; size = 0; }
      }
      line += char;
      size += width;
    }
    lines.push(line);
  }
  if (lines.length > maxLines) throw new Error(`卡片文字超过 ${maxLines} 行，请拆分内容`);
  return lines;
}

function text(lines, x, y, size, { color = '#18243a', weight = 400, lineHeight = 1.55 } = {}) {
  return `<text font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${color}">${lines.map((line, i) => `<tspan x="${x}" y="${y + i * size * lineHeight}">${escape(line)}</tspan>`).join('')}</text>`;
}

export function cardSvg(card, index, total) {
  if (card.layout === 'cover') {
    const lines = wrapText(card.heading, 10.8, 5);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
      <rect width="1080" height="1440" fill="#f6f0e5"/>
      <rect width="1080" height="18" fill="#2454cc"/>
      ${text(wrapText(card.kicker, 30, 1), 76, 105, 28, { color: '#2454cc', weight: 600 })}
      <path d="M76 150H1004M76 1260H1004" stroke="#b9c0ce" stroke-width="2"/>
      ${text(lines, 76, 420, 92, { weight: 700, lineHeight: 1.5 })}
      ${text(wrapText(card.note, 28, 2), 80, 1100, 32, { color: '#536078' })}
      ${text(['路易的AI新世界'], 76, 1330, 30, { weight: 600 })}
      ${text([`01 / ${String(total).padStart(2, '0')}`], 880, 1330, 28, { color: '#2454cc' })}
    </svg>`;
  }
  const isCover = index === 0;
  const heading = wrapText(card.heading, isCover ? 9.5 : 12.5, 3);
  const summary = wrapText(card.summary, 23.5, 4);
  const prompt = wrapText(card.prompt, 24.5, 9);
  const note = wrapText(card.note, 29, 3);
  const headingSize = isCover ? 86 : 65;
  const summaryY = 270 + (heading.length - 1) * headingSize * 1.25;
  const boxY = summaryY + summary.length * 37 * 1.55 + 45;
  const promptY = boxY + 104;
  const boxBottom = promptY + (prompt.length - 1) * 33 * 1.65 + 46;
  const noteY = boxBottom + 70;
  if (noteY + (note.length - 1) * 28 * 1.55 > 1270) throw new Error(`第 ${index + 1} 张卡片超出版面，请缩短正文`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="1080" height="1440" fill="#f6f0e5"/>
  <rect x="0" y="0" width="1080" height="18" fill="#2454cc"/>
  <path d="M72 118H1008M72 1328H1008" stroke="#b9c0ce" stroke-width="2"/>
  ${text([card.kicker], 72, 82, 25, { color: '#2454cc', weight: 600 })}
  ${text([`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`], 898, 82, 25, { color: '#2454cc' })}
  ${text(heading, 72, 223, headingSize, { weight: 700, lineHeight: 1.25 })}
  ${text(summary, 76, summaryY + 45, 37, { color: '#43516b' })}
  <rect x="72" y="${boxY}" width="936" height="${boxBottom - boxY}" rx="22" fill="#e6eaf4"/>
  ${text([card.promptLabel ?? '提示词片段'], 107, boxY + 46, 25, { color: '#2454cc', weight: 600 })}
  ${text(prompt, 107, promptY, 33, { lineHeight: 1.65 })}
  ${text(note, 76, noteY, 28, { color: '#536078' })}
  ${text(['路易的AI新世界'], 72, 1381, 29, { weight: 600 })}
  ${text([card.footerLabel ?? '内容笔记'], 682, 1381, 26, { color: '#536078' })}
  </svg>`;
}

export async function renderCards(cards, footerLabel) {
  const output = [];
  for (const [index, card] of cards.entries()) {
    const svg = cardSvg({ ...card, footerLabel }, index, cards.length);
    output.push({ name: `${String(index + 1).padStart(2, '0')}.png`, buffer: await sharp(Buffer.from(svg)).png().toBuffer() });
  }
  return output;
}

export async function renderWechatCover(title, { kicker = '内容笔记', subtitle = '路易的AI新世界' } = {}) {
  const lines = wrapText(title.replace('（中文整理）', ''), 20, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="510"><rect width="1200" height="510" fill="#f6f0e5"/><rect width="18" height="510" fill="#2454cc"/>${text(wrapText(kicker, 42, 1), 72, 82, 24, { color: '#2454cc' })}${text(lines, 72, 205, 60, { weight: 700 })}${text(wrapText(subtitle, 31, 1), 72, 373, 31, { color: '#536078' })}${text(['路易的AI新世界'], 72, 452, 28, { weight: 600 })}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
