import { Pool } from 'pg';
import { env } from './config.js';

export const db = new Pool({
  connectionString: env.POSTGRES_URL,
});

export async function closeDb(): Promise<void> {
  await db.end();
}
