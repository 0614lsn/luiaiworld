import { getCollection } from 'astro:content';

export const isContentPreview = Boolean(import.meta.env.CONTENT_PREVIEW_RELEASE);

export async function getVisibleArticles() {
  return getCollection('articles', ({ data }) => isContentPreview || data.status === 'published');
}
