import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://luiaiworld.com',
  output: 'static',
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
