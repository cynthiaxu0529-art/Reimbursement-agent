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

    // 注意：0008（reversed enum + reversals 表）一开始漏在了白名单，
    // 导致部分租户的 DB 没 'reversed' 这个枚举值，结果
    // /api/reimbursements?status=paid,reversed 直接 PG 报错，
    // 付款历史显示「暂无付款记录」。补上后所有迁移都要按号顺序进这张白名单
    // ——以后新增 migration 务必同时改这里。
    const migrations = [
      '0007_add_password_reset_tokens.sql',
      '0008_add_reversals.sql',
      '0009_add_auto_approval.sql',
      '0010_add_expense_corrections.sql',
      '0011_add_coa_change_tracking.sql',
      '0012_add_correction_sync_tracking.sql',
      '0013_clear_legacy_coa_codes.sql',
      '0014_add_wallet_reconciliation.sql',
      '0015_add_period_closures.sql',
      '0016_add_wallet_reconciliation_period_notes.sql',
      '0017_add_data_anomaly_reviews.sql',
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
