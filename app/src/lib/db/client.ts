// ============================================================================
// Postgres client — thin tagged-template wrapper around `pg`
// ============================================================================
// We previously imported `sql` from `@vercel/postgres`, which under the hood
// uses the Neon serverless driver and rejects connection strings that don't
// match Neon's expected shape (e.g. vanilla `postgres://user@localhost`).
// That made local development impossible without standing up a Neon-shim.
//
// `pg` works against any Postgres-compatible endpoint — local Homebrew
// install, Vercel Postgres (which now exposes a vanilla PG protocol), Neon,
// Supabase, RDS, you name it. We just need a tagged-template wrapper that
// preserves the small subset of `@vercel/postgres`'s API that the rest of
// the codebase relies on:
//
//   sql<T>`SELECT ... FROM users WHERE id = ${id}`        // tagged template
//   sql.query<T>(text, values)                             // dynamic SQL
//
// Both return `{ rows: T[] }`. The pool is lazily constructed on first use
// so we don't try to connect during module load (which would crash any
// test-time importer that doesn't have POSTGRES_URL set).
// ============================================================================

import { Pool, type QueryResult, type QueryResultRow } from 'pg';

let pool: Pool | undefined;

function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('POSTGRES_URL is not set — cannot connect to Postgres.');
  }
  // Vercel Postgres / Neon / Supabase URLs typically include `?sslmode=require`;
  // local URLs don't, and pg defaults to no-SSL when the parameter is absent.
  // Honour an explicit `?sslmode=disable` (some hosted providers expect it).
  const ssl = /sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined;
  pool = new Pool({ connectionString, ssl });
  return pool;
}

export interface SqlClient {
  <T extends QueryResultRow = QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<QueryResult<T>>;
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

const taggedTemplate = async function <T extends QueryResultRow = QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<QueryResult<T>> {
  // Convert ${} interpolations to numbered placeholders ($1, $2, …).
  let text = '';
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  return getPool().query<T>(text, values);
} as SqlClient;

taggedTemplate.query = async function <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values ?? []);
};

export const sql: SqlClient = taggedTemplate;
