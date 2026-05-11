// Minimal ambient shim for turndown-plugin-gfm — no published types. We only
// pass `gfm` (the bundle of strikethrough + tables + tasklists plugins) into
// turndown's `td.use()`, so we declare just that surface here.
declare module 'turndown-plugin-gfm' {
  type TurndownPlugin = (service: unknown) => void;
  export const gfm: TurndownPlugin;
  export const tables: TurndownPlugin;
  export const strikethrough: TurndownPlugin;
  export const taskListItems: TurndownPlugin;
}
