import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  assertTrustedPluginId,
  BUNDLED_PLUGIN_IDS,
  createNodePluginLoader,
  discoverPluginDirectory,
  installPluginDirectory,
  uninstallPlugin,
  verifyInstalledPlugin,
} from '../src/index.js';
import {
  createInitialPetState,
  EventBus,
  InMemoryPetStateStore,
  PluginRegistry,
} from '@smartpet/core';

const ROOT = path.join(process.cwd(), '.fixtures');
const SRC = path.join(ROOT, 'src');
const DEST = path.join(ROOT, 'dest');

const PLUGIN_A = '@test/memory';
const PLUGIN_B = '@test/skins';

/** 构造一个"未生成 manifest.json"的插件包（依赖 package.json 回退发现、安装时补写 manifest） */
function makeFixture(id: string): void {
  const dir = path.join(SRC, id);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'dist', 'index.js'),
    [
      'export default {',
      '  manifest: {',
      `    id: ${JSON.stringify(id)},`,
      `    name: ${JSON.stringify('测试插件 ' + id)},`,
      "    version: '0.1.0',",
      "    requires: { pipet: '>=0.1.0' },",
      "    capabilities: [{ kind: 'games' }],",
      '    permissions: [],',
      '  },',
      '  setup(ctx) {',
      "    ctx.registerCapability({ kind: 'games' }, { games: [{ id: 'g-1', title: 'G', entry: 'g' }] });",
      '  },',
      '};',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: id, version: '0.1.0', type: 'module' }));
}

const memoryKv = (): ((id: string) => unknown) => {
  const maps = new Map<string, Map<string, unknown>>();
  return (id: string) => {
    let m = maps.get(id);
    if (!m) {
      m = new Map();
      maps.set(id, m);
    }
    return {
      get: async <T>(k: string): Promise<T | undefined> => m!.get(k) as T | undefined,
      set: async (k: string, v: unknown) => void m!.set(k, v),
      delete: async (k: string) => void m!.delete(k),
      list: async () => [...m!.keys()],
    };
  };
};

beforeAll(() => {
  fs.mkdirSync(SRC, { recursive: true });
  fs.mkdirSync(DEST, { recursive: true });
  makeFixture(PLUGIN_A);
  makeFixture(PLUGIN_B);
});

afterAll(() => {
  fs.rmSync(ROOT, { recursive: true, force: true });
});

describe('插件市场骨架（@smartpet/plugins）', () => {
  it('发现：package.json 回退发现两个候选（无 manifest.json）', async () => {
    const found = await discoverPluginDirectory(SRC);
    expect(found.map((f) => f.manifest.id)).toEqual(expect.arrayContaining([PLUGIN_A, PLUGIN_B]));
    for (const f of found) {
      expect(f.source).toBe('package-json-fallback');
      expect(f.hasEntry).toBe(true);
    }
  });

  it('安装：校验 + 复制 + 生成 manifest.json；重复安装需 force', async () => {
    const result = await installPluginDirectory(path.join(SRC, PLUGIN_A), DEST);
    expect(result.installedId).toBe(PLUGIN_A);
    expect(result.overwritten).toBe(false);
    // manifest.json 已生成 → 免加载 JS 可发现
    expect(fs.existsSync(path.join(result.destDir, 'manifest.json'))).toBe(true);

    const check = await verifyInstalledPlugin(result.destDir);
    expect(check.ok).toBe(true);
    expect(check.entry).toBeTruthy();

    await expect(installPluginDirectory(path.join(SRC, PLUGIN_A), DEST)).rejects.toThrow(/已安装/);
    const forced = await installPluginDirectory(path.join(SRC, PLUGIN_A), DEST, { force: true });
    expect(forced.overwritten).toBe(true);
  });

  it('安装后再发现：source=manifest-json', async () => {
    const found = await discoverPluginDirectory(DEST);
    const installed = found.find((f) => f.manifest.id === PLUGIN_A)!;
    expect(installed).toBeTruthy();
    expect(installed.source).toBe('manifest-json');
    expect(installed.hasEntry).toBe(true);
  });

  it('装载器端到端：NodePluginLoader → PluginRegistry.enable → 能力进 sink', async () => {
    const discovered = await discoverPluginDirectory(DEST);
    const entry = discovered.find((f) => f.manifest.id === PLUGIN_A)!;

    const bus = new EventBus();
    const store = new InMemoryPetStateStore(createInitialPetState('x', 0));
    const onCapability = vi.fn();
    const reg = new PluginRegistry({
      bus,
      state: store,
      storage: memoryKv(),
      sink: { onCapability, onCapabilityRemoved: vi.fn() },
      loaders: {},
    });
    await reg.register(entry.manifest, createNodePluginLoader(entry.dir));
    await reg.enable(PLUGIN_A);
    expect(reg.get(PLUGIN_A)!.status).toBe('enabled');
    expect(onCapability).toHaveBeenCalledWith(PLUGIN_A, expect.objectContaining({ kind: 'games' }), expect.anything());
  });

  it('卸载：删除目录后发现为空', async () => {
    expect(await uninstallPlugin(PLUGIN_A, DEST)).toBe(true);
    const found = await discoverPluginDirectory(DEST);
    expect(found.some((f) => f.manifest.id === PLUGIN_A)).toBe(false);
    // 幂等
    expect(await uninstallPlugin(PLUGIN_A, DEST)).toBe(true);
  });

  it('信任白名单', () => {
    expect(() => assertTrustedPluginId('@smartpet/plugin-memory-match', BUNDLED_PLUGIN_IDS)).not.toThrow();
    expect(() => assertTrustedPluginId('@evil/plugin', BUNDLED_PLUGIN_IDS)).toThrow(/不在信任白名单/);
  });
});