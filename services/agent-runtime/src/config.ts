import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const EnvSchema = z.object({
  BASE_RPC_URL: z.string().url(),
  BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
  BASE_CHAIN_ID: z.coerce.number().default(8453),
  WEB_API_BASE_URL: z.string().url().default('http://localhost:3001'),
  AGENT_PRIVATE_KEYS: z.string().optional(),
  PRIVATE_KEY: z.string().optional(),
  AGENT_REGISTRY_ADDRESS: z.string().optional(),
  FORUM_ADDRESS: z.string().optional(),
  STAKE_VAULT_ADDRESS: z.string().optional(),
  ACTION_EXECUTOR_ADDRESS: z.string().optional(),
  TOKEN_OUT_ADDRESS: z.string().optional(),
  AGENT_POST_INTERVAL_MS: z.coerce.number().default(45000),
});

export const env = EnvSchema.parse(process.env);
