/**
 * Database seed script — run with: npx tsx src/lib/db/seed.ts
 *
 * Requires POSTGRES_URL env var (set in .env.local or Vercel dashboard).
 * Creates all tables + inserts default feature flags and caps.
 *
 * The actual schema + seed logic lives in `migrate.ts` and is shared with
 * the `/api/admin/migrate` route so production deploys can run the same
 * migration via HTTP without a developer needing local DB credentials.
 */

import { runMigration } from './migrate';

async function seed() {
  console.log('Running migration...');
  const report = await runMigration();
  console.log(`  ✓ ${report.schemaStatementsRun} schema statements`);
  console.log(`  ✓ ${report.flagsSeeded} feature flags`);
  console.log(`  ✓ ${report.capsSeeded} caps`);
  if (report.errors.length > 0) {
    console.error(`\n${report.errors.length} errors:`);
    for (const err of report.errors) console.error(`  ✗ ${err}`);
    process.exit(1);
  }
  console.log('\nDone!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
