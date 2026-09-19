import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

// Synthetic raster fixtures test packaging only; they are not real skill output.
export async function xhsFixture(directory, sourceHash, { title = '测试标题', caption = '测试文案' } = {}) {
  await mkdir(join(directory, 'xiaohongshu/images'), { recursive: true });
  await mkdir(join(directory, 'xiaohongshu/prompts'), { recursive: true });
  const path = 'xiaohongshu/images/01-cover.png', prompt = 'xiaohongshu/prompts/01-cover.md';
  await sharp({ create: { width: 1080, height: 1440, channels: 3, background: '#3157aa' } }).png().toFile(join(directory, path));
  await writeFile(join(directory, prompt), '# Synthetic test prompt\nFixture for transport tests; no live image generation.\n');
  return { sourceHash, title, caption, imageSkill: 'baoyu-xhs-images', images: [{ kind: 'generated', path, prompt, alt: '测试栅格图片' }] };
}
