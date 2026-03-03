/**
 * Setup Script: 创建给 Accounting Agent 使用的 Service Account
 *
 * 用法:
 *   node scripts/setup-service-account.js
 *
 * 或通过 npm script:
 *   npm run setup:service-account
 *
 * 此脚本会：
 * 1. 连接数据库
 * 2. 检查是否已存在 gaap-accounting-agent service account
 * 3. 如果不存在，创建一个新的 service account
 * 4. 打印明文 API Key（仅此一次）
 */

const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const { randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');
const { eq } = require('drizzle-orm');
const { pgTable, text, uuid, boolean, integer, jsonb, timestamp } = require('drizzle-orm/pg-core');

// 重新定义 schema（脚本中不能直接用 TypeScript import）
const serviceAccounts = pgTable('service_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceName: text('service_name').notNull().unique(),
  description: text('description'),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  permissions: jsonb('permissions').default([]),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at'),
  usageCount: integer('usage_count').notNull().default(0),
  revokedAt: timestamp('revoked_at'),
  revokeReason: text('revoke_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

const SERVICE_NAME = 'gaap-accounting-agent';
const PERMISSIONS = ['read:reimbursement_summaries'];
const SERVICE_KEY_PREFIX = 'sk_svc_';

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL or POSTGRES_URL environment variable is required');
    process.exit(1);
  }

  console.log('🔗 Connecting to database...');
  const client = postgres(connectionString, { ssl: 'require', max: 1 });
  const db = drizzle(client);

  try {
    // 检查是否已存在
    const existing = await db
      .select()
      .from(serviceAccounts)
      .where(eq(serviceAccounts.serviceName, SERVICE_NAME));

    if (existing.length > 0) {
      const account = existing[0];
      if (account.isActive && !account.revokedAt) {
        console.log(`\n⚠️  Service account "${SERVICE_NAME}" already exists and is active.`);
        console.log(`   ID: ${account.id}`);
        console.log(`   Key prefix: ${account.keyPrefix}`);
        console.log(`   Permissions: ${JSON.stringify(account.permissions)}`);
        console.log(`\n   If you need a new key, revoke the existing one first.`);
        process.exit(0);
      } else {
        console.log(`\n⚠️  Service account "${SERVICE_NAME}" exists but is revoked. Creating a new one...`);
        // 删除旧的被撤销的记录
        const { eq: eqFn } = require('drizzle-orm');
        await db.delete(serviceAccounts).where(eqFn(serviceAccounts.id, account.id));
      }
    }

    // 生成 key
    const randomPart = randomBytes(32).toString('hex');
    const key = `${SERVICE_KEY_PREFIX}${randomPart}`;
    const keyHash = await bcrypt.hash(key, 12);
    const keyPrefix = key.substring(0, 14) + '...';

    // 创建 service account
    const [created] = await db.insert(serviceAccounts).values({
      serviceName: SERVICE_NAME,
      description: 'GAAP Accounting Agent - reads reimbursement summaries for journal entries',
      apiKeyHash: keyHash,
      keyPrefix,
      permissions: PERMISSIONS,
    }).returning();

    console.log('\n✅ Service Account created successfully!\n');
    console.log('   Service Name:', created.serviceName);
    console.log('   ID:', created.id);
    console.log('   Permissions:', JSON.stringify(PERMISSIONS));
    console.log('\n   ╔══════════════════════════════════════════════════════════════╗');
    console.log('   ║  🔑 API Key (save this — it will NOT be shown again):      ║');
    console.log('   ╠══════════════════════════════════════════════════════════════╣');
    console.log(`   ║  ${key}`);
    console.log('   ╚══════════════════════════════════════════════════════════════╝');
    console.log('\n   Set this as REIMBURSEMENT_AGENT_API_KEY in the Accounting Agent\'s .env file.');
    console.log('   The Accounting Agent will use this key in the X-Service-Key header');
    console.log('   when calling GET /api/reimbursement-summaries.\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
