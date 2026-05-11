// Minimal toast notification store — only for serious errors, not every log entry.
// Uses a simple pub/sub pattern (no Zustand, to keep it dependency-free for layout.tsx).

export type ToastType = 'error' | 'warn' | 'info' | 'success';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  detail?: string;
}

let nextId = 1;
const toasts: Toast[] = [];
const listeners = new Set<() => void>();

function notify() { updateSnapshot(); listeners.forEach(fn => fn()); }

const AUTO_DISMISS_MS = 6000;

export function addToast(type: ToastType, message: string, detail?: string) {
  const id = String(nextId++);
  toasts.push({ id, type, message, detail });
  notify();
  setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
}

export function removeToast(id: string) {
  const idx = toasts.findIndex(t => t.id === id);
  if (idx !== -1) {
    toasts.splice(idx, 1);
    notify();
  }
}

// Cached snapshot for useSyncExternalStore — only create new array on actual changes
let cachedSnapshot: Toast[] = [];
function updateSnapshot() { cachedSnapshot = [...toasts]; }

export function getToasts(): Toast[] { return cachedSnapshot; }

export function subscribeToasts(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
