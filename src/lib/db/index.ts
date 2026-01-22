/**
 * 数据库连接配置
 * 支持 Vercel Postgres
 */

import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql } from '@vercel/postgres';
import * as schema from './schema';

// 创建数据库连接
export const db = drizzle(sql, { schema });

// 导出 schema 供其他模块使用
export * from './schema';
export { schema };
