import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import wasm from 'vite-plugin-wasm';

// 仅供 vite（dev/build）；vitest 使用独立的 vitest.config.ts，避免 vite 版本类型冲突。
// wasm 插件：automerge-wasm 使用 ESM wasm 集成提案，vite 6 需要该插件处理。
export default defineConfig({
  plugins: [wasm(), svelte()],
  base: './',
  server: { port: 5173, strictPort: false },
  build: { outDir: 'dist', target: 'es2022' },
  optimizeDeps: {
    exclude: ['@automerge/automerge-wasm'],
  },
});