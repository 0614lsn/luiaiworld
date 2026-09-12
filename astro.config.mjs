import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { proseTypography, blockLanguage } from './src/lib/markdown-typography.mjs';

const previewRelease = process.env.CONTENT_PREVIEW_RELEASE;
if (previewRelease && !/^[0-9a-f]{64}$/.test(previewRelease)) {
  throw new Error('CONTENT_PREVIEW_RELEASE 必须是内容版本的 SHA-256');
}

export default defineConfig({
  site: 'https://luiaiworld.com',
  output: 'static',
  // Preview build output is private. Stop preview before ordinary build/check;
  // Astro still owns generated type/content files under the repository root.
  ...(previewRelease ? {
    outDir: `./.content/preview-dist/${previewRelease}/`,
    cacheDir: `./.content/astro-cache/${previewRelease}/`,
  } : {}),
  markdown: {
    processor: satteri({ hastPlugins: [proseTypography, blockLanguage] }),
    syntaxHighlight: { type: 'shiki', excludeLangs: ['text', 'plaintext'] },
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
