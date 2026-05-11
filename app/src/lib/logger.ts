// Lasca unified logger — outputs to browser Console + in-memory buffer for DebugPanel
// Server-side (API routes): outputs to terminal only (no buffer).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 'ai' | 'import' | 'store' | 'render' | 'export' | 'general';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  detail?: unknown;
}

const MAX_ENTRIES = 500;
let nextId = 1;

// In-memory log buffer (client-side only)
const logBuffer: LogEntry[] = [];
const listeners = new Set<() => void>();

// Cached snapshot for useSyncExternalStore — only create new array on actual changes
let cachedEntries: LogEntry[] = [];

function notify() {
  cachedEntries = [...logBuffer];
  listeners.forEach(fn => fn());
}

const isServer = typeof window === 'undefined';
const isProdClient = !isServer && process.env.NODE_ENV === 'production';

// Console color prefixes per category
const CATEGORY_COLORS: Record<LogCategory, string> = {
  ai:      'color:#4a90d9;font-weight:bold',
  import:  'color:#5a9e6f;font-weight:bold',
  store:   'color:#8b5ec0;font-weight:bold',
  render:  'color:#c08b5e;font-weight:bold',
  export:  'color:#5eb8c0;font-weight:bold',
  general: 'color:#888;font-weight:bold',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: 'color:#999',
  info:  'color:#4a90d9',
  warn:  'color:#d4a017',
  error: 'color:#d94a4a;font-weight:bold',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function log(level: LogLevel, category: LogCategory, message: string, detail?: unknown) {
  const ts = Date.now();
  const time = formatTime(ts);
  const tag = `[${category}]`;

  // Production client: silence all console output. Still buffer for DebugPanel
  // (which is dev-only anyway), but don't leak anything to DevTools.
  if (isProdClient) {
    const entry: LogEntry = {
      id: String(nextId++),
      timestamp: ts,
      level,
      category,
      message,
      detail,
    };
    logBuffer.push(entry);
    if (logBuffer.length > MAX_ENTRIES) {
      logBuffer.splice(0, logBuffer.length - MAX_ENTRIES);
    }
    notify();
    return;
  }

  // Console output
  if (isServer) {
    // Server: plain text with ANSI colors
    const levelMark = level === 'error' ? '\x1b[31m✗' : level === 'warn' ? '\x1b[33m⚠' : level === 'info' ? '\x1b[36m●' : '\x1b[90m·';
    const reset = '\x1b[0m';
    const msg = `${levelMark} ${reset}\x1b[90m${time}${reset} \x1b[1m${tag}${reset} ${message}`;
    if (detail !== undefined) {
      console[level === 'debug' ? 'log' : level](msg, detail);
    } else {
      console[level === 'debug' ? 'log' : level](msg);
    }
  } else {
    // Browser: styled console
    const prefix = `%c${time} %c${tag}%c ${message}`;
    const args: unknown[] = [prefix, 'color:#999', CATEGORY_COLORS[category], LEVEL_COLORS[level]];
    if (detail !== undefined) args.push(detail);
    console[level === 'debug' ? 'log' : level](...args);

    // Write to in-memory buffer
    const entry: LogEntry = {
      id: String(nextId++),
      timestamp: ts,
      level,
      category,
      message,
      detail,
    };
    logBuffer.push(entry);
    if (logBuffer.length > MAX_ENTRIES) {
      logBuffer.splice(0, logBuffer.length - MAX_ENTRIES);
    }
    notify();
  }
}

export const logger = {
  debug: (category: LogCategory, message: string, detail?: unknown) => log('debug', category, message, detail),
  info:  (category: LogCategory, message: string, detail?: unknown) => log('info', category, message, detail),
  warn:  (category: LogCategory, message: string, detail?: unknown) => log('warn', category, message, detail),
  error: (category: LogCategory, message: string, detail?: unknown) => log('error', category, message, detail),

  /** Get a copy of the current log buffer (client-side only) */
  getEntries: (): LogEntry[] => cachedEntries,

  /** Subscribe to buffer changes. Returns unsubscribe function. */
  subscribe: (fn: () => void): (() => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Clear all buffered entries */
  clear: () => {
    logBuffer.length = 0;
    notify();
  },
};

// ---------------------------------------------------------------------------
// Remote event logger — flushes to /api/log for analytics
// ---------------------------------------------------------------------------
// Separate from the console logger above. This sends structured events to
// the server for persistence in the events table.

interface RemoteEvent {
  type: string;
  payload?: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}

const remoteQueue: RemoteEvent[] = [];
let remoteSessionId: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getSessionId(): string {
  if (!remoteSessionId) {
    remoteSessionId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return remoteSessionId;
}

export function getRemoteSessionId(): string | null {
  if (isServer) return null;
  return getSessionId();
}

function flushRemoteQueue() {
  if (remoteQueue.length === 0) return;
  const events = remoteQueue.splice(0, 20); // max 20 per batch
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('lasca-session') : null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Use sendBeacon if available (works during page unload)
  const body = JSON.stringify({ events });
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    // sendBeacon can't set Authorization header, so fall back to fetch for auth'd users
    if (token) {
      fetch('/api/log', { method: 'POST', headers, body, keepalive: true }).catch(() => {});
    } else {
      navigator.sendBeacon('/api/log', body);
    }
  } else {
    fetch('/api/log', { method: 'POST', headers, body, keepalive: true }).catch(() => {});
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushRemoteQueue();
  }, 10_000); // flush every 10s
}

/** Log a structured event for server-side analytics. */
export function logRemoteEvent(type: string, payload?: Record<string, unknown>) {
  if (isServer) return; // server-side events are logged directly in API routes
  remoteQueue.push({ type, payload, sessionId: getSessionId(), timestamp: Date.now() });
  if (remoteQueue.length >= 5) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    flushRemoteQueue();
  } else {
    scheduleFlush();
  }
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushRemoteQueue);
}
