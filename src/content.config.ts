import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const previewRelease = import.meta.env.CONTENT_PREVIEW_RELEASE;
const testRun = import.meta.env.CONTENT_TEST_RUN;
if (testRun && (!/^[0-9a-f-]{36}$/.test(testRun) || previewRelease)) throw new Error('无效的隔离测试构建');
if (previewRelease && !/^[0-9a-f]{64}$/.test(previewRelease)) {
  throw new Error('无效的私有草稿版本');
}

const articles = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: testRun ? `./.content/tests/site-${testRun}/content` : previewRelease ? `./.content/releases/${previewRelease}/website` : './src/content/articles',
  }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    publishedAt: z.coerce.date(),
    tags: z.array(z.string().min(1)).min(1),
    featured: z.boolean(),
    status: z.enum(['draft', 'published']).default('draft'),
    sourceBaseline: z.string().regex(/^[0-9a-f]{40}$/).optional(),
    source: z.object({
      label: z.string().min(1),
      url: z.url(),
      checkedAt: z.string().min(1),
    }).optional(),
    eyebrow: z.string().optional(),
    contentNote: z.string().optional(),
  }),
});

export const collections = { articles };
