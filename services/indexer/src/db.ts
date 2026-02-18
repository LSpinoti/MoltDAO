import { Pool } from 'pg';
import { env } from './config.js';

export const db = new Pool({
  connectionString: env.POSTGRES_URL,
});

export async function getIndexerCursor(key: string): Promise<bigint | null> {
  const result = await db.query('SELECT value FROM indexer_state WHERE key = $1', [key]);
  if (result.rowCount === 0) return null;
  return BigInt(result.rows[0].value);
}

export async function setIndexerCursor(key: string, value: bigint): Promise<void> {
  await db.query(
    `
      INSERT INTO indexer_state (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, value.toString()],
  );
}
