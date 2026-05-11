'use client';

import { Suspense, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';

const OCHRE = '#5b7cff';
const BG = '#edf3fb';
const TEXT = '#1f2738';
const MUTED = '#71809a';
const BORDER = 'rgba(133,150,178,0.28)';
const GLASS_BLUR = 'blur(28px) saturate(175%)';
const GLASS_BORDER = 'rgba(255,255,255,0.42)';
const GLASS_BORDER_SOFT = 'rgba(255,255,255,0.24)';
const GLASS_SURFACE = 'rgba(255,255,255,0.34)';
const GLASS_SURFACE_WARM = 'rgba(232,241,255,0.24)';
const GLASS_SHADOW = '0 20px 44px rgba(41, 58, 92, 0.08)';
const GLASS_INSET = 'inset 0 1px 0 rgba(255,255,255,0.72)';

type AdminSection = 'overview' | 'activity' | 'feedback' | 'users' | 'invites' | 'flags' | 'caps';

interface Stats {
  totalUsers: number;
  todayRegistered: number;
  todayActive: number;
  todayAiCalls: number;
  todayFeedback: number;
}

interface Cap {
  group_name: string;
  max_users: number;
  current_users: number;
  max_child_invites_per_user: number;
}

interface Invite {
  code: string;
  source_group: string;
  created_by_user_id?: number | null;
  created_by_email?: string;
  used_by_email?: string;
  used_at?: string;
  max_uses?: number | null;
  use_count?: number;
  created_at: string;
}

interface FeedbackEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  source_group: string | null;
  session_id: string | null;
  category: string | null;
  text: string | null;
  created_at: string;
}

interface FeedbackData {
  feedback: FeedbackEntry[];
  total: number;
  categoryCounts: Array<{ category: string; count: number }>;
}

interface EventEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  source_group: string | null;
  session_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface ActivityData {
  events: EventEntry[];
  total: number;
}

const DEFAULT_ACTIVITY_TYPES = [
  'ai_generate',
  'ai_edit',
  'ai_polish',
  'deck_imported',
  'deck_created',
  'export_lasca',
  'export_pdf',
  'present_opened',
  'feedback',
  'feedback_submit_failed',
  'generation-rating',
  'error',
];

type FlagGroupId = 'access' | 'imports' | 'exports' | 'limits' | 'other';
type FlagKind = 'boolean' | 'number' | 'text';
type FlagBehavior = 'live' | 'partial' | 'stored' | 'unknown';

interface FlagDefinition {
  label: string;
  description: string;
  group: FlagGroupId;
  kind: FlagKind;
  behavior: FlagBehavior;
  defaultValue?: string;
  note?: string;
  dependsOn?: string;
  min?: number;
}

const MOCK_STATS: Stats = {
  totalUsers: 42,
  todayRegistered: 5,
  todayActive: 19,
  todayAiCalls: 88,
  todayFeedback: 7,
};

const MOCK_USERS: Array<Record<string, unknown>> = [
  {
    id: 1,
    email: 'amy@lasca.dev',
    source_group: 'design-partners',
    role: 'member',
    status: 'active',
    ai_calls_today: 4,
    created_at: '2026-04-12T09:20:00.000Z',
  },
  {
    id: 2,
    email: 'ops@lasca.dev',
    source_group: 'internal',
    role: 'admin',
    status: 'warned',
    ai_calls_today: 12,
    created_at: '2026-04-11T02:00:00.000Z',
  },
];

const MOCK_FLAG_VALUES = {
  auth_mode: 'google_only',
  registration_open: 'true',
  export_enabled: 'true',
  export_lasca_enabled: 'false',
  import_file: 'true',
  import_pptx: 'true',
  import_pdf: 'false',
  max_import_mb: '20',
  max_decks: '5',
  ai_daily_limit: '30',
  max_slides: '15',
};

const MOCK_CAPS: Cap[] = [
  {
    group_name: 'design-partners',
    max_users: 80,
    current_users: 36,
    max_child_invites_per_user: 3,
  },
  {
    group_name: 'internal',
    max_users: 20,
    current_users: 12,
    max_child_invites_per_user: 10,
  },
];

const MOCK_INVITES: Invite[] = [
  {
    code: 'DESIGN-7A2M',
    source_group: 'design-partners',
    created_by_email: 'ops@lasca.dev',
    used_by_email: 'amy@lasca.dev',
    used_at: '2026-04-12T10:10:00.000Z',
    max_uses: 1,
    use_count: 1,
    created_at: '2026-04-10T08:30:00.000Z',
  },
  {
    code: 'INTERNAL-Q9LK',
    source_group: 'internal',
    created_by_email: 'ops@lasca.dev',
    max_uses: 10,
    use_count: 2,
    created_at: '2026-04-12T06:40:00.000Z',
  },
];

const MOCK_FEEDBACK: FeedbackData = {
  total: 2,
  categoryCounts: [
    { category: 'ux', count: 1 },
    { category: 'bug', count: 1 },
  ],
  feedback: [
    {
      id: 1,
      user_id: 1,
      user_email: 'amy@lasca.dev',
      source_group: 'design-partners',
      session_id: 'sess_preview_1',
      category: 'ux',
      text: 'Import settings are clearer now, but export hierarchy should be even more obvious.',
      created_at: '2026-04-12T11:00:00.000Z',
    },
    {
      id: 2,
      user_id: null,
      user_email: null,
      source_group: 'internal',
      session_id: 'sess_preview_2',
      category: 'bug',
      text: 'Need a hard size cap before the import parser starts.',
      created_at: '2026-04-11T15:30:00.000Z',
    },
  ],
};

const MOCK_ACTIVITY: ActivityData = {
  total: 4,
  events: [
    {
      id: 1,
      user_id: 1,
      user_email: 'amy@lasca.dev',
      source_group: 'design-partners',
      session_id: 'sess_preview_1',
      event_type: 'deck_imported',
      payload: { kind: 'pptx', sizeMb: 14.8 },
      created_at: '2026-04-12T11:05:00.000Z',
    },
    {
      id: 2,
      user_id: 1,
      user_email: 'amy@lasca.dev',
      source_group: 'design-partners',
      session_id: 'sess_preview_1',
      event_type: 'export_lasca',
      payload: { enabled: false, blockedByFlag: true },
      created_at: '2026-04-12T11:10:00.000Z',
    },
    {
      id: 3,
      user_id: 2,
      user_email: 'ops@lasca.dev',
      source_group: 'internal',
      session_id: 'sess_preview_2',
      event_type: 'ai_generate',
      payload: { pages: 12 },
      created_at: '2026-04-12T09:00:00.000Z',
    },
    {
      id: 4,
      user_id: null,
      user_email: null,
      source_group: 'internal',
      session_id: 'sess_preview_2',
      event_type: 'feedback',
      payload: { category: 'ux' },
      created_at: '2026-04-11T15:30:00.000Z',
    },
  ],
};

const FLAG_GROUPS: Array<{ id: FlagGroupId; title: string; description: string }> = [
  {
    id: 'access',
    title: 'Access & Shell',
    description: 'Controls who can enter the product and which shell actions stay visible.',
  },
  {
    id: 'imports',
    title: 'Imports',
    description: 'Master and per-format gates for user upload flows.',
  },
  {
    id: 'exports',
    title: 'Exports',
    description: 'Master switches and per-format controls for download actions.',
  },
  {
    id: 'limits',
    title: 'Limits',
    description: 'Usage ceilings and quota values used by the current beta shell.',
  },
  {
    id: 'other',
    title: 'Other Flags',
    description: 'Raw values that do not have a curated admin description yet.',
  },
];

const FLAG_ORDER = [
  'auth_mode',
  'registration_open',
  'export_enabled',
  'export_lasca_enabled',
  'import_file',
  'import_pptx',
  'import_pdf',
  'max_import_mb',
  'max_decks',
  'ai_daily_limit',
  'max_slides',
] as const;

const IMPORT_CHILD_KEYS = ['import_pptx', 'import_pdf', 'max_import_mb'] as const;
const EXPORT_CHILD_KEYS = ['export_lasca_enabled'] as const;

const FLAG_DEFINITIONS: Record<string, FlagDefinition> = {
  auth_mode: {
    label: 'Auth Mode',
    description: 'Which sign-in path the public registration page renders.',
    group: 'access',
    kind: 'text',
    behavior: 'live',
    defaultValue: 'google_only',
    note: "'google_only' (default, public Google OAuth signup) or 'invite_legacy' (legacy LASCA-XXXXX invite flow). Server-side OAuth route (/api/auth/google) is always available regardless of this flag.",
  },
  registration_open: {
    label: 'Open Registration (legacy)',
    description: 'When auth_mode=invite_legacy, controls whether new invite-code signups are accepted.',
    group: 'access',
    kind: 'boolean',
    behavior: 'live',
    defaultValue: 'true',
    dependsOn: 'auth_mode',
    note: 'Has no effect when auth_mode=google_only.',
  },
  export_enabled: {
    label: 'All Exports',
    description: 'Master switch for download actions in the editor.',
    group: 'exports',
    kind: 'boolean',
    behavior: 'live',
    defaultValue: 'true',
  },
  export_lasca_enabled: {
    label: '.lasca HTML Export',
    description: 'Allow users to download the self-contained Lasca HTML file.',
    group: 'exports',
    kind: 'boolean',
    behavior: 'live',
    defaultValue: 'false',
    dependsOn: 'export_enabled',
    note: 'When off, the .lasca item stays visible but cannot be clicked.',
  },
  import_file: {
    label: 'File Imports',
    description: 'Master switch for opening non-image document imports from landing and editor.',
    group: 'imports',
    kind: 'boolean',
    behavior: 'partial',
    defaultValue: 'false',
    note: 'Picker routes obey this. Drag-and-drop is still not fully gated in the current build.',
  },
  import_pptx: {
    label: 'PPTX Imports',
    description: 'Allow PowerPoint uploads and their faithful/redesign flows.',
    group: 'imports',
    kind: 'boolean',
    behavior: 'partial',
    defaultValue: 'false',
    dependsOn: 'import_file',
    note: 'Only matters when the master File Imports switch is on.',
  },
  import_pdf: {
    label: 'PDF Imports',
    description: 'Allow PDF upload paths for report/slide import.',
    group: 'imports',
    kind: 'boolean',
    behavior: 'partial',
    defaultValue: 'false',
    dependsOn: 'import_file',
    note: 'Only matters when the master File Imports switch is on.',
  },
  max_import_mb: {
    label: 'Max Import Size (MB)',
    description: 'Per-file size cap for document imports. Set 0 to remove the limit.',
    group: 'imports',
    kind: 'number',
    behavior: 'live',
    defaultValue: '0',
    dependsOn: 'import_file',
    min: 0,
    note: 'Checked before parsing on landing and editor import flows.',
  },
  max_decks: {
    label: 'Deck Limit Per User',
    description: 'Cap how many decks a user can create or import locally from the main product flows.',
    group: 'limits',
    kind: 'number',
    behavior: 'live',
    defaultValue: '5',
    min: 1,
  },
  ai_daily_limit: {
    label: 'AI Calls Per Day',
    description: 'Server-enforced daily quota for generate, edit, and polish endpoints.',
    group: 'limits',
    kind: 'number',
    behavior: 'live',
    defaultValue: '30',
    min: 0,
  },
  max_slides: {
    label: 'Max Pages Per Deck',
    description: 'Intended cap for deck length.',
    group: 'limits',
    kind: 'number',
    behavior: 'stored',
    defaultValue: '15',
    min: 1,
    note: 'Stored in the database, but not enforced by the current editor/import flows yet.',
  },
};

function normalizeSection(value: string | null): AdminSection {
  switch (value) {
    case 'overview':
    case 'activity':
    case 'feedback':
    case 'users':
    case 'invites':
    case 'flags':
    case 'caps':
      return value;
    default:
      return 'overview';
  }
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatCategory(value?: string | null): string {
  if (!value) return 'other';
  return value.replace(/_/g, ' ');
}

function humanizeFlagKey(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function inferFlagKind(value: string): FlagKind {
  if (value === 'true' || value === 'false') return 'boolean';
  if (value.trim() !== '' && !Number.isNaN(Number(value))) return 'number';
  return 'text';
}

function getFlagDefinition(flagKey: string, value: string): FlagDefinition {
  const definition = FLAG_DEFINITIONS[flagKey];
  if (definition) return definition;
  return {
    label: humanizeFlagKey(flagKey),
    description: 'Raw feature flag with no curated admin help text yet.',
    group: 'other',
    kind: inferFlagKind(value),
    behavior: 'unknown',
    note: 'Keep this key only if another route still reads it.',
  };
}

function getBehaviorLabel(behavior: FlagBehavior): string {
  switch (behavior) {
    case 'live':
      return 'Live';
    case 'partial':
      return 'Partial';
    case 'stored':
      return 'Stored only';
    case 'unknown':
      return 'Unknown';
  }
}

function mergeWithKnownFlagDefaults(raw: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, definition] of Object.entries(FLAG_DEFINITIONS)) {
    if (definition.defaultValue !== undefined) merged[key] = definition.defaultValue;
  }
  return { ...merged, ...raw };
}

function getDefaultCollapsedFlagGroups(): Record<FlagGroupId, boolean> {
  return {
    access: false,
    imports: false,
    exports: false,
    limits: false,
    other: false,
  };
}

function getBehaviorDescription(behavior: FlagBehavior): string {
  switch (behavior) {
    case 'live':
      return 'This setting is actively enforced in the current build.';
    case 'partial':
      return 'Part of the product obeys this setting, but some paths still bypass it.';
    case 'stored':
      return 'The value is persisted, but the runtime does not enforce it yet.';
    case 'unknown':
      return 'No enforcement summary has been documented for this key.';
  }
}

function AdminDashboard() {
  const searchParams = useSearchParams();
  const key = searchParams.get('key') || '';
  const mockParam = searchParams.get('mock');
  const mockMode = process.env.NODE_ENV !== 'production' && (mockParam === '1' || (!key && mockParam !== '0'));
  const initialMockFlags = mockMode ? mergeWithKnownFlagDefaults(MOCK_FLAG_VALUES) : {};
  const [activeSection, setActiveSection] = useState<AdminSection>(() => normalizeSection(searchParams.get('section')));

  const [authChecked, setAuthChecked] = useState(mockMode);
  const [authorized, setAuthorized] = useState(mockMode);

  const [stats, setStats] = useState<Stats | null>(mockMode ? MOCK_STATS : null);
  const [users, setUsers] = useState<Array<Record<string, unknown>>>(mockMode ? MOCK_USERS : []);
  const [flags, setFlags] = useState<Record<string, string>>(initialMockFlags);
  const [flagDrafts, setFlagDrafts] = useState<Record<string, string>>(initialMockFlags);
  const [flagSaving, setFlagSaving] = useState<Record<string, boolean>>({});
  const [flagErrors, setFlagErrors] = useState<Record<string, string>>({});
  const [flagSavedAt, setFlagSavedAt] = useState<Record<string, number>>({});
  const [collapsedFlagGroups, setCollapsedFlagGroups] = useState<Record<FlagGroupId, boolean>>(() => getDefaultCollapsedFlagGroups());
  const [caps, setCaps] = useState<Cap[]>(mockMode ? MOCK_CAPS : []);
  const [invites, setInvites] = useState<Invite[]>(mockMode ? MOCK_INVITES : []);

  const [feedbackData, setFeedbackData] = useState<FeedbackData>(mockMode ? MOCK_FEEDBACK : { feedback: [], total: 0, categoryCounts: [] });
  const [feedbackCategory, setFeedbackCategory] = useState('');
  const [feedbackQuery, setFeedbackQuery] = useState('');
  const [feedbackDays, setFeedbackDays] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const [activityData, setActivityData] = useState<ActivityData>(mockMode ? MOCK_ACTIVITY : { events: [], total: 0 });
  const [activityType, setActivityType] = useState('');
  const [activityQuery, setActivityQuery] = useState('');
  const [activityDays, setActivityDays] = useState(7);
  const [activityLoading, setActivityLoading] = useState(false);

  const [inviteFilter, setInviteFilter] = useState('');
  const [inviteGroup, setInviteGroup] = useState('');
  const [customGroup, setCustomGroup] = useState('');
  const [inviteCount, setInviteCount] = useState(10);
  const [inviteMaxUses, setInviteMaxUses] = useState<number | null>(1);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupMax, setNewGroupMax] = useState(100);
  const [newGroupChildInvites, setNewGroupChildInvites] = useState(3);
  const [editingCap, setEditingCap] = useState<Cap | null>(null);
  const [editMax, setEditMax] = useState(0);
  const [editChildInvites, setEditChildInvites] = useState(0);

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const sep = path.includes('?') ? '&' : '?';
    return fetch(`${path}${sep}key=${encodeURIComponent(key)}`, opts);
  }, [key]);

  const goToSection = useCallback((section: AdminSection) => {
    setActiveSection(section);
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('section', section);
    window.history.replaceState(null, '', `/admin?${params.toString()}`);
  }, [searchParams]);

  const refreshStats = useCallback(async () => {
    const res = await apiFetch('/api/admin/stats');
    if (!res.ok) return false;
    const data = await res.json() as Stats;
    setStats(data);
    return true;
  }, [apiFetch]);

  const refreshUsers = useCallback(async () => {
    const res = await apiFetch('/api/admin/users');
    if (!res.ok) return;
    const data = await res.json() as { users?: Array<Record<string, unknown>> };
    setUsers(data.users ?? []);
  }, [apiFetch]);

  const refreshFlags = useCallback(async () => {
    const res = await apiFetch('/api/admin/flags');
    if (!res.ok) return;
    const data = await res.json() as Record<string, string>;
    const merged = mergeWithKnownFlagDefaults(data ?? {});
    setFlags(merged);
    setFlagDrafts(merged);
  }, [apiFetch]);

  const refreshCaps = useCallback(async () => {
    const res = await apiFetch('/api/admin/caps');
    if (!res.ok) return;
    const data = await res.json() as Cap[];
    setCaps(data ?? []);
  }, [apiFetch]);

  const refreshInvites = useCallback(async () => {
    const res = await apiFetch('/api/admin/invites');
    if (!res.ok) return;
    const data = await res.json() as { invites?: Invite[] };
    setInvites(data.invites ?? []);
  }, [apiFetch]);

  const refreshFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    const params = new URLSearchParams();
    if (feedbackCategory) params.set('category', feedbackCategory);
    if (feedbackQuery.trim()) params.set('q', feedbackQuery.trim());
    params.set('days', String(feedbackDays));
    params.set('pageSize', '100');

    try {
      const res = await apiFetch(`/api/admin/feedback?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json() as FeedbackData;
      setFeedbackData({
        feedback: data.feedback ?? [],
        total: data.total ?? 0,
        categoryCounts: data.categoryCounts ?? [],
      });
    } finally {
      setFeedbackLoading(false);
    }
  }, [apiFetch, feedbackCategory, feedbackQuery, feedbackDays]);

  const refreshActivity = useCallback(async () => {
    setActivityLoading(true);
    const params = new URLSearchParams();
    if (activityType) params.set('type', activityType);
    if (activityQuery.trim()) params.set('q', activityQuery.trim());
    params.set('days', String(activityDays));
    params.set('limit', '100');

    try {
      const res = await apiFetch(`/api/admin/events?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json() as ActivityData;
      setActivityData({
        events: data.events ?? [],
        total: data.total ?? 0,
      });
    } finally {
      setActivityLoading(false);
    }
  }, [activityDays, activityQuery, activityType, apiFetch]);

  useEffect(() => {
    setActiveSection(normalizeSection(searchParams.get('section')));
  }, [searchParams]);

  useEffect(() => {
    if (!mockMode) return;
    const mockFlags = mergeWithKnownFlagDefaults(MOCK_FLAG_VALUES);
    setAuthChecked(true);
    setAuthorized(true);
    setStats(MOCK_STATS);
    setUsers(MOCK_USERS);
    setFlags(mockFlags);
    setFlagDrafts(mockFlags);
    setCaps(MOCK_CAPS);
    setInvites(MOCK_INVITES);
    setFeedbackData(MOCK_FEEDBACK);
    setActivityData(MOCK_ACTIVITY);
  }, [mockMode]);

  useEffect(() => {
    let cancelled = false;
    if (mockMode) {
      setAuthChecked(true);
      setAuthorized(true);
      return;
    }
    if (!key) {
      setAuthChecked(true);
      setAuthorized(false);
      return;
    }

    setAuthChecked(false);
    refreshStats()
      .then((ok) => {
        if (!cancelled) setAuthorized(ok);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [key, mockMode, refreshStats]);

  useEffect(() => {
    if (!authorized || mockMode) return;
    void Promise.all([
      refreshUsers(),
      refreshFlags(),
      refreshCaps(),
      refreshInvites(),
    ]);
  }, [authorized, mockMode, refreshUsers, refreshFlags, refreshCaps, refreshInvites]);

  useEffect(() => {
    if (!authorized || mockMode) return;
    void refreshFeedback();
  }, [authorized, mockMode, refreshFeedback]);

  useEffect(() => {
    if (!authorized || mockMode) return;
    void refreshActivity();
  }, [authorized, mockMode, refreshActivity]);

  const handleUserAction = async (userId: number, action: string) => {
    if (mockMode) {
      setUsers((current) => current.map((user) => {
        if (Number(user.id) !== userId) return user;
        if (action === 'ban') return { ...user, status: 'banned' };
        if (action === 'activate') return { ...user, status: 'active' };
        return user;
      }));
      return;
    }
    await apiFetch(`/api/admin/users/${userId}?`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    void Promise.all([refreshUsers(), refreshStats()]);
  };

  const setFlagDraft = useCallback((flagKey: string, value: string) => {
    setFlagDrafts((current) => ({ ...current, [flagKey]: value }));
    setFlagErrors((current) => {
      if (!(flagKey in current)) return current;
      const next = { ...current };
      delete next[flagKey];
      return next;
    });
  }, []);

  const toggleFlagGroup = useCallback((groupId: FlagGroupId) => {
    setCollapsedFlagGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }, []);

  const commitFlagValue = useCallback(async (flagKey: string, rawValue: string) => {
    const previousValue = mergeWithKnownFlagDefaults(flags)[flagKey] ?? '';
    const definition = getFlagDefinition(flagKey, rawValue);

    let normalizedValue = rawValue.trim();
    if (definition.kind === 'number') {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        setFlagErrors((current) => ({ ...current, [flagKey]: 'Enter a valid number.' }));
        return;
      }
      const integer = Math.trunc(parsed);
      if (definition.min !== undefined && integer < definition.min) {
        setFlagErrors((current) => ({ ...current, [flagKey]: `Must be at least ${definition.min}.` }));
        return;
      }
      normalizedValue = String(integer);
    }

    setFlagDrafts((current) => ({ ...current, [flagKey]: normalizedValue }));
    setFlagErrors((current) => {
      if (!(flagKey in current)) return current;
      const next = { ...current };
      delete next[flagKey];
      return next;
    });
    setFlagSaving((current) => ({ ...current, [flagKey]: true }));
    setFlags((current) => ({ ...current, [flagKey]: normalizedValue }));

    try {
      if (mockMode) {
        setFlagSavedAt((current) => ({ ...current, [flagKey]: Date.now() }));
        return;
      }
      const res = await apiFetch('/api/admin/flags?', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: flagKey, value: normalizedValue }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error || 'Failed to save setting.');
      }
      setFlagSavedAt((current) => ({ ...current, [flagKey]: Date.now() }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save setting.';
      setFlags((current) => ({ ...current, [flagKey]: previousValue }));
      setFlagDrafts((current) => ({ ...current, [flagKey]: previousValue }));
      setFlagErrors((current) => ({ ...current, [flagKey]: message }));
    } finally {
      setFlagSaving((current) => ({ ...current, [flagKey]: false }));
    }
  }, [apiFetch, flags, mockMode]);

  const handleGenerateInvites = async () => {
    const group = inviteGroup === '__custom__' ? customGroup.trim() : inviteGroup;
    if (!group) return;
    if (mockMode) {
      const generated = Array.from({ length: inviteCount }, (_, index) => `${group.toUpperCase().slice(0, 6)}-${String(index + 1).padStart(2, '0')}X`);
      setGeneratedCodes(generated);
      setInvites((current) => [
        ...generated.map((code) => ({
          code,
          source_group: group,
          max_uses: inviteMaxUses,
          use_count: 0,
          created_at: new Date().toISOString(),
        })),
        ...current,
      ]);
      return;
    }
    const res = await apiFetch('/api/admin/invites/batch?', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group, count: inviteCount, maxUses: inviteMaxUses }),
    });
    if (!res.ok) return;
    const data = await res.json() as { codes?: string[] };
    setGeneratedCodes(data.codes ?? []);
    void refreshInvites();
  };

  const handleUpsertCap = async (groupName: string, maxUsers: number, maxChildInvites: number) => {
    if (mockMode) {
      setCaps((current) => {
        const existing = current.find((cap) => cap.group_name === groupName);
        if (existing) {
          return current.map((cap) => (
            cap.group_name === groupName
              ? { ...cap, max_users: maxUsers, max_child_invites_per_user: maxChildInvites }
              : cap
          ));
        }
        return [
          ...current,
          {
            group_name: groupName,
            max_users: maxUsers,
            current_users: 0,
            max_child_invites_per_user: maxChildInvites,
          },
        ];
      });
      setEditingCap(null);
      setNewGroupName('');
      setNewGroupMax(100);
      setNewGroupChildInvites(3);
      return;
    }
    await apiFetch('/api/admin/caps?', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName, maxUsers, maxChildInvites }),
    });
    setEditingCap(null);
    setNewGroupName('');
    setNewGroupMax(100);
    setNewGroupChildInvites(3);
    void refreshCaps();
  };

  if (!mockMode && !key) {
    return <div style={containerStyle}><div style={emptyStateStyle}>Missing admin key.</div></div>;
  }

  if (!authChecked) {
    return <div style={containerStyle}><div style={emptyStateStyle}>Loading admin...</div></div>;
  }

  if (!authorized) {
    return <div style={containerStyle}><div style={emptyStateStyle}>Unauthorized</div></div>;
  }

  const effectiveFlags = mergeWithKnownFlagDefaults(flags);
  const groupNames = caps.map((cap) => cap.group_name);
  const filteredInvites = inviteFilter ? invites.filter((invite) => invite.source_group === inviteFilter) : invites;
  const usedInviteCount = filteredInvites.filter((invite) => invite.used_at).length;
  const eventTypeOptions = Array.from(new Set([...DEFAULT_ACTIVITY_TYPES, ...activityData.events.map((event) => event.event_type)])).sort();
  const sortedFlagEntries = Object.entries(effectiveFlags).sort(([keyA, valueA], [keyB, valueB]) => {
    const defA = getFlagDefinition(keyA, valueA);
    const defB = getFlagDefinition(keyB, valueB);
    const groupIndexA = FLAG_GROUPS.findIndex((group) => group.id === defA.group);
    const groupIndexB = FLAG_GROUPS.findIndex((group) => group.id === defB.group);
    if (groupIndexA !== groupIndexB) return groupIndexA - groupIndexB;

    const orderIndexA = FLAG_ORDER.indexOf(keyA as typeof FLAG_ORDER[number]);
    const orderIndexB = FLAG_ORDER.indexOf(keyB as typeof FLAG_ORDER[number]);
    if (orderIndexA !== -1 || orderIndexB !== -1) {
      if (orderIndexA === -1) return 1;
      if (orderIndexB === -1) return -1;
      return orderIndexA - orderIndexB;
    }

    return keyA.localeCompare(keyB);
  });

  const getFlagUiState = (
    flagKey: string,
    value: string,
    options: {
      disableFromParent?: boolean;
    } = {},
  ) => {
    const definition = getFlagDefinition(flagKey, value);
    const draftValue = flagDrafts[flagKey] ?? value;
    const dirty = draftValue !== value;
    const saving = flagSaving[flagKey] === true;
    const error = flagErrors[flagKey];
    const saved = Boolean(flagSavedAt[flagKey]) && !dirty && !saving && !error;
    const dependsOnOff = definition.dependsOn
      ? (flagDrafts[definition.dependsOn] ?? effectiveFlags[definition.dependsOn] ?? definition.defaultValue ?? 'false') === 'false'
      : false;
    const disabledByParent = options.disableFromParent ?? dependsOnOff;
    const interactionDisabled = saving || disabledByParent;

    return {
      definition,
      draftValue,
      dirty,
      saving,
      error,
      saved,
      disabledByParent,
      interactionDisabled,
    };
  };

  const renderFamilyFlagRow = (
    flagKey: string,
    value: string,
    options: {
      roleLabel?: 'Master' | 'Child';
      showRolePill?: boolean;
      parentLabel?: string;
      disableFromParent?: boolean;
      unitLabel?: string;
      isLast?: boolean;
    },
  ) => {
    const isMaster = options.roleLabel === 'Master';
    const {
      definition,
      draftValue,
      dirty,
      saving,
      error,
      saved,
      disabledByParent,
      interactionDisabled,
    } = getFlagUiState(flagKey, value, { disableFromParent: options.disableFromParent });

    const footerMessage = saving
      ? <span style={flagPendingTextStyle}>Saving…</span>
      : error
        ? <span style={flagErrorTextStyle}>{error}</span>
        : dirty
          ? <span style={flagDirtyTextStyle}>Unsaved change</span>
          : saved
            ? <span style={flagSavedTextStyle}>Saved</span>
            : disabledByParent
              ? <span style={flagWarningTextStyle}>Inactive while {options.parentLabel || 'the master switch'} is Off.</span>
              : <span style={flagMutedTextStyle}>{definition.note || getBehaviorDescription(definition.behavior)}</span>;

    return (
      <div
        key={flagKey}
        style={{
          ...settingRowStyle,
          ...(isMaster ? settingMasterRowStyle : null),
          borderBottom: options.isLast ? 'none' : `1px solid ${BORDER}`,
          opacity: disabledByParent ? 0.58 : 1,
        }}
      >
        <div style={settingRowMainStyle}>
          <div style={{
            ...settingRowTitleLineStyle,
            ...(isMaster ? settingMasterTitleLineStyle : null),
          }}>
            <span style={{
              ...settingRowTitleStyle,
              ...(isMaster ? settingMasterTitleStyle : null),
            }}
            >
              {definition.label}
            </span>
            {options.showRolePill && options.roleLabel ? (
              <span style={options.roleLabel === 'Master' ? settingMasterPillStyle : settingChildPillStyle}>
                {options.roleLabel}
              </span>
            ) : null}
            <BehaviorBadge behavior={definition.behavior} />
          </div>
          <div style={{
            ...settingRowDescriptionStyle,
            ...(isMaster ? settingMasterDescriptionStyle : null),
          }}
          >
            {definition.description}
          </div>
          <div style={settingRowMetaStyle}>
            <code style={settingKeyChipStyle}>{flagKey}</code>
            {definition.dependsOn && options.parentLabel ? (
              <span style={settingMetaTextStyle}>Requires {options.parentLabel}</span>
            ) : null}
          </div>
          <div style={settingRowFooterStyle}>{footerMessage}</div>
        </div>

        <div style={settingRowControlStyle}>
          {definition.kind === 'boolean' ? (
            <div style={settingSwitchWrapStyle}>
              <span style={settingSwitchStateStyle}>{draftValue === 'true' ? 'On' : 'Off'}</span>
              <AppleSwitch
                checked={draftValue === 'true'}
                disabled={interactionDisabled}
                onToggle={(next) => void commitFlagValue(flagKey, next ? 'true' : 'false')}
              />
            </div>
          ) : (
            <div style={settingNumberControlStyle}>
              <div style={settingNumberFieldStyle}>
                <input
                  type={definition.kind === 'number' ? 'number' : 'text'}
                  min={definition.kind === 'number' ? definition.min : undefined}
                  value={draftValue}
                  disabled={interactionDisabled}
                  onChange={(e) => setFlagDraft(flagKey, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commitFlagValue(flagKey, draftValue);
                    }
                  }}
                  style={{
                    ...settingNumberInputStyle,
                    opacity: interactionDisabled ? 0.6 : 1,
                  }}
                />
                {options.unitLabel ? <span style={settingUnitLabelStyle}>{options.unitLabel}</span> : null}
              </div>
              <button
                onClick={() => void commitFlagValue(flagKey, draftValue)}
                disabled={!dirty || interactionDisabled}
                style={{
                  ...settingInlineSaveStyle,
                  opacity: !dirty || interactionDisabled ? 0.45 : 1,
                  cursor: !dirty || interactionDisabled ? 'not-allowed' : 'pointer',
                }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStandardFlagList = (groupEntries: Array<[string, string]>) => (
    <div style={settingListStyle}>
      {groupEntries.map(([flagKey, value], index) =>
        renderFamilyFlagRow(flagKey, value, {
          isLast: index === groupEntries.length - 1,
        }),
      )}
    </div>
  );

  const renderFamilyInfoRow = (
    options: {
      title: string;
      description: string;
      activeText: string;
      inactiveText: string;
      parentOff: boolean;
      isLast?: boolean;
    },
  ) => (
    <div
      style={{
        ...settingRowStyle,
        borderBottom: options.isLast ? 'none' : `1px solid ${BORDER}`,
        opacity: options.parentOff ? 0.58 : 1,
      }}
    >
      <div style={settingRowMainStyle}>
        <div style={settingRowTitleLineStyle}>
          <span style={settingRowTitleStyle}>{options.title}</span>
          <span style={settingInheritedPillStyle}>Inherited</span>
        </div>
        <div style={settingRowDescriptionStyle}>{options.description}</div>
        <div style={settingRowFooterStyle}>
          <span style={options.parentOff ? flagWarningTextStyle : flagSavedTextStyle}>
            {options.parentOff ? options.inactiveText : options.activeText}
          </span>
        </div>
      </div>
    </div>
  );

  const renderImportFamily = (groupEntries: Array<[string, string]>) => {
    const parentEntry = groupEntries.find(([flagKey]) => flagKey === 'import_file');
    if (!parentEntry) return null;

    const parentValue = flagDrafts.import_file ?? parentEntry[1];
    const parentOff = parentValue === 'false';
    const childEntries = IMPORT_CHILD_KEYS
      .map((key) => groupEntries.find(([flagKey]) => flagKey === key))
      .filter((entry): entry is [string, string] => Boolean(entry));
    const otherEntries = groupEntries.filter(([flagKey]) => flagKey !== 'import_file' && !IMPORT_CHILD_KEYS.includes(flagKey as typeof IMPORT_CHILD_KEYS[number]));

    return (
      <div style={flagFamilyStyle}>
        <div style={settingSectionLabelStyle}>Master</div>
        <div style={settingListStyle}>
          {renderFamilyFlagRow(parentEntry[0], parentEntry[1], {
            roleLabel: 'Master',
            isLast: true,
          })}
        </div>

        <div style={settingSectionLabelStyle}>Available When File Imports Is On</div>
        <div style={settingFamilyNoteStyle}>
          Turn on the master switch first, then tune format permissions and the upload size cap below.
        </div>
        <div style={settingListStyle}>
          {childEntries.map(([flagKey, value], index) =>
            renderFamilyFlagRow(flagKey, value, {
              roleLabel: 'Child',
              disableFromParent: parentOff,
              parentLabel: 'File Imports',
              unitLabel: flagKey === 'max_import_mb' ? 'MB' : undefined,
              isLast: index === childEntries.length + otherEntries.length,
            }),
          )}
          {renderFamilyInfoRow({
            title: 'Other Documents',
            description: 'Markdown, text, JSON, HTML, and Lasca files follow the File Imports master switch only.',
            activeText: 'Currently allowed because File Imports is On.',
            inactiveText: 'Currently blocked because File Imports is Off.',
            parentOff,
            isLast: otherEntries.length === 0,
          })}
          {otherEntries.map(([flagKey, value], index) =>
            renderFamilyFlagRow(flagKey, value, {
              roleLabel: 'Child',
              disableFromParent: parentOff,
              parentLabel: 'File Imports',
              isLast: index === otherEntries.length - 1,
            }),
          )}
        </div>
      </div>
    );
  };

  const renderExportFamily = (groupEntries: Array<[string, string]>) => {
    const parentEntry = groupEntries.find(([flagKey]) => flagKey === 'export_enabled');
    if (!parentEntry) return null;

    const parentValue = flagDrafts.export_enabled ?? parentEntry[1];
    const parentOff = parentValue === 'false';
    const childEntries = EXPORT_CHILD_KEYS
      .map((key) => groupEntries.find(([flagKey]) => flagKey === key))
      .filter((entry): entry is [string, string] => Boolean(entry));
    const otherEntries = groupEntries.filter(([flagKey]) => flagKey !== 'export_enabled' && !EXPORT_CHILD_KEYS.includes(flagKey as typeof EXPORT_CHILD_KEYS[number]));

    return (
      <div style={flagFamilyStyle}>
        <div style={settingSectionLabelStyle}>Master</div>
        <div style={settingListStyle}>
          {renderFamilyFlagRow(parentEntry[0], parentEntry[1], {
            roleLabel: 'Master',
            isLast: true,
          })}
        </div>

        <div style={settingSectionLabelStyle}>Available When All Exports Is On</div>
        <div style={settingFamilyNoteStyle}>
          Keep the top export gate on, then use the rows below for format-specific permissions.
        </div>
        <div style={settingListStyle}>
          {childEntries.map(([flagKey, value], index) =>
            renderFamilyFlagRow(flagKey, value, {
              roleLabel: 'Child',
              disableFromParent: parentOff,
              parentLabel: 'All Exports',
              isLast: index === childEntries.length + otherEntries.length,
            }),
          )}
          {renderFamilyInfoRow({
            title: 'PDF Export',
            description: 'PDF and PDF 4K downloads currently follow the All Exports master switch only.',
            activeText: 'Currently allowed because All Exports is On.',
            inactiveText: 'Currently blocked because All Exports is Off.',
            parentOff,
            isLast: otherEntries.length === 0,
          })}
          {otherEntries.map(([flagKey, value], index) =>
            renderFamilyFlagRow(flagKey, value, {
              roleLabel: 'Child',
              disableFromParent: parentOff,
              parentLabel: 'All Exports',
              isLast: index === otherEntries.length - 1,
            }),
          )}
        </div>
      </div>
    );
  };

  const renderOverview = () => (
    <>
      <SectionCard>
        <div style={sectionHeaderRow}>
          <div>
            <h2 style={sectionTitle}>Overview</h2>
            <p style={sectionSubtitle}>Live operational snapshot for the beta shell.</p>
          </div>
        </div>
        <div style={statsGridStyle}>
          {stats && (
            <>
              <StatTile label="Total users" value={stats.totalUsers} onClick={() => goToSection('users')} />
              <StatTile label="Registered today" value={stats.todayRegistered} onClick={() => goToSection('users')} />
              <StatTile
                label="Active today"
                value={stats.todayActive}
                onClick={() => {
                  setActivityType('');
                  setActivityQuery('');
                  setActivityDays(1);
                  goToSection('activity');
                }}
              />
              <StatTile
                label="AI calls today"
                value={stats.todayAiCalls}
                onClick={() => {
                  setActivityType('');
                  setActivityQuery('ai_');
                  setActivityDays(1);
                  goToSection('activity');
                }}
              />
              <StatTile
                label="Feedback today"
                value={stats.todayFeedback}
                onClick={() => {
                  setFeedbackCategory('');
                  setFeedbackQuery('');
                  setFeedbackDays(1);
                  goToSection('feedback');
                }}
              />
            </>
          )}
        </div>
      </SectionCard>

      <div style={twoColumnGridStyle}>
        <SectionCard>
          <div style={sectionHeaderRow}>
            <div>
              <h2 style={sectionTitle}>Recent Feedback</h2>
              <p style={sectionSubtitle}>{feedbackData.total} items in the current filter window.</p>
            </div>
            <SmallBtn label="Open" color={OCHRE} onClick={() => goToSection('feedback')} />
          </div>
          {feedbackData.feedback.slice(0, 5).map((item) => (
            <div key={item.id} style={listCardStyle}>
              <div style={metaRowStyle}>
                <Tag>{formatCategory(item.category)}</Tag>
                <span>{item.user_email || 'anonymous'}</span>
                <span>{item.source_group || '—'}</span>
                <span>{formatDateTime(item.created_at)}</span>
              </div>
              <div style={bodyTextStyle}>{item.text || '—'}</div>
            </div>
          ))}
          {feedbackData.feedback.length === 0 && <EmptyLine text="No feedback yet." />}
        </SectionCard>

        <SectionCard>
          <div style={sectionHeaderRow}>
            <div>
              <h2 style={sectionTitle}>Recent Activity</h2>
              <p style={sectionSubtitle}>{activityData.total} events in the current filter window.</p>
            </div>
            <SmallBtn label="Open" color={OCHRE} onClick={() => goToSection('activity')} />
          </div>
          {activityData.events.slice(0, 6).map((event) => (
            <div key={event.id} style={listCardStyle}>
              <div style={metaRowStyle}>
                <Tag>{event.event_type}</Tag>
                <span>{event.user_email || 'anonymous'}</span>
                <span>{event.source_group || '—'}</span>
                <span>{formatDateTime(event.created_at)}</span>
              </div>
              {event.payload && (
                <pre style={payloadStyle}>{JSON.stringify(event.payload, null, 2)}</pre>
              )}
            </div>
          ))}
          {activityData.events.length === 0 && <EmptyLine text="No activity events yet." />}
        </SectionCard>
      </div>
    </>
  );

  const renderActivity = () => (
    <SectionCard>
      <div style={sectionHeaderRow}>
        <div>
          <h2 style={sectionTitle}>Activity</h2>
          <p style={sectionSubtitle}>Recent product events, AI calls, exports, presentation launches, and client-side actions.</p>
        </div>
        <CountPill>{activityData.total} events</CountPill>
      </div>

      <div style={filtersRowStyle}>
        <select value={activityType} onChange={(e) => setActivityType(e.target.value)} style={inputStyle}>
          <option value="">All event types</option>
          {eventTypeOptions.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        <select value={String(activityDays)} onChange={(e) => setActivityDays(Number(e.target.value))} style={inputStyle}>
          <option value="1">Last 24h</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
        <input
          value={activityQuery}
          onChange={(e) => setActivityQuery(e.target.value)}
          placeholder="Search email, event type, payload..."
          style={{ ...inputStyle, minWidth: 280, flex: 1 }}
        />
      </div>

      {activityLoading && <EmptyLine text="Loading activity..." />}
      {!activityLoading && activityData.events.length === 0 && <EmptyLine text="No events match the current filters." />}
      {activityData.events.map((event) => (
        <div key={event.id} style={listCardStyle}>
          <div style={metaRowStyle}>
            <Tag>{event.event_type}</Tag>
            <span>{event.user_email || 'anonymous'}</span>
            <span>{event.source_group || '—'}</span>
            <span>{event.session_id || 'no session'}</span>
            <span>{formatDateTime(event.created_at)}</span>
          </div>
          {event.payload && (
            <pre style={payloadStyle}>{JSON.stringify(event.payload, null, 2)}</pre>
          )}
        </div>
      ))}
    </SectionCard>
  );

  const renderFeedback = () => (
    <SectionCard>
      <div style={sectionHeaderRow}>
        <div>
          <h2 style={sectionTitle}>Feedback</h2>
          <p style={sectionSubtitle}>Includes left-corner feedback widget submissions and post-generation rating feedback. Identical retries from the same session within 15 seconds are merged.</p>
        </div>
        <CountPill>{feedbackData.total} items</CountPill>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {feedbackData.categoryCounts.map((item) => (
          <Tag key={item.category}>{formatCategory(item.category)} · {item.count}</Tag>
        ))}
      </div>

      <div style={filtersRowStyle}>
        <select value={feedbackCategory} onChange={(e) => setFeedbackCategory(e.target.value)} style={inputStyle}>
          <option value="">All categories</option>
          {feedbackData.categoryCounts.map((item) => (
            <option key={item.category} value={item.category}>{formatCategory(item.category)}</option>
          ))}
        </select>
        <select value={String(feedbackDays)} onChange={(e) => setFeedbackDays(Number(e.target.value))} style={inputStyle}>
          <option value="0">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 365 days</option>
        </select>
        <input
          value={feedbackQuery}
          onChange={(e) => setFeedbackQuery(e.target.value)}
          placeholder="Search text, email, group..."
          style={{ ...inputStyle, minWidth: 280, flex: 1 }}
        />
      </div>

      {feedbackLoading && <EmptyLine text="Loading feedback..." />}
      {!feedbackLoading && feedbackData.feedback.length === 0 && <EmptyLine text="No feedback matches the current filters." />}
      {feedbackData.feedback.map((item) => (
        <div key={item.id} style={listCardStyle}>
          <div style={metaRowStyle}>
            <Tag>{formatCategory(item.category)}</Tag>
            <span>{item.user_email || 'anonymous'}</span>
            <span>{item.source_group || '—'}</span>
            <span>{item.session_id || 'no session'}</span>
            <span>{formatDateTime(item.created_at)}</span>
          </div>
          <div style={bodyTextStyle}>{item.text || '—'}</div>
        </div>
      ))}
    </SectionCard>
  );

  const renderUsers = () => (
    <SectionCard>
      <div style={sectionHeaderRow}>
        <div>
          <h2 style={sectionTitle}>Users</h2>
          <p style={sectionSubtitle}>{users.length} users currently loaded.</p>
        </div>
      </div>
      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={headerRowStyle}>
              {['Email', 'Group', 'Role', 'Status', 'AI Today', 'Registered', 'Actions'].map((header) => (
                <th key={header} style={headerCellStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(users as Array<Record<string, string | number | null>>).map((user) => (
              <tr key={user.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <td style={cellStyle}>{user.email}</td>
                <td style={cellStyle}>{user.source_group || '—'}</td>
                <td style={cellStyle}>{user.role || '—'}</td>
                <td style={cellStyle}>
                  <span style={{ color: user.status === 'banned' ? '#c0392b' : user.status === 'warned' ? '#6c7fe0' : '#5a9e6f' }}>
                    {String(user.status)}
                  </span>
                </td>
                <td style={cellStyle}>{user.ai_calls_today}</td>
                <td style={cellStyle}>{formatDateTime(user.created_at as string)}</td>
                <td style={cellStyle}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {user.status !== 'banned' && <SmallBtn label="Ban" color="#c0392b" onClick={() => handleUserAction(Number(user.id), 'ban')} />}
                    {user.status === 'banned' && <SmallBtn label="Activate" color="#5a9e6f" onClick={() => handleUserAction(Number(user.id), 'activate')} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );

  const renderInvites = () => (
    <>
      <SectionCard>
        <div style={sectionHeaderRow}>
          <div>
            <h2 style={sectionTitle}>Generate Invite Codes</h2>
            <p style={sectionSubtitle}>Create new invite batches for a source group.</p>
          </div>
        </div>
        <div style={filtersRowStyle}>
          <select value={inviteGroup} onChange={(e) => setInviteGroup(e.target.value)} style={inputStyle}>
            <option value="">Select group</option>
            {groupNames.map((group) => <option key={group} value={group}>{group}</option>)}
            <option value="__custom__">Custom…</option>
          </select>
          {inviteGroup === '__custom__' && (
            <input
              value={customGroup}
              onChange={(e) => setCustomGroup(e.target.value)}
              placeholder="Group name"
              style={inputStyle}
            />
          )}
          <input
            type="number"
            min={1}
            max={100}
            value={inviteCount}
            onChange={(e) => setInviteCount(Number(e.target.value))}
            style={{ ...inputStyle, width: 90 }}
            title="Number of codes"
          />
          <select
            value={inviteMaxUses === null ? 'unlimited' : String(inviteMaxUses)}
            onChange={(e) => setInviteMaxUses(e.target.value === 'unlimited' ? null : Number(e.target.value))}
            style={{ ...inputStyle, width: 130 }}
            title="Max uses per code"
          >
            <option value="1">1x (single)</option>
            <option value="5">5x</option>
            <option value="10">10x</option>
            <option value="50">50x</option>
            <option value="100">100x</option>
            <option value="unlimited">Unlimited</option>
          </select>
          <button onClick={handleGenerateInvites} disabled={!(inviteGroup === '__custom__' ? customGroup.trim() : inviteGroup)} style={primaryButtonStyle}>
            Generate
          </button>
        </div>
        {generatedCodes.length > 0 && (
          <div style={noticeBoxStyle}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Generated {generatedCodes.length} codes</div>
            {generatedCodes.map((code) => (
              <div key={code} style={{ fontFamily: 'monospace', color: OCHRE, padding: '2px 0' }}>{code}</div>
            ))}
            <button
              onClick={() => navigator.clipboard.writeText(generatedCodes.join('\n'))}
              style={textButtonStyle}
            >
              Copy all
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <div style={sectionHeaderRow}>
          <div>
            <h2 style={sectionTitle}>Invite Codes</h2>
            <p style={sectionSubtitle}>{usedInviteCount} used / {filteredInvites.length - usedInviteCount} unused</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {['', ...groupNames].map((group) => (
            <button
              key={group || '__all'}
              onClick={() => setInviteFilter(group)}
              style={{
                padding: '5px 14px',
                borderRadius: 999,
                fontSize: 12,
                cursor: 'pointer',
                border: `1px solid ${inviteFilter === group ? OCHRE : BORDER}`,
                background: inviteFilter === group ? `${OCHRE}14` : 'transparent',
                color: inviteFilter === group ? OCHRE : TEXT,
              }}
            >
              {group || 'All'}
            </button>
          ))}
        </div>
        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={headerRowStyle}>
                {['Code', 'Group', 'Source', 'Status', 'Used by', 'Created'].map((header) => (
                  <th key={header} style={headerCellStyle}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredInvites.length === 0 ? (
                <tr><td colSpan={6} style={{ ...cellStyle, textAlign: 'center', color: MUTED, padding: 24 }}>No invite codes yet.</td></tr>
              ) : filteredInvites.map((invite) => {
                const isMultiUse = invite.max_uses === null || (invite.max_uses ?? 1) > 1;
                const statusText = isMultiUse
                  ? `${invite.use_count ?? 0}/${invite.max_uses ?? '∞'}`
                  : (invite.used_at ? 'Used' : 'Unused');
                return (
                <tr key={invite.code} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ ...cellStyle, fontFamily: 'monospace', fontWeight: 600, color: OCHRE }}>{invite.code}</td>
                  <td style={cellStyle}>{invite.source_group}</td>
                  <td style={cellStyle}>
                    <span style={{
                      fontSize: 11, padding: '2px 6px', borderRadius: 4,
                      background: invite.created_by_user_id ? '#e8f5e9' : `${OCHRE}12`,
                      color: invite.created_by_user_id ? '#2d8a56' : OCHRE,
                      fontWeight: 600,
                    }}>
                      {invite.created_by_user_id ? 'User' : 'Admin'}
                    </span>
                  </td>
                  <td style={cellStyle}>{statusText}</td>
                  <td style={cellStyle}>{invite.used_by_email || '—'}</td>
                  <td style={cellStyle}>{formatDateTime(invite.created_at)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );

  const renderFlags = () => (
    <SectionCard>
      <div style={sectionHeaderRow}>
        <div>
          <h2 style={sectionTitle}>Feature Flags</h2>
          <p style={sectionSubtitle}>Readable controls for registration, imports, exports, and usage limits.</p>
        </div>
      </div>
      <div style={noticeBoxStyle}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>How to read this panel</div>
        <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.55 }}>
          Labels and notes below reflect the current product wiring, not just the database keys.
          Boolean switches save immediately. Numeric values stay local until you press <strong>Save</strong>.
          Already-open client tabs may need a refresh before new flag values are picked up.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 16 }}>
        {FLAG_GROUPS.map((group) => {
          const groupEntries = sortedFlagEntries.filter(([flagKey, value]) => getFlagDefinition(flagKey, value).group === group.id);
          if (groupEntries.length === 0) return null;

          const isImportGroup = group.id === 'imports';
          const isExportGroup = group.id === 'exports';
          const isCollapsed = collapsedFlagGroups[group.id];
          const offCount = groupEntries.filter(([flagKey, value]) => {
            const definition = getFlagDefinition(flagKey, value);
            const draftValue = flagDrafts[flagKey] ?? value;
            return definition.kind === 'boolean' && draftValue === 'false';
          }).length;
          const summary = offCount > 0
            ? `${groupEntries.length} settings, ${offCount} off`
            : `${groupEntries.length} settings`;

          return (
            <div key={group.id} style={flagGroupStyle}>
              <button
                type="button"
                onClick={() => toggleFlagGroup(group.id)}
                style={flagGroupHeaderButtonStyle}
              >
                <div style={flagGroupHeaderStyle}>
                  <div>
                    <h3 style={flagGroupTitleStyle}>{group.title}</h3>
                    <p style={flagGroupDescriptionStyle}>{group.description}</p>
                  </div>
                  <div style={flagGroupHeaderMetaStyle}>
                    <span style={flagGroupSummaryStyle}>{summary}</span>
                    <span
                      aria-hidden="true"
                      style={{
                        ...flagGroupChevronStyle,
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      }}
                    >
                      ▾
                    </span>
                  </div>
                </div>
              </button>

              {!isCollapsed ? (
                <div>
                  {isImportGroup
                    ? renderImportFamily(groupEntries)
                    : isExportGroup
                      ? renderExportFamily(groupEntries)
                      : renderStandardFlagList(groupEntries)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );

  const renderCaps = () => (
    <SectionCard>
      <div style={sectionHeaderRow}>
        <div>
          <h2 style={sectionTitle}>Groups & Caps</h2>
          <p style={sectionSubtitle}>Capacity and invite limits per group.</p>
        </div>
      </div>

      <div style={tableWrapStyle}>
        <table style={tableStyle}>
          <thead>
            <tr style={headerRowStyle}>
              {['Group', 'Max Users', 'Current', 'Invites/User', 'Actions'].map((header) => (
                <th key={header} style={headerCellStyle}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {caps.length === 0 ? (
              <tr><td colSpan={5} style={{ ...cellStyle, textAlign: 'center', color: MUTED, padding: 24 }}>No groups yet.</td></tr>
            ) : caps.map((cap) => (
              <tr key={cap.group_name} style={{ borderBottom: `1px solid ${BORDER}` }}>
                {editingCap?.group_name === cap.group_name ? (
                  <>
                    <td style={cellStyle}><strong>{cap.group_name}</strong></td>
                    <td style={cellStyle}><input type="number" value={editMax} onChange={(e) => setEditMax(Number(e.target.value))} style={{ ...inputStyle, width: 90 }} /></td>
                    <td style={cellStyle}>{cap.current_users}</td>
                    <td style={cellStyle}><input type="number" value={editChildInvites} onChange={(e) => setEditChildInvites(Number(e.target.value))} style={{ ...inputStyle, width: 90 }} /></td>
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <SmallBtn label="Save" color="#5a9e6f" onClick={() => handleUpsertCap(cap.group_name, editMax, editChildInvites)} />
                        <SmallBtn label="Cancel" color={MUTED} onClick={() => setEditingCap(null)} />
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={cellStyle}><strong>{cap.group_name}</strong></td>
                    <td style={cellStyle}>{cap.max_users}</td>
                    <td style={cellStyle}>
                      <span style={{ color: cap.current_users >= cap.max_users ? '#c0392b' : '#5a9e6f' }}>{cap.current_users}</span>
                    </td>
                    <td style={cellStyle}>{cap.max_child_invites_per_user}</td>
                    <td style={cellStyle}>
                      <SmallBtn
                        label="Edit"
                        color={OCHRE}
                        onClick={() => {
                          setEditingCap(cap);
                          setEditMax(cap.max_users);
                          setEditChildInvites(cap.max_child_invites_per_user);
                        }}
                      />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, color: TEXT }}>Create group</h3>
        <div style={filtersRowStyle}>
          <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="group-name" style={inputStyle} />
          <input type="number" value={newGroupMax} onChange={(e) => setNewGroupMax(Number(e.target.value))} placeholder="Max users" style={{ ...inputStyle, width: 110 }} />
          <input type="number" value={newGroupChildInvites} onChange={(e) => setNewGroupChildInvites(Number(e.target.value))} placeholder="Invites/user" style={{ ...inputStyle, width: 120 }} />
          <button
            onClick={() => {
              if (newGroupName.trim()) {
                void handleUpsertCap(newGroupName.trim(), newGroupMax, newGroupChildInvites);
              }
            }}
            disabled={!newGroupName.trim()}
            style={primaryButtonStyle}
          >
            Create
          </button>
        </div>
      </div>
    </SectionCard>
  );

  let content: ReactNode;
  switch (activeSection) {
    case 'overview':
      content = renderOverview();
      break;
    case 'activity':
      content = renderActivity();
      break;
    case 'feedback':
      content = renderFeedback();
      break;
    case 'users':
      content = renderUsers();
      break;
    case 'invites':
      content = renderInvites();
      break;
    case 'flags':
      content = renderFlags();
      break;
    case 'caps':
      content = renderCaps();
      break;
  }

  return (
    <div style={containerStyle}>
      <div style={shellStyle}>
        <aside style={sidebarStyle}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Lasca Admin</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: TEXT }}>Operations</div>
          </div>

          <SidebarButton label="Overview" active={activeSection === 'overview'} onClick={() => goToSection('overview')} />
          <SidebarButton label="Activity" badge={activityData.total} active={activeSection === 'activity'} onClick={() => goToSection('activity')} />
          <SidebarButton label="Feedback" badge={stats?.todayFeedback} active={activeSection === 'feedback'} onClick={() => goToSection('feedback')} />
          <SidebarButton label="Users" badge={users.length} active={activeSection === 'users'} onClick={() => goToSection('users')} />
          <SidebarButton label="Invites" badge={invites.length} active={activeSection === 'invites'} onClick={() => goToSection('invites')} />
          <SidebarButton label="Feature Flags" badge={Object.keys(flags).length} active={activeSection === 'flags'} onClick={() => goToSection('flags')} />
          <SidebarButton label="Caps" badge={caps.length} active={activeSection === 'caps'} onClick={() => goToSection('caps')} />

          <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Signals</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <SignalRow label="AI calls today" value={stats?.todayAiCalls ?? 0} />
              <SignalRow label="Active today" value={stats?.todayActive ?? 0} />
            </div>
          </div>
        </aside>

        <main style={mainStyle}>
          {mockMode ? (
            <div style={{ ...noticeBoxStyle, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Local Preview Mode</div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.55 }}>
                This local admin shell is using simulated data so you can review UI and UX without database or admin secrets.
                Toggle states and numeric saves are interactive, but they stay in memory only.
              </div>
            </div>
          ) : null}
          {content}
        </main>
      </div>
    </div>
  );
}

function SidebarButton({ label, badge, active, onClick }: {
  label: string;
  badge?: string | number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        marginBottom: 6,
        borderRadius: 14,
        border: active ? `1px solid rgba(255,255,255,0.52)` : `1px solid transparent`,
        background: active
          ? 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(91,124,255,0.10) 100%)'
          : 'transparent',
        color: active ? OCHRE : TEXT,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        boxShadow: active ? GLASS_INSET : 'none',
        backdropFilter: active ? 'blur(12px)' : undefined,
        WebkitBackdropFilter: active ? 'blur(12px)' : undefined,
      }}
    >
      <span>{label}</span>
      {badge !== undefined && <CountPill>{badge}</CountPill>}
    </button>
  );
}

function SignalRow({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: TEXT }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SectionCard({ children }: { children: ReactNode }) {
  return <section style={sectionCardStyle}>{children}</section>;
}

function BehaviorBadge({ behavior }: { behavior: FlagBehavior }) {
  const background =
    behavior === 'live' ? '#e7f5eb'
      : behavior === 'partial' ? '#edf2ff'
        : behavior === 'stored' ? '#eef3fb'
          : '#f2f6fb';
  const color =
    behavior === 'live' ? '#2f7a4c'
      : behavior === 'partial' ? '#5a74c6'
        : behavior === 'stored' ? '#6b7895'
          : MUTED;

  return (
    <span
      style={{
        padding: '4px 10px',
        borderRadius: 999,
        background: `linear-gradient(180deg, rgba(255,255,255,0.42) 0%, ${background} 100%)`,
        border: `1px solid ${GLASS_BORDER_SOFT}`,
        color,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        boxShadow: GLASS_INSET,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {getBehaviorLabel(behavior)}
    </span>
  );
}

function AppleSwitch({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? 'Turn off' : 'Turn on'}
      onClick={() => onToggle(!checked)}
      disabled={disabled}
      style={{
        width: 52,
        height: 32,
        borderRadius: 999,
        border: `1px solid ${checked ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.52)'}`,
        padding: 3,
        background: checked
          ? 'linear-gradient(180deg, #51d97d 0%, #2fbe62 100%)'
          : 'linear-gradient(180deg, rgba(255,255,255,0.52) 0%, rgba(214,225,242,0.72) 100%)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'background 160ms ease, box-shadow 160ms ease',
        display: 'inline-flex',
        alignItems: 'center',
        boxShadow: checked
          ? 'inset 0 1px 0 rgba(255,255,255,0.26), 0 10px 22px rgba(62, 174, 96, 0.22)'
          : 'inset 0 1px 0 rgba(255,255,255,0.65), 0 8px 18px rgba(66, 84, 122, 0.10)',
        backdropFilter: GLASS_BLUR,
        WebkitBackdropFilter: GLASS_BLUR,
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(239,245,255,0.92) 100%)',
          boxShadow: '0 3px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.95)',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transition: 'transform 160ms ease',
        }}
      />
    </button>
  );
}

function SmallBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 11px',
        fontSize: 11,
        fontWeight: 700,
        border: `1px solid ${GLASS_BORDER_SOFT}`,
        borderRadius: 999,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(238,245,255,0.14) 100%)',
        color,
        cursor: 'pointer',
        boxShadow: GLASS_INSET,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {label}
    </button>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 9px',
      borderRadius: 999,
      background: 'linear-gradient(180deg, rgba(255,255,255,0.54) 0%, rgba(91,124,255,0.14) 100%)',
      border: `1px solid ${GLASS_BORDER_SOFT}`,
      color: OCHRE,
      fontSize: 11,
      fontWeight: 700,
      boxShadow: GLASS_INSET,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      {children}
    </span>
  );
}

function CountPill({ children }: { children: ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 26,
      height: 22,
      padding: '0 9px',
      borderRadius: 999,
      background: 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(226,234,248,0.32) 100%)',
      border: `1px solid ${GLASS_BORDER_SOFT}`,
      color: TEXT,
      fontSize: 11,
      fontWeight: 700,
      boxShadow: GLASS_INSET,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      {children}
    </span>
  );
}

function StatTile({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
  const card = (
    <>
      <div style={{ fontSize: 28, fontWeight: 800, color: OCHRE }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{label}</div>
    </>
  );

  if (!onClick) {
    return <div style={statTileStyle}>{card}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...statTileStyle,
        cursor: 'pointer',
        textAlign: 'left',
        border: `1px solid ${BORDER}`,
      }}
    >
      {card}
    </button>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div style={{ color: MUTED, fontSize: 13, padding: '12px 0' }}>{text}</div>;
}

const containerStyle: CSSProperties = {
  height: '100%',
  overflowY: 'auto',
  backgroundColor: BG,
  backgroundImage: `
    radial-gradient(circle at 12% 8%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0) 28%),
    radial-gradient(circle at 88% 10%, rgba(91,124,255,0.16) 0%, rgba(91,124,255,0) 24%),
    radial-gradient(circle at 54% 100%, rgba(226,236,255,0.92) 0%, rgba(226,236,255,0) 34%),
    linear-gradient(180deg, #eef4fd 0%, #dfe8f7 100%)
  `,
  padding: 24,
};

const shellStyle: CSSProperties = {
  maxWidth: 1320,
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: '250px minmax(0, 1fr)',
  gap: 20,
  alignItems: 'start',
};

const sidebarStyle: CSSProperties = {
  position: 'sticky',
  top: 24,
  background: `linear-gradient(180deg, ${GLASS_SURFACE} 0%, ${GLASS_SURFACE_WARM} 100%)`,
  border: `1px solid ${GLASS_BORDER}`,
  borderRadius: 22,
  padding: 16,
  boxShadow: `${GLASS_INSET}, ${GLASS_SHADOW}`,
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
};

const mainStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  minWidth: 0,
};

const sectionCardStyle: CSSProperties = {
  background: `linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(237,244,255,0.18) 100%)`,
  border: `1px solid ${GLASS_BORDER}`,
  borderRadius: 24,
  padding: 20,
  boxShadow: `${GLASS_INSET}, ${GLASS_SHADOW}`,
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
};

const emptyStateStyle: CSSProperties = {
  maxWidth: 480,
  margin: '80px auto',
  padding: '28px 32px',
  background: `linear-gradient(180deg, rgba(255,255,255,0.38) 0%, rgba(238,245,255,0.20) 100%)`,
  border: `1px solid ${GLASS_BORDER}`,
  borderRadius: 24,
  color: TEXT,
  textAlign: 'center',
  boxShadow: `${GLASS_INSET}, ${GLASS_SHADOW}`,
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
};

const sectionHeaderRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  marginBottom: 16,
};

const sectionTitle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  color: TEXT,
};

const sectionSubtitle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 13,
  color: MUTED,
};

const statsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 14,
};

const statTileStyle: CSSProperties = {
  border: `1px solid ${GLASS_BORDER_SOFT}`,
  borderRadius: 18,
  padding: '16px 18px',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(236,243,253,0.16) 100%)',
  boxShadow: GLASS_INSET,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

const twoColumnGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  gap: 20,
};

const filtersRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  alignItems: 'center',
  marginBottom: 14,
};

const inputStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 12,
  border: `1px solid ${GLASS_BORDER_SOFT}`,
  fontSize: 13,
  color: TEXT,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(236,243,253,0.18) 100%)',
  boxShadow: GLASS_INSET,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

const tableWrapStyle: CSSProperties = {
  overflowX: 'auto',
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
};

const headerRowStyle: CSSProperties = {
  borderBottom: `2px solid ${BORDER}`,
};

const headerCellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  color: MUTED,
  fontWeight: 700,
};

const cellStyle: CSSProperties = {
  padding: '10px',
  color: TEXT,
};

const listCardStyle: CSSProperties = {
  border: `1px solid ${GLASS_BORDER_SOFT}`,
  borderRadius: 16,
  padding: 14,
  marginBottom: 12,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(240,246,255,0.16) 100%)',
  boxShadow: GLASS_INSET,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

const metaRowStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center',
  fontSize: 12,
  color: MUTED,
  marginBottom: 10,
};

const bodyTextStyle: CSSProperties = {
  fontSize: 14,
  color: TEXT,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
};

const payloadStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 12,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(232,239,249,0.20) 100%)',
  border: `1px solid ${GLASS_BORDER_SOFT}`,
  color: TEXT,
  fontSize: 12,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
  boxShadow: GLASS_INSET,
};

const flagGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 18,
  border: `1px solid ${GLASS_BORDER}`,
  borderRadius: 24,
  background: `
    radial-gradient(circle at top left, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 32%),
    linear-gradient(180deg, rgba(255,255,255,0.24) 0%, rgba(233,240,251,0.12) 100%)
  `,
  boxShadow: `${GLASS_INSET}, ${GLASS_SHADOW}`,
  backdropFilter: 'blur(18px) saturate(140%)',
  WebkitBackdropFilter: 'blur(18px) saturate(140%)',
};

const flagGroupHeaderButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  border: 'none',
  padding: 0,
  background: 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
};

const flagGroupHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  paddingBottom: 14,
  borderBottom: `1px solid rgba(255,255,255,0.24)`,
};

const flagGroupHeaderMetaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexShrink: 0,
  paddingTop: 2,
};

const flagGroupSummaryStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: MUTED,
  whiteSpace: 'nowrap',
};

const flagGroupChevronStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  color: MUTED,
  fontSize: 14,
  lineHeight: 1,
  transition: 'transform 160ms ease',
};

const flagGroupTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: -0.2,
  color: TEXT,
};

const flagGroupDescriptionStyle: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 13,
  color: MUTED,
};

const flagFamilyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const flagWarningTextStyle: CSSProperties = {
  color: '#5a74c6',
  fontWeight: 600,
};

const settingSectionLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: MUTED,
  paddingLeft: 2,
};

const settingFamilyNoteStyle: CSSProperties = {
  marginTop: -6,
  fontSize: 12,
  color: MUTED,
  lineHeight: 1.5,
};

const settingListStyle: CSSProperties = {
  border: `1px solid ${GLASS_BORDER_SOFT}`,
  borderRadius: 20,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(239,245,255,0.12) 100%)',
  overflow: 'hidden',
  boxShadow: GLASS_INSET,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

const settingRowStyle: CSSProperties = {
  padding: '16px 18px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 18,
  flexWrap: 'wrap',
};

const settingMasterRowStyle: CSSProperties = {
  padding: '22px 22px',
  gap: 24,
};

const settingRowMainStyle: CSSProperties = {
  minWidth: 0,
  flex: '1 1 320px',
};

const settingRowTitleLineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginBottom: 6,
};

const settingMasterTitleLineStyle: CSSProperties = {
  gap: 10,
  marginBottom: 10,
};

const settingRowTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: TEXT,
};

const settingMasterTitleStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: -0.2,
};

const settingMasterPillStyle: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 999,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(91,124,255,0.10) 100%)',
  border: `1px solid rgba(255,255,255,0.42)`,
  color: OCHRE,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.2,
  textTransform: 'uppercase',
  boxShadow: GLASS_INSET,
};

const settingChildPillStyle: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 999,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(231,238,249,0.18) 100%)',
  border: `1px solid ${GLASS_BORDER_SOFT}`,
  color: MUTED,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.2,
  textTransform: 'uppercase',
  boxShadow: GLASS_INSET,
};

const settingInheritedPillStyle: CSSProperties = {
  ...settingChildPillStyle,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(223,233,248,0.20) 100%)',
};

const settingRowDescriptionStyle: CSSProperties = {
  fontSize: 13,
  color: TEXT,
  lineHeight: 1.5,
};

const settingMasterDescriptionStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
};

const settingRowMetaStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  marginTop: 8,
};

const settingMetaTextStyle: CSSProperties = {
  fontSize: 12,
  color: MUTED,
};

const settingKeyChipStyle: CSSProperties = {
  fontSize: 11,
  color: MUTED,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(231,238,249,0.18) 100%)',
  border: `1px solid ${GLASS_BORDER_SOFT}`,
  borderRadius: 999,
  padding: '4px 8px',
  boxShadow: GLASS_INSET,
};

const settingRowFooterStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  lineHeight: 1.45,
};

const settingRowControlStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flex: '0 0 auto',
};

const settingSwitchWrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const settingSwitchStateStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: MUTED,
  minWidth: 24,
  textAlign: 'right',
};

const settingNumberControlStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const settingNumberFieldStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 10px 0 0',
  borderRadius: 12,
  border: `1px solid ${GLASS_BORDER_SOFT}`,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(237,244,254,0.18) 100%)',
  boxShadow: GLASS_INSET,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

const settingNumberInputStyle: CSSProperties = {
  width: 88,
  padding: '9px 12px',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 13,
  color: TEXT,
  textAlign: 'right',
};

const settingUnitLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: MUTED,
};

const settingInlineSaveStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: `1px solid rgba(91,124,255,0.40)`,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.30) 0%, rgba(237,243,255,0.12) 100%)',
  color: OCHRE,
  fontSize: 12,
  fontWeight: 700,
  boxShadow: GLASS_INSET,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

const flagPendingTextStyle: CSSProperties = {
  color: OCHRE,
  fontWeight: 600,
};

const flagErrorTextStyle: CSSProperties = {
  color: '#c0392b',
  fontWeight: 600,
};

const flagDirtyTextStyle: CSSProperties = {
  color: '#5a74c6',
  fontWeight: 600,
};

const flagSavedTextStyle: CSSProperties = {
  color: '#2f7a4c',
  fontWeight: 600,
};

const flagMutedTextStyle: CSSProperties = {
  color: MUTED,
};

const primaryButtonStyle: CSSProperties = {
  padding: '8px 16px',
  borderRadius: 12,
  border: `1px solid rgba(255,255,255,0.28)`,
  background: 'linear-gradient(180deg, #7e9cff 0%, #5b7cff 100%)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 10px 24px rgba(91,124,255,0.22)',
};

const textButtonStyle: CSSProperties = {
  marginTop: 10,
  background: 'none',
  border: 'none',
  color: OCHRE,
  fontSize: 12,
  cursor: 'pointer',
  padding: 0,
};

const noticeBoxStyle: CSSProperties = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(238,245,255,0.10) 100%)',
  border: `1px solid rgba(255,255,255,0.42)`,
  boxShadow: GLASS_INSET,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
};

export default function AdminPage() {
  return <Suspense><AdminDashboard /></Suspense>;
}
