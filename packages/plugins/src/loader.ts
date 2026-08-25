import { pathToFileURL } from 'node:url';
import type { PluginDefinition, PluginLoader, PluginManifest } from '@smartpet/core';

/**
 * Node 上下文插件装载器：动态 import 插件包入口（dist/index.js 等）。
 * 用法：`registry.register(manifest, createNodePluginLoader(dir))`
 */
export function createNodePluginLoader(dir: string): PluginLoader {
  const candidates = ['dist/index.js', 'dist/index.mjs', 'index.js', 'index.mjs'];
  return async (manifest: PluginManifest): Promise<PluginDefinition> => {
    let lastError: unknown;
    for (const name of candidates) {
      const url = pathToFileURL(`${dir}/${name}`).href;
      try {
        const module = (await import(url)) as { default?: PluginDefinition };
        const definition = module.default;
        if (!definition || typeof definition.setup !== 'function') {
          throw new Error(`${manifest.id} 入口缺少 default export（PluginDefinition）`);
        }
        return definition;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`无法加载插件 ${manifest.id}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  };
}

/** 信任检查：id 白名单（避免加载任意目录） */
export function assertTrustedPluginId(id: string, allowed: readonly string[]): void {
  if (!allowed.includes(id)) throw new Error(`插件 ${id} 不在信任白名单内`);
}

/** 白名单（bundled 官方插件） */
export const BUNDLED_PLUGIN_IDS = [
  '@smartpet/plugin-memory-match',
  '@smartpet/plugin-skins-classic',
] as const;