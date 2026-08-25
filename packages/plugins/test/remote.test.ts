import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as tar from 'tar';
import {
  discoverPluginDirectory,
  fetchRemoteCatalog,
  installPluginFromRemote,
  sha256Of,
  verifyInstalledPlugin,
} from '../src/index.js';

const ROOT = path.join(process.cwd(), '.remote-fixtures');
const PKG_DIR = path.join(ROOT, 'pkg');
const DEST = path.join(ROOT, 'dest');
const TARBALL = path.join(ROOT, 'plugin.tgz');
const PLUGIN_ID = '@test/market-plugin';

let server: http.Server;
let port = 0;
let tarballBytes: Uint8Array;

function buildFixture(): void {
  fs.mkdirSync(path.join(PKG_DIR, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(PKG_DIR, 'manifest.json'),
    JSON.stringify({
      id: PLUGIN_ID,
      name: '市场插件',
      version: '0.1.0',
      requires: { pipet: '>=0.1.0' },
      capabilities: [{ kind: 'games' }],
      permissions: [],
    }),
  );
  fs.writeFileSync(
    path.join(PKG_DIR, 'dist', 'index.js'),
    [
      'export default {',
      '  manifest: {',
      `    id: ${JSON.stringify(PLUGIN_ID)},`,
      "    name: '市场插件', version: '0.1.0',",
      "    requires: { pipet: '>=0.1.0' },",
      "    capabilities: [{ kind: 'games' }], permissions: [],",
      '  },',
      '  setup(ctx) { ctx.registerCapability({ kind: "games" }, { games: [{ id: "g", title: "G", entry: "g" }] }); },',
      '};',
    ].join('\n'),
  );
}

async function buildTarball(): Promise<void> {
  await tar.c({ gzip: true, cwd: PKG_DIR, file: TARBALL }, ['manifest.json', 'dist']);
  tarballBytes = new Uint8Array(fs.readFileSync(TARBALL));
}

const goodSha = (): string => sha256Of(tarballBytes);
const badSha = (): string => '0'.repeat(64);

async function startServer(): Promise<void> {
  server = http.createServer((req, res) => {
    if (req.url === '/catalog.json') {
      const catalog = [
        {
          id: PLUGIN_ID,
          version: '0.1.0',
          description: '市场测试插件',
          tarballUrl: `http://127.0.0.1:${port}/plugin.tgz`,
          sha256: goodSha(),
        },
      ];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(catalog));
    } else if (req.url === '/catalog-bad.json') {
      // 篡改的目录：hash 与真实 tarball 不符
      const catalog = [
        {
          id: PLUGIN_ID,
          version: '0.1.0',
          tarballUrl: `http://127.0.0.1:${port}/plugin.tgz`,
          sha256: badSha(),
        },
      ];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(catalog));
    } else if (req.url === '/plugin.tgz') {
      res.writeHead(200, { 'content-type': 'application/gzip' });
      res.end(Buffer.from(tarballBytes));
    } else if (req.url === '/catalog-missing.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([]));
    } else {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') port = address.port;
      resolve();
    });
  });
}

beforeAll(async () => {
  buildFixture();
  await buildTarball();
  await startServer();
});

afterAll(() => {
  server?.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
});

const url = (route: string): string => `http://127.0.0.1:${port}${route}`;

describe('远程插件市场', () => {
  it('拉取目录并校验条目', async () => {
    const entries = await fetchRemoteCatalog(url('/catalog.json'));
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe(PLUGIN_ID);
    expect(entries[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('下载 → sha256 校验 → 解压 → 安装闭环', async () => {
    const result = await installPluginFromRemote(url('/catalog.json'), PLUGIN_ID, DEST);
    expect(result.installedId).toBe(PLUGIN_ID);
    const check = await verifyInstalledPlugin(result.destDir);
    expect(check.ok).toBe(true);
    const found = await discoverPluginDirectory(DEST);
    const entry = found.find((f) => f.manifest.id === PLUGIN_ID)!;
    expect(entry.source).toBe('manifest-json');
    expect(entry.hasEntry).toBe(true);
  });

  it('sha256 不匹配 → 拒绝安装', async () => {
    await expect(
      installPluginFromRemote(url('/catalog-bad.json'), PLUGIN_ID, path.join(ROOT, 'dest-bad')),
    ).rejects.toThrow(/完整性校验失败/);
    // 未产生任何残留目录
    expect(fs.existsSync(path.join(ROOT, 'dest-bad', PLUGIN_ID))).toBe(false);
  });

  it('市场中不存在 → 明确报错', async () => {
    await expect(
      installPluginFromRemote(url('/catalog-missing.json'), '@test/nope', DEST),
    ).rejects.toThrow(/市场无此插件/);
  });
});