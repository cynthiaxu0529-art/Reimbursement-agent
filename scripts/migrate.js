/**
 * Lightweight migration script for CI/CD.
 * Runs idempotent SQL (CREATE TABLE IF NOT EXISTS) so it's safe to execute on every build.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.log('[migrate] No DATABASE_URL set, skipping migration.');
    return;
  }

  // Force exit after 15 seconds to never block the build
  const timeout = setTimeout(() => {
    console.log('[migrate] Timeout reached, proceeding with build.');
    process.exit(0);
  }, 15000);

  let sql;
  try {
    const postgres = require('postgres');
    sql = postgres(connectionString, {
      ssl: 'require',
      max: 1,
      connect_timeout: 10,
      idle_timeout: 5,
    });

    const migrations = [
      '0007_add_password_reset_tokens.sql',
      '0009_add_auto_approval.sql',
    ];

    for (const file of migrations) {
      const migrationFile = path.join(__dirname, '..', 'drizzle', file);
      const migrationSql = fs.readFileSync(migrationFile, 'utf-8');
      console.log(`[migrate] Running ${file}...`);
      await sql.unsafe(migrationSql);
    }
    console.log('[migrate] Done.');
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    // Don't fail the build
  } finally {
    clearTimeout(timeout);
    if (sql) await sql.end({ timeout: 3 }).catch(() => {});
  }
}

main();
