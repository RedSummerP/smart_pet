// 平台共有全局（Node 与 WebView 均有）：定时器与控制台。
// 刻意不引入 @types/node / DOM lib，保持包平台中立（无平台专用类型污染）。

declare function setTimeout(handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]): unknown;
declare function clearTimeout(handle: unknown): void;

interface ConsoleLike {
  warn(...data: unknown[]): void;
  log?(...data: unknown[]): void;
  error?(...data: unknown[]): void;
}
declare const console: ConsoleLike;