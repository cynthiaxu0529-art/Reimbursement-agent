/**
 * Database connection
 * 使用 Vercel Postgres (Neon) + Drizzle ORM
 */

import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql } from '@vercel/postgres';
import * as schema from './schema';

export const db = drizzle(sql, { schema });
