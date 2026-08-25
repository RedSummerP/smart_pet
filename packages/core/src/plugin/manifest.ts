import { z } from 'zod';

/** 可插拔能力种类（对应"万物可插件"的扩展点） */
export const capabilityKinds = [
  'games',
  'skins',
  'tools',
  'providers',
  'sync-adapters',
  'widgets',
  'hooks',
  'schemas',
] as const;
export type CapabilityKind = (typeof capabilityKinds)[number];

export const capabilitySpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('games') }),
  z.object({ kind: z.literal('skins'), skinId: z.string().min(1) }),
  z.object({ kind: z.literal('tools'), toolNames: z.array(z.string().min(1)) }),
  z.object({ kind: z.literal('providers'), providerId: z.string().min(1) }),
  z.object({ kind: z.literal('sync-adapters'), adapterId: z.string().min(1) }),
  z.object({ kind: z.literal('widgets'), widgetId: z.string().min(1), mount: z.enum(['settings', 'panel', 'tray']) }),
  z.object({ kind: z.literal('hooks'), hookNames: z.array(z.string().min(1)) }),
  z.object({ kind: z.literal('schemas'), flagKey: z.string().min(1) }),
]);
export type CapabilitySpec = z.infer<typeof capabilitySpecSchema>;

export const pluginManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9@._/-]+$/),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  requires: z
    .object({
      pipet: z.string().default('>=0.1.0'),
      plugins: z.record(z.string()).optional(),
    })
    .default({ pipet: '>=0.1.0' }),
  capabilities: z.array(capabilitySpecSchema).default([]),
  permissions: z.array(z.string()).default([]),
});
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

/** 宿主当前版本（插件要求 via requires.pipet） */
export const PIPET_VERSION = '0.1.0';

/** 极简 semver 范围判断：支持 '*' 与 '>=x.y.z'，其余按精确匹配（MVP 够用，文档注明） */
export function rangeSatisfies(version: string, range: string): boolean {
  const v = range.trim();
  if (v === '*' || v === 'latest') return true;
  if (v.startsWith('>=')) {
    const parse = (s: string): number[] => s.split('.').map((x) => Number.parseInt(x, 10) || 0);
    const [a = 0, b = 0, c = 0] = parse(version);
    const [m = 0, n = 0, o = 0] = parse(v.slice(2).trim());
    if (a !== m) return a > m;
    if (b !== n) return b > n;
    return c >= o;
  }
  return v === version;
}

export function parseManifest(input: unknown): PluginManifest {
  return pluginManifestSchema.parse(input);
}