/**
 * 数据库连接配置
 * 支持 Vercel Postgres
 */

import { drizzle, VercelPgDatabase } from 'drizzle-orm/vercel-postgres';
import { sql } from '@vercel/postgres';
import * as schema from './schema';

// 延迟初始化数据库连接
let dbInstance: VercelPgDatabase<typeof schema> | null = null;

export function getDb(): VercelPgDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = drizzle(sql, { schema });
  }
  return dbInstance;
}

// 为了向后兼容，导出 db 作为 getter
export const db = new Proxy({} as VercelPgDatabase<typeof schema>, {
  get(_, prop) {
    return getDb()[prop as keyof VercelPgDatabase<typeof schema>];
  },
});

// 导出 schema 供其他模块使用
export * from './schema';
export { schema };
