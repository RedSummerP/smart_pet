import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { parseManifest, type PluginManifest } from '@smartpet/core';
import { hasJsEntry } from './discover.js';

/** 插件安装布局：destRoot/<id>/manifest.json + dist/** */

export interface InstallResult {
  installedId: string;
  destDir: string;
  manifest: PluginManifest;
  overwritten: boolean;
}

export interface InstallOptions {
  /** 已存在时强制覆盖（默认拒绝） */
  force?: boolean;
}

const ENTRY_FILES = ['dist', 'index.js', 'index.mjs'];

/**
 * 安装目录插件：校验 manifest → 复制代码 → 写 manifest.json。
 * src 可以是插件包目录（含 manifest.json 或 package.json）。
 */
export async function installPluginDirectory(
  srcDir: string,
  destRoot: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  // 1) 解析 manifest（manifest.json 优先）
  let manifest: PluginManifest;
  let manifestSource: 'json' | 'pkg' | 'definition' = 'json';
  try {
    const raw = await fs.readFile(path.join(srcDir, 'manifest.json'), 'utf8');
    manifest = parseManifest(JSON.parse(raw));
  } catch {
    // package.json 里的 name/version + 尝试 index 的 default 导出
    const pkg = JSON.parse(await fs.readFile(path.join(srcDir, 'package.json'), 'utf8')) as {
      name: string;
      version?: string;
    };
    manifest = parseManifest({ id: pkg.name, name: pkg.name, version: pkg.version ?? '0.0.0' });
    manifestSource = 'pkg';
  }

  const destDir = path.join(destRoot, manifest.id);
  let overwritten = false;
  try {
    await fs.access(destDir);
    if (!options.force) throw new Error(`插件已安装: ${manifest.id}（用 force 覆盖）`);
    overwritten = true;
  } catch (err) {
    if (err instanceof Error && err.message.includes('force')) throw err;
  }

  await fs.mkdir(destDir, { recursive: true });

  // 2) 复制入口代码（dist 优先，其次裸 index）
  let copiedEntry = false;
  for (const name of ENTRY_FILES) {
    try {
      const stat = await fs.stat(path.join(srcDir, name));
      if (!stat.isDirectory() && !stat.isFile()) continue;
      await fs.cp(path.join(srcDir, name), path.join(destDir, name), { recursive: true, force: true, errorOnExist: !options.force });
      copiedEntry = true;
      break;
    } catch {
      // 继续
    }
  }
  void manifestSource;
  void copiedEntry;

  // 3) 写 manifest.json（可免加载 JS 发现）
  await fs.writeFile(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return { installedId: manifest.id, destDir, manifest, overwritten };
}

/** 卸载：删除插件目录 */
export async function uninstallPlugin(id: string, destRoot: string): Promise<boolean> {
  const destDir = path.join(destRoot, id);
  try {
    await fs.rm(destDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

/** 列出已安装插件（= 对 destRoot 做发现） */
export { discoverPluginDirectory as listInstalledPlugins } from './discover.js';

/** 起飞前烟雾检查：入口是否齐全 */
export async function verifyInstalledPlugin(destDir: string): Promise<{ ok: boolean; entry?: string; issue?: string }> {
  try {
    const manifest = parseManifest(JSON.parse(await fs.readFile(path.join(destDir, 'manifest.json'), 'utf8')));
    const entry = await hasJsEntry(destDir);
    return { ok: entry !== undefined, entry: entry ?? undefined, ...(entry ? {} : { issue: `${manifest.id} 缺少 JS 入口` }) };
  } catch (err) {
    return { ok: false, issue: err instanceof Error ? err.message : String(err) };
  }
}