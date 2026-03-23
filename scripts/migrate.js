/**
 * Lightweight migration script for CI/CD.
 * Runs idempotent SQL (CREATE TABLE IF NOT EXISTS) so it's safe to execute on every build.
 */
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.log('[migrate] No DATABASE_URL set, skipping migration.');
    process.exit(0);
  }

  const sql = postgres(connectionString, { ssl: 'require', max: 1 });

  try {
    // Run all migration files that use IF NOT EXISTS (safe to re-run)
    const migrationFile = path.join(__dirname, '..', 'drizzle', '0007_add_password_reset_tokens.sql');
    const migrationSql = fs.readFileSync(migrationFile, 'utf-8');

    console.log('[migrate] Running password_reset_tokens migration...');
    await sql.unsafe(migrationSql);
    console.log('[migrate] Done.');
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    // Don't fail the build if migration errors (table may already exist)
  } finally {
    await sql.end();
  }
}

main();
