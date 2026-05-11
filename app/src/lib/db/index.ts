/**
 * Lasca Database Layer
 */

import { sql } from './client';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = 'LASCA-';
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export interface DbUser {
  id: number;
  email: string;
  display_name: string | null;
  status: 'active' | 'warned' | 'banned';
  invite_code_used: string;
  login_code: string | null;
  source_group: string | null;
  referrer_user_id: number | null;
  google_sub: string | null;
  session_expires_at: Date;
  current_tool: string[] | null;
  use_case: string[] | null;
  role: string | null;
  pain_point: string | null;
  ai_calls_today: number;
  ai_calls_reset_at: Date;
  last_active_at: Date | null;
  created_at: Date;
}

/** Sentinel value stored in users.invite_code_used for OAuth-created users
 *  (the column is NOT NULL; OAuth path doesn't go through an invite). */
export const GOOGLE_OAUTH_SENTINEL = 'GOOGLE_OAUTH';

export interface DbInvite {
  id: number;
  code: string;
  source_group: string;
  created_by_user_id: number | null;
  used_by_user_id: number | null;
  cap_group: string | null;
  max_uses: number | null;   // null = unlimited, 1 = one-time (default)
  use_count: number;
  used_at: Date | null;
  created_at: Date;
}

export interface DbCap {
  group_name: string;
  max_users: number;
  current_users: number;
  max_child_invites_per_user: number;
  updated_at: Date;
}

export interface DbFeedbackEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  source_group: string | null;
  session_id: string | null;
  category: string | null;
  text: string | null;
  created_at: Date;
}

export interface DbFeedbackCategoryCount {
  category: string;
  count: number;
}

export interface DbEventEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  source_group: string | null;
  session_id: string | null;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Invite operations
// ---------------------------------------------------------------------------

export async function validateInvite(code: string): Promise<DbInvite | null> {
  const { rows } = await sql<DbInvite>`
    SELECT * FROM invites
    WHERE code = ${code}
      AND (max_uses IS NULL OR use_count < max_uses)
  `;
  return rows[0] ?? null;
}

export async function markInviteUsed(code: string, userId: number): Promise<void> {
  await sql`
    UPDATE invites
    SET use_count = use_count + 1, used_by_user_id = ${userId}, used_at = NOW()
    WHERE code = ${code}
  `;
}

export async function generateInviteCodes(
  createdByUserId: number | null,
  sourceGroup: string,
  count: number,
  maxUses: number | null = 1,
): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateCode();
      try {
        await sql`
          INSERT INTO invites (code, source_group, created_by_user_id, cap_group, max_uses)
          VALUES (${code}, ${sourceGroup}, ${createdByUserId}, ${sourceGroup}, ${maxUses})
        `;
        codes.push(code);
        break;
      } catch {
        if (attempt === 2) throw new Error('Failed to generate unique invite code');
      }
    }
  }
  return codes;
}

export async function listInvites(group?: string): Promise<(DbInvite & { used_by_email?: string; created_by_email?: string })[]> {
  if (group) {
    const { rows } = await sql`
      SELECT i.*, u.email as used_by_email, c.email as created_by_email
      FROM invites i
      LEFT JOIN users u ON i.used_by_user_id = u.id
      LEFT JOIN users c ON i.created_by_user_id = c.id
      WHERE i.source_group = ${group}
      ORDER BY i.created_at DESC
      LIMIT 500
    `;
    return rows as (DbInvite & { used_by_email?: string; created_by_email?: string })[];
  }
  const { rows } = await sql`
    SELECT i.*, u.email as used_by_email, c.email as created_by_email
    FROM invites i
    LEFT JOIN users u ON i.used_by_user_id = u.id
    LEFT JOIN users c ON i.created_by_user_id = c.id
    ORDER BY i.created_at DESC
    LIMIT 500
  `;
  return rows as (DbInvite & { used_by_email?: string; created_by_email?: string })[];
}

export async function getMyInviteCodes(userId: number): Promise<(DbInvite & { used_by_email?: string })[]> {
  const { rows } = await sql`
    SELECT i.*, u.email as used_by_email
    FROM invites i
    LEFT JOIN users u ON i.used_by_user_id = u.id
    WHERE i.created_by_user_id = ${userId}
    ORDER BY i.created_at DESC
  `;
  return rows as (DbInvite & { used_by_email?: string })[];
}

export async function countUserInvites(userId: number): Promise<number> {
  const { rows } = await sql`SELECT COUNT(*) as count FROM invites WHERE created_by_user_id = ${userId}`;
  return Number(rows[0].count);
}

// ---------------------------------------------------------------------------
// User operations
// ---------------------------------------------------------------------------

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const { rows } = await sql<DbUser>`SELECT * FROM users WHERE email = ${email}`;
  return rows[0] ?? null;
}

export async function getUserById(id: number): Promise<DbUser | null> {
  const { rows } = await sql<DbUser>`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ?? null;
}

export async function getUserByGoogleSub(sub: string): Promise<DbUser | null> {
  const { rows } = await sql<DbUser>`SELECT * FROM users WHERE google_sub = ${sub}`;
  return rows[0] ?? null;
}

/** Backfill google_sub on a user that originally registered via invite code
 *  but is now logging in with Google using the same email. Idempotent. */
export async function linkGoogleSub(userId: number, sub: string): Promise<void> {
  await sql`UPDATE users SET google_sub = ${sub} WHERE id = ${userId} AND google_sub IS NULL`;
}

/** Insert a brand-new user via Google OAuth. invite_code_used carries the
 *  GOOGLE_OAUTH sentinel so the NOT NULL constraint is satisfied without
 *  consuming a real invite code. */
export async function registerUserViaGoogle(params: {
  email: string;
  name: string | null;
  googleSub: string;
}): Promise<DbUser> {
  const { email, name, googleSub } = params;
  const { rows } = await sql<DbUser>`
    INSERT INTO users (
      email, display_name, invite_code_used, google_sub, source_group,
      session_expires_at
    ) VALUES (
      ${email}, ${name}, ${GOOGLE_OAUTH_SENTINEL}, ${googleSub}, 'google_oauth',
      NOW() + INTERVAL '7 days'
    ) RETURNING *
  `;
  return rows[0];
}

export async function registerUser(params: {
  email: string;
  code: string;
  sourceGroup: string;
  referrerUserId: number | null;
  survey: { currentTool?: string[]; useCase?: string[]; role?: string; painPoint?: string };
}): Promise<DbUser> {
  const { email, code, sourceGroup, referrerUserId, survey } = params;
  const loginCode = `LASCA-L${generateCode().slice(6)}`;  // LASCA-LXXXXX format
  const currentToolStr = survey.currentTool ? `{${survey.currentTool.join(',')}}` : null;
  const useCaseStr = survey.useCase ? `{${survey.useCase.join(',')}}` : null;
  const { rows } = await sql<DbUser>`
    INSERT INTO users (
      email, invite_code_used, login_code, source_group, referrer_user_id,
      session_expires_at, current_tool, use_case, role, pain_point
    ) VALUES (
      ${email}, ${code}, ${loginCode}, ${sourceGroup}, ${referrerUserId},
      NOW() + INTERVAL '7 days',
      ${currentToolStr}::text[], ${useCaseStr}::text[],
      ${survey.role ?? null}, ${survey.painPoint ?? null}
    ) RETURNING *
  `;
  return rows[0];
}

export async function updateUserStatus(id: number, status: 'active' | 'warned' | 'banned'): Promise<void> {
  await sql`UPDATE users SET status = ${status} WHERE id = ${id}`;
}

export async function touchLastActive(id: number): Promise<void> {
  await sql`UPDATE users SET last_active_at = NOW() WHERE id = ${id}`;
}

// ---------------------------------------------------------------------------
// Session renewal
// ---------------------------------------------------------------------------

export async function renewSession(userId: number): Promise<void> {
  await sql`UPDATE users SET session_expires_at = NOW() + INTERVAL '7 days' WHERE id = ${userId}`;
}

// ---------------------------------------------------------------------------
// AI call tracking
// ---------------------------------------------------------------------------

export async function checkAndIncrementAiCalls(userId: number): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  await sql`UPDATE users SET ai_calls_today = 0, ai_calls_reset_at = NOW() WHERE id = ${userId} AND ai_calls_reset_at < NOW() - INTERVAL '24 hours'`;
  const { rows: flagRows } = await sql`SELECT value FROM feature_flags WHERE key = 'ai_daily_limit'`;
  const limit = Number(flagRows[0]?.value ?? '30');
  const { rows } = await sql<Pick<DbUser, 'ai_calls_today' | 'ai_calls_reset_at'>>`
    SELECT ai_calls_today, ai_calls_reset_at FROM users WHERE id = ${userId}
  `;
  const user = rows[0];
  if (!user) return { allowed: false, remaining: 0, resetAt: new Date() };
  if (user.ai_calls_today >= limit) return { allowed: false, remaining: 0, resetAt: user.ai_calls_reset_at };
  await sql`UPDATE users SET ai_calls_today = ai_calls_today + 1 WHERE id = ${userId}`;
  return { allowed: true, remaining: limit - user.ai_calls_today - 1, resetAt: user.ai_calls_reset_at };
}

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

export async function getCapStatus(group: string): Promise<{ current: number; max: number; maxChildInvites: number } | null> {
  const { rows } = await sql`SELECT * FROM caps WHERE group_name = ${group}`;
  if (!rows[0]) return null;
  return { current: rows[0].current_users as number, max: rows[0].max_users as number, maxChildInvites: rows[0].max_child_invites_per_user as number };
}

export async function incrementCap(group: string): Promise<void> {
  await sql`UPDATE caps SET current_users = current_users + 1 WHERE group_name = ${group}`;
}

export async function listCaps(): Promise<DbCap[]> {
  const { rows } = await sql<DbCap>`SELECT * FROM caps ORDER BY group_name`;
  return rows;
}

export async function upsertCap(groupName: string, maxUsers: number, maxChildInvites: number): Promise<void> {
  await sql`
    INSERT INTO caps (group_name, max_users, max_child_invites_per_user)
    VALUES (${groupName}, ${maxUsers}, ${maxChildInvites})
    ON CONFLICT (group_name) DO UPDATE SET
      max_users = ${maxUsers},
      max_child_invites_per_user = ${maxChildInvites},
      updated_at = NOW()
  `;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export async function getFlags(): Promise<Record<string, string>> {
  const { rows } = await sql`SELECT key, value FROM feature_flags`;
  const flags: Record<string, string> = {};
  for (const row of rows) flags[row.key as string] = row.value as string;
  return flags;
}

export async function setFlag(key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO feature_flags (key, value, updated_at) VALUES (${key}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = NOW()
  `;
}

// ---------------------------------------------------------------------------
// Events / logging
// ---------------------------------------------------------------------------

export async function logEvent(userId: number | null, sessionId: string | null, eventType: string, payload?: Record<string, unknown>): Promise<void> {
  const payloadJson = payload ? JSON.stringify(payload) : null;
  await sql`INSERT INTO events (user_id, session_id, event_type, payload) VALUES (${userId}, ${sessionId}, ${eventType}, ${payloadJson}::jsonb)`;
}

export async function logEventsBatch(events: Array<{ userId: number | null; sessionId: string | null; eventType: string; payload?: Record<string, unknown> }>): Promise<void> {
  for (const e of events) await logEvent(e.userId, e.sessionId, e.eventType, e.payload);
}

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

export async function getAdminStats(): Promise<{ totalUsers: number; todayRegistered: number; todayActive: number; todayAiCalls: number; todayFeedback: number }> {
  const dedupedFeedback = sql.query<{ c: number }>(
    `
      WITH feedback_base AS (
        SELECT
          e.created_at,
          LAG(e.created_at) OVER (
            PARTITION BY
              COALESCE(e.user_id::text, CONCAT('session:', COALESCE(e.session_id, 'anonymous'))),
              COALESCE(NULLIF(e.payload->>'category', ''), 'other'),
              COALESCE(NULLIF(e.payload->>'text', ''), '')
            ORDER BY e.created_at
          ) AS prev_created_at
        FROM events e
        WHERE e.event_type = 'feedback'
          AND e.created_at > NOW() - INTERVAL '24 hours'
      )
      SELECT COUNT(*)::int AS c
      FROM feedback_base
      WHERE prev_created_at IS NULL OR created_at - prev_created_at > INTERVAL '15 seconds'
    `,
  );

  const [total, registered, active, aiCalls, feedback] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM users`,
    sql`SELECT COUNT(*) as c FROM users WHERE created_at > NOW() - INTERVAL '24 hours'`,
    sql`SELECT COUNT(*) as c FROM users WHERE last_active_at > NOW() - INTERVAL '24 hours'`,
    sql`
      SELECT COUNT(*) as c
      FROM events
      WHERE event_type IN ('ai_generate', 'ai_edit', 'ai_polish')
        AND created_at > NOW() - INTERVAL '24 hours'
    `,
    dedupedFeedback,
  ]);
  return {
    totalUsers: Number(total.rows[0].c),
    todayRegistered: Number(registered.rows[0].c),
    todayActive: Number(active.rows[0].c),
    todayAiCalls: Number(aiCalls.rows[0].c),
    todayFeedback: Number(feedback.rows[0].c),
  };
}

export async function listUsers(page = 1, pageSize = 50): Promise<{ users: DbUser[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [{ rows: users }, { rows: countRows }] = await Promise.all([
    sql<DbUser>`SELECT * FROM users ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
    sql`SELECT COUNT(*) as c FROM users`,
  ]);
  return { users, total: Number(countRows[0].c) };
}

export async function listFeedback(params?: {
  page?: number;
  pageSize?: number;
  category?: string;
  q?: string;
  days?: number;
}): Promise<{ feedback: DbFeedbackEntry[]; total: number; categoryCounts: DbFeedbackCategoryCount[] }> {
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, params?.pageSize ?? 100));
  const offset = (page - 1) * pageSize;
  const category = params?.category?.trim();
  const q = params?.q?.trim();
  const days = params?.days && params.days > 0 ? Math.min(params.days, 365) : null;

  const buildWhere = (includeCategory: boolean) => {
    const values: Array<string | number> = [];
    const conditions = [`e.event_type = 'feedback'`];

    if (includeCategory && category) {
      values.push(category);
      conditions.push(`COALESCE(NULLIF(e.payload->>'category', ''), 'other') = $${values.length}`);
    }

    if (q) {
      values.push(`%${q}%`);
      conditions.push(
        `(
          COALESCE(e.payload->>'text', '') ILIKE $${values.length}
          OR COALESCE(u.email, '') ILIKE $${values.length}
          OR COALESCE(u.source_group, '') ILIKE $${values.length}
        )`,
      );
    }

    if (days) {
      values.push(days);
      conditions.push(`e.created_at > NOW() - ($${values.length} * INTERVAL '1 day')`);
    }

    return {
      whereSql: conditions.join(' AND '),
      values,
    };
  };

  const filtered = buildWhere(true);
  const dedupedFeedbackCte = `
    WITH feedback_base AS (
      SELECT
        e.id,
        e.user_id,
        u.email AS user_email,
        u.source_group,
        e.session_id,
        NULLIF(e.payload->>'category', '') AS category,
        NULLIF(e.payload->>'text', '') AS text,
        e.created_at,
        LAG(e.created_at) OVER (
          PARTITION BY
            COALESCE(e.user_id::text, CONCAT('session:', COALESCE(e.session_id, 'anonymous'))),
            COALESCE(NULLIF(e.payload->>'category', ''), 'other'),
            COALESCE(NULLIF(e.payload->>'text', ''), '')
          ORDER BY e.created_at
        ) AS prev_created_at
      FROM events e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE ${filtered.whereSql}
    ),
    feedback_deduped AS (
      SELECT id, user_id, user_email, source_group, session_id, category, text, created_at
      FROM feedback_base
      WHERE prev_created_at IS NULL OR created_at - prev_created_at > INTERVAL '15 seconds'
    )
  `;

  const countResult = await sql.query<{ count: number }>(
    `
      ${dedupedFeedbackCte}
      SELECT COUNT(*)::int AS count
      FROM feedback_deduped
    `,
    filtered.values,
  );

  const listValues = [...filtered.values, pageSize, offset];
  const feedbackResult = await sql.query<DbFeedbackEntry>(
    `
      ${dedupedFeedbackCte}
      SELECT
        id,
        user_id,
        user_email,
        source_group,
        session_id,
        category,
        text,
        created_at
      FROM feedback_deduped
      ORDER BY created_at DESC
      LIMIT $${listValues.length - 1}
      OFFSET $${listValues.length}
    `,
    listValues,
  );

  const categoryFiltered = buildWhere(false);
  const dedupedCategoryFeedbackCte = `
    WITH feedback_base AS (
      SELECT
        NULLIF(e.payload->>'category', '') AS category,
        NULLIF(e.payload->>'text', '') AS text,
        e.user_id,
        e.created_at,
        LAG(e.created_at) OVER (
          PARTITION BY
            COALESCE(e.user_id::text, CONCAT('session:', COALESCE(e.session_id, 'anonymous'))),
            COALESCE(NULLIF(e.payload->>'category', ''), 'other'),
            COALESCE(NULLIF(e.payload->>'text', ''), '')
          ORDER BY e.created_at
        ) AS prev_created_at
      FROM events e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE ${categoryFiltered.whereSql}
    ),
    feedback_deduped AS (
      SELECT category
      FROM feedback_base
      WHERE prev_created_at IS NULL OR created_at - prev_created_at > INTERVAL '15 seconds'
    )
  `;
  const categoryResult = await sql.query<DbFeedbackCategoryCount>(
    `
      ${dedupedCategoryFeedbackCte}
      SELECT
        COALESCE(category, 'other') AS category,
        COUNT(*)::int AS count
      FROM feedback_deduped
      GROUP BY 1
      ORDER BY count DESC, category ASC
    `,
    categoryFiltered.values,
  );

  return {
    feedback: feedbackResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
    categoryCounts: categoryResult.rows.map(row => ({
      category: row.category,
      count: Number(row.count),
    })),
  };
}

export async function listEvents(params?: {
  type?: string;
  q?: string;
  days?: number;
  limit?: number;
}): Promise<{ events: DbEventEntry[]; total: number }> {
  const type = params?.type?.trim();
  const q = params?.q?.trim();
  const days = params?.days && params.days > 0 ? Math.min(params.days, 365) : null;
  const limit = Math.min(200, Math.max(1, params?.limit ?? 100));

  const values: Array<string | number> = [];
  const conditions = ['1 = 1'];

  if (type) {
    values.push(type);
    conditions.push(`e.event_type = $${values.length}`);
  } else {
    conditions.push(`e.event_type <> 'feedback_submit_attempt'`);
  }

  if (q) {
    values.push(`%${q}%`);
    conditions.push(
      `(
        e.event_type ILIKE $${values.length}
        OR COALESCE(u.email, '') ILIKE $${values.length}
        OR COALESCE(u.source_group, '') ILIKE $${values.length}
        OR COALESCE(e.payload::text, '') ILIKE $${values.length}
      )`,
    );
  }

  if (days) {
    values.push(days);
    conditions.push(`e.created_at > NOW() - ($${values.length} * INTERVAL '1 day')`);
  }

  const whereSql = conditions.join(' AND ');
  const dedupedEventsCte = `
    WITH events_base AS (
      SELECT
        e.id,
        e.user_id,
        u.email AS user_email,
        u.source_group,
        e.session_id,
        e.event_type,
        e.payload,
        e.created_at,
        LAG(e.created_at) OVER (
          PARTITION BY
            e.event_type,
            COALESCE(e.user_id::text, CONCAT('session:', COALESCE(e.session_id, 'anonymous'))),
            COALESCE(e.payload::text, '')
          ORDER BY e.created_at
        ) AS prev_created_at
      FROM events e
      LEFT JOIN users u ON e.user_id = u.id
      WHERE ${whereSql}
    ),
    events_deduped AS (
      SELECT id, user_id, user_email, source_group, session_id, event_type, payload, created_at
      FROM events_base
      WHERE event_type <> 'feedback'
         OR prev_created_at IS NULL
         OR created_at - prev_created_at > INTERVAL '15 seconds'
    )
  `;

  const [eventsResult, countResult] = await Promise.all([
    sql.query<DbEventEntry>(
      `
        ${dedupedEventsCte}
        SELECT
          id,
          user_id,
          user_email,
          source_group,
          session_id,
          event_type,
          payload,
          created_at
        FROM events_deduped
        ORDER BY created_at DESC
        LIMIT $${values.length + 1}
      `,
      [...values, limit],
    ),
    sql.query<{ count: number }>(
      `
        ${dedupedEventsCte}
        SELECT COUNT(*)::int AS count
        FROM events_deduped
      `,
      values,
    ),
  ]);

  return {
    events: eventsResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}
