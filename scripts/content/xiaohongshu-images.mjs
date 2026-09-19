import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, relative, sep, isAbsolute } from 'node:path';
import sharp from 'sharp';

const MAX_BYTES = 32 * 1024 * 1024;
const imageOptions = { limitInputPixels: 40_000_000 };

async function localFile(directory, name, prompt = false) {
  const allowed = prompt ? /^xiaohongshu\/prompts\/.+\.md$/i : /^xiaohongshu\/images\/.+\.(?:png|jpe?g|webp)$/i;
  if (typeof name !== 'string' || !allowed.test(name) || /[\\:\0]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('小红书图片或提示词路径不符合本期目录约定');
  const base = resolve(directory), file = resolve(base, name);
  const rel = relative(base, file);
  if (isAbsolute(rel) || rel.startsWith('..' + sep) || !rel) throw new Error('小红书文件超出本期目录');
  if ((await lstat(base)).isSymbolicLink()) throw new Error('小红书文件不支持符号链接或目录联接');
  let cursor = base;
  for (const part of name.split('/')) {
    cursor = resolve(cursor, part);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error('小红书文件不支持符号链接或目录联接');
    if (cursor !== file && !info.isDirectory()) throw new Error('小红书文件父路径不是目录');
  }
  const actualBase = await realpath(base), actual = await realpath(file);
  if (!actual.startsWith(actualBase + sep)) throw new Error('小红书文件实际路径超出本期目录');
  const info = await lstat(file);
  if (!info.isFile() || info.size === 0 || info.size > (prompt ? 200_000 : MAX_BYTES)) throw new Error('小红书图片或提示词文件为空或过大');
  return { file, buffer: await readFile(file) };
}

// Reads completed authoring output. No text rendering or image-generation fallback.
export async function loadXhsImages(directory, images) {
  const result = [], seen = new Set();
  for (const image of images) {
    const asset = await localFile(directory, image.path);
    const identity = (await realpath(asset.file)).toLowerCase();
    if (seen.has(identity)) throw new Error('小红书图片清单不能重复引用同一文件');
    seen.add(identity);
    const metadata = await sharp(asset.buffer, imageOptions).metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height) throw new Error('小红书只接受实际的单帧 PNG、JPEG 或 WebP 图片，不接受 SVG、动画或伪装文件');
    await sharp(asset.buffer, imageOptions).stats(); // Fully decode before marking authoring ready.
    const files = [asset];
    if (image.kind === 'generated') {
      const prompt = await localFile(directory, image.prompt, true);
      if (!prompt.buffer.toString('utf8').trim()) throw new Error('生成图的提示词不能为空');
      files.push(prompt);
    }
    result.push({ ...asset, files, metadata });
  }
  return result;
}

function hasPngPrivateData(buffer) {
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const size = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size > buffer.length - offset - 12) return true;
    if (['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(type)) return true;
    offset += size + 12;
    if (type === 'IEND') return offset !== buffer.length;
  }
  return true;
}

export async function deliveryPng(image) {
  // Ordinary PNGs retain their exact bytes. Other raster formats only undergo
  // orientation/format normalization; no crop, resize, layout or text overlay.
  if (image.metadata.format === 'png' && !image.metadata.orientation && !image.metadata.exif && !image.metadata.xmp && !image.metadata.iptc && !hasPngPrivateData(image.buffer)) return image.buffer;
  const buffer = await sharp(image.buffer, imageOptions).rotate().png().toBuffer();
  if (buffer.length > MAX_BYTES) throw new Error('小红书图片转为 PNG 后超过 32MB，请在创作阶段压缩后重新审核');
  return buffer;
}
