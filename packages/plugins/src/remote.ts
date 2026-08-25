import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as tar from 'tar';
import { installPluginDirectory, type InstallResult } from './install.js';

/**
 * 远程插件市场：在线目录 → 下载 tarball → sha256 完整性校验 → 解压 → 安装。
 * 目录格式：
 * ```json
 * [{ "id": "@smartpet/plugin-x", "version": "0.1.0", "description": "...",
 *    "tarballUrl": "https://.../plugin-x.tgz", "sha256": "hex..." }]
 * ```
 */

export interface RemoteCatalogEntry {
  id: string;
  version: string;
  description?: string;
  tarballUrl: string;
  /** 期望的 tarball sha256（hex） */
  sha256: string;
}

export async function fetchRemoteCatalog(catalogUrl: string): Promise<RemoteCatalogEntry[]> {
  const response = await fetch(catalogUrl);
  if (!response.ok) throw new Error(`目录请求失败: ${response.status} ${response.statusText}`);
  const raw = (await response.json()) as unknown;
  const list = Array.isArray(raw) ? raw : (raw as { plugins?: unknown[] }).plugins;
  if (!Array.isArray(list)) throw new Error('目录格式无效：需要插件数组');
  for (const item of list as Array<RemoteCatalogEntry>) {
    if (!item.id || !item.tarballUrl || !item.sha256) {
      throw new Error(`目录条目无效: ${JSON.stringify(item)}`);
    }
  }
  return list as RemoteCatalogEntry[];
}

export async function downloadTarball(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败: ${url}（${response.status}）`);
  return new Uint8Array(await response.arrayBuffer());
}

export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface RemoteInstallOptions {
  /** 临时目录（缺省系统临时目录自动创建） */
  tmpDir?: string;
}

/** 从远程市场安装插件（下载 → 校验 → 解压 → installPluginDirectory） */
export async function installPluginFromRemote(
  catalogUrl: string,
  pluginId: string,
  destRoot: string,
  options: RemoteInstallOptions = {},
): Promise<InstallResult> {
  const entries = await fetchRemoteCatalog(catalogUrl);
  const entry = entries.find((item) => item.id === pluginId);
  if (!entry) throw new Error(`市场无此插件: ${pluginId}`);

  const tarball = await downloadTarball(entry.tarballUrl);
  const actual = sha256Of(tarball);
  if (actual !== entry.sha256.toLowerCase()) {
    throw new Error(`完整性校验失败: ${pluginId}（期望 ${entry.sha256}，实际 ${actual}）`);
  }

  const tmp = options.tmpDir ?? (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'smartpet-plugin-')));
  const tgzPath = path.join(tmp, 'pkg.tgz');
  await fs.promises.writeFile(tgzPath, tarball);
  const extractDir = path.join(tmp, 'src');
  await fs.promises.mkdir(extractDir, { recursive: true });
  try {
    await tar.x({ file: tgzPath, cwd: extractDir });
  } catch (err) {
    throw new Error(`解压失败: ${err instanceof Error ? err.message : String(err)}`);
  }
  return installPluginDirectory(extractDir, destRoot);
}