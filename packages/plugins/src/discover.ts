import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseManifest, type PluginManifest } from '@smartpet/core';

/**
 * 插件目录发现：扫描插件根目录下的候选包。
 * 每个候选 = 一个子目录，包含 `manifest.json`（可免加载 JS 做信任前校验）。
 * 回退：读取 package.json（name/version）尝试构造最小 manifest（仅用于列表展示）。
 */

export interface DiscoveredPlugin {
  dir: string;
  manifest: PluginManifest;
  /** 是否含可加载的 JS 入口 */
  hasEntry: boolean;
  /** manifest 来源：文件 or 回退 */
  source: 'manifest-json' | 'package-json-fallback';
}

const MANIFEST_FILE = 'manifest.json';

function entryFor(dir: string): string[] {
  return ['dist/index.js', 'dist/index.mjs', 'index.js', 'index.mjs'];
}

export async function hasJsEntry(dir: string): Promise<string | undefined> {
  for (const name of entryFor(dir)) {
    try {
      const stat = await fs.stat(path.join(dir, name));
      if (stat.isFile()) return name;
    } catch {
      // 继续尝试下一个
    }
  }
  return undefined;
}

/** 收集候选插件目录：支持 npm 作用域布局（顶层 "@scope" 目录取其子目录为插件） */
async function collectPluginDirs(root: string): Promise<string[]> {
  const names = await fs.readdir(root);
  const dirs: string[] = [];
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const full = path.join(root, name);
    const stat = await fs.stat(full).catch(() => undefined);
    if (!stat?.isDirectory()) continue;
    if (name.startsWith('@')) {
      // 作用域包：下一层才是插件
      const children = await fs.readdir(full).catch(() => []);
      for (const child of children) {
        if (child.startsWith('.')) continue;
        const childStat = await fs.stat(path.join(full, child)).catch(() => undefined);
        if (childStat?.isDirectory()) dirs.push(path.join(full, child));
      }
    } else {
      dirs.push(full);
    }
  }
  return dirs;
}

/** 扫描插件根目录下所有插件候选（支持 "@scope" 一层嵌套） */
export async function discoverPluginDirectory(root: string): Promise<DiscoveredPlugin[]> {
  let dirs: string[];
  try {
    dirs = await collectPluginDirs(root);
  } catch {
    return [];
  }

  const found: DiscoveredPlugin[] = [];
  for (const dir of dirs) {

    // 1) manifest.json（信任前校验首选）
    try {
      const raw = await fs.readFile(path.join(dir, MANIFEST_FILE), 'utf8');
      const manifest = parseManifest(JSON.parse(raw));
      found.push({ dir, manifest, hasEntry: (await hasJsEntry(dir)) !== undefined, source: 'manifest-json' });
      continue;
    } catch {
      // 无 manifest.json → 尝试 package.json 回退
    }

    // 2) package.json 回退（仅列表展示，不用于启用）
    try {
      const raw = await fs.readFile(path.join(dir, 'package.json'), 'utf8');
      const pkg = JSON.parse(raw) as { name?: string; version?: string; description?: string };
      if (!pkg.name) continue;
      const manifest = parseManifest({
        id: pkg.name,
        name: pkg.description ?? pkg.name,
        version: pkg.version ?? '0.0.0',
        capabilities: [],
        permissions: [],
      });
      found.push({ dir, manifest, hasEntry: (await hasJsEntry(dir)) !== undefined, source: 'package-json-fallback' });
    } catch {
      // 跳过
    }
  }
  return found;
}