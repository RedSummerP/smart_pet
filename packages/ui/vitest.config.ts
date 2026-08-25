import { defineConfig } from 'vitest/config';

// 仅 vitest：纯 TS 测试（sprite/animation/app-state），无需 svelte 转换
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});