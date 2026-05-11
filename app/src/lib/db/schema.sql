-- Lasca Beta Infrastructure Schema
-- Run via: npx tsx src/lib/db/seed.ts

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active',  -- active / warned / banned
  invite_code_used VARCHAR(50) NOT NULL, -- legacy invite path; OAuth users use sentinel 'GOOGLE_OAUTH'
  login_code VARCHAR(50) UNIQUE,
  source_group VARCHAR(100),
  referrer_user_id INTEGER REFERENCES users(id),

  -- OAuth identity (Google subject id; null for legacy invite-only users)
  google_sub VARCHAR(255) UNIQUE,

  -- Session renewal
  session_expires_at TIMESTAMP NOT NULL,
  renewal_status VARCHAR(20) DEFAULT NULL, -- NULL / pending / rejected

  -- Registration survey
  current_tool TEXT[],
  use_case TEXT[],
  role VARCHAR(50),
  pain_point VARCHAR(100),

  -- Runtime
  session_token VARCHAR(500),
  ai_calls_today INTEGER DEFAULT 0,
  ai_calls_reset_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Backfill for existing databases predating the OAuth path
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
