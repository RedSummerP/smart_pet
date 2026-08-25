import { describe, expect, it } from 'vitest';
import { evaluateExpression } from '../src/tools/builtin.js';
import { ToolRegistry, type NoteStore, type PetToolDef } from '../src/tools/index.js';
import { Type } from 'typebox';

describe('evaluateExpression（安全计算器）', () => {
  it('基础四则/幂/括号/一元负号/取模', () => {
    expect(evaluateExpression('1+2*3')).toBe(7);
    expect(evaluateExpression('(10-4)/2')).toBe(3);
    expect(evaluateExpression('2^10')).toBe(1024);
    expect(evaluateExpression('-5+3')).toBe(-2);
    expect(evaluateExpression('7%3')).toBe(1);
    expect(evaluateExpression('1.5 * 2')).toBe(3);
  });

  it('错误表达式抛错（无 eval 注入面）', () => {
    expect(() => evaluateExpression('1/0')).toThrow(/除以零/);
    expect(() => evaluateExpression('1+abc')).toThrow(/意外字符|无效数字/);
    expect(() => evaluateExpression('1++2')).toThrow(/无效数字|意外字符/);
    expect(() => evaluateExpression('  ')).toThrow(/空表达式/);
    expect(() => evaluateExpression('1+process.exit()')).toThrow(); // 绝不执行任意代码
  });
});

describe('ToolRegistry', () => {
  it('注册/注销/去重', () => {
    const reg = new ToolRegistry();
    const ECHO_PARAMS = Type.Object({ text: Type.String() });
    const def: PetToolDef<{ text: string }> = {
      name: 'echo',
      label: '回声',
      description: '回显',
      parameters: ECHO_PARAMS,
      handler: (p) => ({ text: p.text }),
    };
    reg.register(def);
    expect(reg.has('echo')).toBe(true);
    expect(reg.count()).toBe(1);
    expect(() => reg.register(def)).toThrow(/重复注册/);
    reg.unregister('echo');
    expect(reg.has('echo')).toBe(false);
  });

  it('环境过滤：mobile 环境看不到 desktop-only 工具', () => {
    const reg = new ToolRegistry();
    const EMPTY = Type.Object({});
    reg.register({
      name: 'shell_like',
      label: '仅桌面',
      description: 'x',
      parameters: EMPTY,
      environments: ['desktop'],
      handler: () => ({ text: 'ok' }),
    });
    reg.register({
      name: 'now',
      label: '通用',
      description: 'x',
      parameters: EMPTY,
      handler: () => ({ text: 'ok' }),
    });
    expect(reg.names()).toEqual(['shell_like', 'now']);
    expect(reg.names({ environment: 'mobile' })).toEqual(['now']);
    expect(reg.toAgentTools({}, { environment: 'mobile' }).map((t) => t.name)).toEqual(['now']);
  });

  it('toAgentTools：handler 抛错转为错误文本，不中断 agent', async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: 'boom',
      label: '炸',
      description: 'x',
      parameters: Type.Object({}),
      handler: () => {
        throw new Error('exploded');
      },
    });
    const tools = reg.toAgentTools();
    const result = await tools[0]!.execute('id-1', {});
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect((result.content[0] as { text: string }).text).toContain('exploded');
  });

  it('note 工具使用注入的 NoteStore（tool context）', async () => {
    const entries: Array<{ tag: string; text: string; at: number }> = [];
    const notes: NoteStore = {
      async append(tag, text) {
        entries.push({ tag, text, at: 1 });
      },
      async list() {
        return entries;
      },
    };
    const reg = new ToolRegistry();
    const NOTE_PARAMS = Type.Object({ text: Type.String(), tag: Type.Optional(Type.String()) });
    const noteDef: PetToolDef<{ text: string; tag?: string }> = {
      name: 'note',
      label: '记事',
      description: 'x',
      parameters: NOTE_PARAMS,
      handler: async (p, ctx) => {
        const store = ctx.notes ?? notes;
        await store.append(p.tag ?? '默认', p.text);
        return { text: 'ok', details: { count: (await store.list()).length } };
      },
    };
    reg.register(noteDef);
    const tools = reg.toAgentTools({ notes });
    const out = await tools[0]!.execute('id-1', { text: '记得浇花' });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('记得浇花');
    expect((out.details as { count: number }).count).toBe(1);
  });
});