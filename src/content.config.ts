import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/articles' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    publishedAt: z.coerce.date(),
    tags: z.array(z.string().min(1)).min(1),
    featured: z.boolean(),
    sourceBaseline: z.string().regex(/^[0-9a-f]{40}$/),
  }),
});

export const collections = { articles };
