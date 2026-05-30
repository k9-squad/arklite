import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// GitHub Pages 项目站点路径为 /<repo>/，此处与仓库名 arklite 对应。
export default defineConfig({
  base: '/arklite/',
  plugins: [svelte()],
});
