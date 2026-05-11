// ============================================================================
// Database migration — runnable both as a CLI seed and from a server route
// ============================================================================
// The schema lives here as a string so it bundles into the Next.js build.
// Both `src/lib/db/seed.ts` (CLI: `npx tsx src/lib/db/seed.ts`) and
// `src/app/api/admin/migrate/route.ts` (one-shot admin endpoint, gated by
// ADMIN_SECRET) call `runMigration()` to bring a fresh or upgrading Postgres
// instance to the current Lasca schema.
//
// All statements are idempotent: tables use `IF NOT EXISTS`, columns use
// `ADD COLUMN IF NOT EXISTS`, and seed inserts use `ON CONFLICT DO NOTHING`,
// so re-running this is safe.
// ============================================================================

import { sql } from './client';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active',
  invite_code_used VARCHAR(50) NOT NULL,
  login_code VARCHAR(50) UNIQUE,
  source_group VARCHAR(100),
  referrer_user_id INTEGER REFERENCES users(id),
  google_sub VARCHAR(255) UNIQUE,
  session_expires_at TIMESTAMP NOT NULL,
  renewal_status VARCHAR(20) DEFAULT NULL,
  current_tool TEXT[],
  use_case TEXT[],
  role VARCHAR(50),
  pain_point VARCHAR(100),
  session_token VARCHAR(500),
  ai_calls_today INTEGER DEFAULT 0,
  ai_calls_reset_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) UNIQUE;

CREATE TABLE IF NOT EXISTS invites (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  source_group VARCHAR(100) NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id),
  used_by_user_id INTEGER REFERENCES users(id),
  cap_group VARCHAR(100),
  max_uses INT DEFAULT 1,
  use_count INT DEFAULT 0,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  session_id VARCHAR(100),
  event_type VARCHAR(50) NOT NULL,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key VARCHAR(100) PRIMARY KEY,
  value VARCHAR(500) NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS caps (
  group_name VARCHAR(100) PRIMARY KEY,
  max_users INTEGER NOT NULL,
  current_users INTEGER DEFAULT 0,
  max_child_invites_per_user INTEGER DEFAULT 3,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
`;

const DEFAULT_FLAGS: Array<[string, string, string]> = [
  ['import_pptx', 'false', '内测期间禁用 PPTX 导入'],
  ['import_pdf', 'false', '内测期间禁用 PDF 导入'],
  ['import_file', 'false', '内测期间禁用文件上传'],
  ['max_import_mb', '0', '导入文件大小上限（MB，0=不限）'],
  ['max_slides', '15', '每个 deck 最大页数'],
  ['max_decks', '5', '每用户最多 deck 数'],
  ['ai_daily_limit', '30', '每用户每天 AI 调用上限'],
  ['export_enabled', 'true', '是否开放导出'],
  ['export_lasca_enabled', 'false', '是否开放 .lasca HTML 导出'],
  ['registration_open', 'true', '注册是否开放（兼容字段；当 auth_mode=invite_legacy 时生效）'],
  ['auth_mode', 'google_only', '注册/登录模式：google_only / invite_legacy'],
];

const DEFAULT_CAPS: Array<[string, number, number]> = [
  ['global', 100, 3],
  ['groupA', 30, 3],
  ['groupB', 30, 3],
];

export interface MigrationReport {
  schemaStatementsRun: number;
  flagsSeeded: number;
  capsSeeded: number;
  errors: string[];
}

export async function runMigration(): Promise<MigrationReport> {
  const errors: string[] = [];

  const statements = SCHEMA_SQL
    .replace(/--.*$/gm, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  let schemaStatementsRun = 0;
  for (const stmt of statements) {
    try {
      await sql.query(stmt);
      schemaStatementsRun++;
    } catch (err) {
      errors.push(`${stmt.slice(0, 60)}... → ${(err as Error).message}`);
    }
  }

  let flagsSeeded = 0;
  for (const [key, value, description] of DEFAULT_FLAGS) {
    try {
      await sql`
        INSERT INTO feature_flags (key, value, description)
        VALUES (${key}, ${value}, ${description})
        ON CONFLICT (key) DO NOTHING
      `;
      flagsSeeded++;
    } catch (err) {
      errors.push(`flag ${key}: ${(err as Error).message}`);
    }
  }

  let capsSeeded = 0;
  for (const [group, max, childInvites] of DEFAULT_CAPS) {
    try {
      await sql`
        INSERT INTO caps (group_name, max_users, max_child_invites_per_user)
        VALUES (${group}, ${max}, ${childInvites})
        ON CONFLICT (group_name) DO NOTHING
      `;
      capsSeeded++;
    } catch (err) {
      errors.push(`cap ${group}: ${(err as Error).message}`);
    }
  }

  return { schemaStatementsRun, flagsSeeded, capsSeeded, errors };
}
