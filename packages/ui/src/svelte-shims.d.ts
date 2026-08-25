// Svelte 组件 shim：tsc 不做 .svelte 类型检查（由 vite/svelte-check 负责）
declare module '*.svelte' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: unknown;
  export default component;
}