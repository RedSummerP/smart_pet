import { FOODS, type PetRuntime } from '@smartpet/core';
import { Type, type Static } from 'typebox';
import type { NoteStore, ToolContext, ToolOutput, PetToolDef } from './types.js';

/** 安全计算器：支持 + - * / % ^ ( ) 与一元负号（自研递归下降，无 eval） */
export function evaluateExpression(input: string): number {
  const src = input.replace(/\s+/g, '');
  if (!src) throw new Error('空表达式');
  let i = 0;
  const peek = (): string => src[i] ?? '';
  const eat = (ch: string): void => {
    if (src[i] !== ch) throw new Error(`位置 ${i} 期望 '${ch}'`);
    i++;
  };
  const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';

  function numberValue(): number {
    const start = i;
    while (isDigit(peek()) || peek() === '.') i++;
    const raw = src.slice(start, i);
    const value = Number.parseFloat(raw);
    if (Number.isNaN(value)) throw new Error(`无效数字 '${raw}'`);
    return value;
  }

  function primary(): number {
    if (peek() === '-') {
      i++;
      return -primary();
    }
    if (peek() === '(') {
      eat('(');
      const v = expression();
      eat(')');
      return v;
    }
    return numberValue();
  }

  function power(): number {
    const base = primary();
    if (peek() === '^') {
      i++;
      return base ** power();
    }
    return base;
  }

  function term(): number {
    let v = power();
    for (;;) {
      const ch = peek();
      if (ch === '*') {
        i++;
        v *= power();
      } else if (ch === '/') {
        i++;
        const d = power();
        if (d === 0) throw new Error('除以零');
        v /= d;
      } else if (ch === '%') {
        i++;
        const d = power();
        if (d === 0) throw new Error('模零');
        v %= d;
      } else {
        return v;
      }
    }
  }

  function expression(): number {
    let v = term();
    for (;;) {
      const ch = peek();
      if (ch === '+') {
        i++;
        v += term();
      } else if (ch === '-') {
        i++;
        v -= term();
      } else {
        return v;
      }
    }
  }

  const result = expression();
  if (i < src.length) throw new Error(`意外字符 '${src[i]}'`);
  return result;
}

const NOW_PARAMS = Type.Object({ timezone: Type.Optional(Type.String()) });
const CALC_PARAMS = Type.Object({ expression: Type.String() });
const NOTE_PARAMS = Type.Object({ text: Type.String(), tag: Type.Optional(Type.String()) });
const PET_ACTIONS_PARAMS = Type.Object({
  action: Type.Union([Type.Literal('feed'), Type.Literal('play')]),
  item: Type.Optional(Type.String()),
  amount: Type.Optional(Type.Number()),
});

function memoryNotes(): NoteStore {
  const entries: Array<{ tag: string; text: string; at: number }> = [];
  return {
    async append(tag: string, text: string) {
      entries.push({ tag, text, at: Date.now() });
    },
    async list(tag?: string) {
      return tag ? entries.filter((e) => e.tag === tag) : [...entries];
    },
  };
}

function formatNow(timezone?: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone || undefined,
    dateStyle: 'full',
    timeStyle: 'medium',
  });
  return formatter.format(now);
}

export interface BuiltinToolsOptions {
  runtime?: PetRuntime;
  notes?: NoteStore;
}

/** 内置工具：now / calc / note / pet_actions（runtime 提供时注册 pet_actions，形成 AI↔状态闭环） */
export function builtinTools(options: BuiltinToolsOptions = {}): PetToolDef[] {
  const notes = options.notes ?? memoryNotes();
  const defs: PetToolDef<any>[] = [
    {
      name: 'now',
      label: '当前时间',
      description: '查询当前日期、星期与时间；可指定 IANA 时区。',
      parameters: NOW_PARAMS,
      handler: (params: Static<typeof NOW_PARAMS>): ToolOutput => ({
        text: `现在是 ${formatNow(params.timezone)}。`,
        details: { iso: new Date().toISOString() },
      }),
    },
    {
      name: 'calc',
      label: '计算器',
      description: '安全计算数学表达式，支持 + - * / % ^ 与括号，例如 "1+2*3" 或 "(10-4)/2"。',
      parameters: CALC_PARAMS,
      handler: (params: Static<typeof CALC_PARAMS>): ToolOutput => {
        const value = evaluateExpression(params.expression);
        return { text: `${params.expression} = ${value}`, details: { value } };
      },
    },
    {
      name: 'note',
      label: '记事',
      description: '帮主人记下一件小事（带可选标签），以后可回顾。',
      parameters: NOTE_PARAMS,
      handler: async (params: Static<typeof NOTE_PARAMS>, ctx: ToolContext): Promise<ToolOutput> => {
        const store = ctx.notes ?? notes;
        const tag = params.tag ?? '默认';
        await store.append(tag, params.text);
        const count = (await store.list()).length;
        return { text: `好的，我记下了（标签「${tag}」，共 ${count} 条）。`, details: { tag, count } };
      },
    },
  ];

  if (options.runtime) {
    defs.push({
      name: 'pet_actions',
      label: '宠物行为',
      description:
        '执行宠物行为：feed 喂食（item 可选：小鱼干/彩虹蛋糕/苹果）、play 玩耍（amount 可选 1-100）。会真实改变宠物状态。',
      parameters: PET_ACTIONS_PARAMS,
      handler: (params: Static<typeof PET_ACTIONS_PARAMS>, ctx: ToolContext): ToolOutput => {
        const runtime = ctx.runtime ?? options.runtime;
        if (!runtime) return { text: '宠物系统当前不可用。', isError: true };
        if (params.action === 'feed') {
          const item =
            FOODS.find((f) => f.id === params.item || f.name === params.item) ??
            (params.item ? undefined : FOODS[0]);
          if (!item) {
            return {
              text: `没有这种食物（可选：${FOODS.map((f) => f.name).join('、')}）`,
              isError: true,
            };
          }
          const before = runtime.state.stats;
          runtime.feed(item);
          const after = runtime.state.stats;
          return {
            text: `我吃了${item.name}！饱食度 ${Math.round(before.satiety)} → ${Math.round(after.satiety)}，心情 ${Math.round(before.happiness)} → ${Math.round(after.happiness)}${after.level > before.level ? `，还升到了 ${after.level} 级！` : ''}`,
            details: { item: item.id, stat: after },
          };
        }
        const amount = Math.min(100, Math.max(1, params.amount ?? 10));
        const before = runtime.state.stats;
        runtime.play(amount);
        const after = runtime.state.stats;
        return {
          text: `和主人玩了一会！心情 ${Math.round(before.happiness)} → ${Math.round(after.happiness)}（精力 -${amount / 2}）`,
          details: { amount, stat: after },
        };
      },
      environments: ['desktop', 'mobile'],
    });
  }
  return defs;
}

export type { NoteStore } from './types.js';