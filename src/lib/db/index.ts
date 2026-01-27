/**
 * 数据库连接配置
 * 支持标准 PostgreSQL（Relyt / Neon / 其他）
 */

import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// 延迟初始化，避免构建时报错
let dbInstance: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    const client = postgres(connectionString, {
      ssl: 'require',
      max: 1,
    });
    dbInstance = drizzle(client, { schema });
  }
  return dbInstance;
}

// 使用 Proxy 延迟初始化，构建时不会触发连接
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_, prop) {
    return getDb()[prop as keyof PostgresJsDatabase<typeof schema>];
  },
});

// 导出 schema 供其他模块使用
export * from './schema';
export { schema };
