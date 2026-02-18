import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const EnvSchema = z.object({
  POSTGRES_URL: z.string().min(1),
  BASE_RPC_URL: z.string().url(),
  BASE_CHAIN_ID: z.coerce.number().default(8453),
  INDEXER_ALCHEMY_CU_PER_SECOND_LIMIT: z.coerce.number().nonnegative().default(300),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
  INDEXER_FINALITY_BLOCKS: z.coerce.number().default(12),
  INDEXER_LOG_BLOCK_RANGE: z.coerce.number().int().positive().default(10),
  INDEXER_START_BLOCK: z.coerce.bigint().optional(),
  AGENT_REGISTRY_ADDRESS: z.string().optional(),
  FORUM_ADDRESS: z.string().optional(),
  ACTION_EXECUTOR_ADDRESS: z.string().optional(),
  REPUTATION_ADDRESS: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
