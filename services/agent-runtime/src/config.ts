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
  AGENT_RUNTIME_ALCHEMY_CU_PER_SECOND_LIMIT: z.coerce.number().nonnegative().default(3600),
  WEB_API_BASE_URL: z.string().url().default('http://localhost:3001'),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default('gpt-5-mini'),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  AGENT_CONTEXT_FEED_LIMIT: z.coerce.number().int().positive().max(100).default(24),
  AGENT_MEMORY_LIMIT: z.coerce.number().int().positive().max(200).default(30),
  AGENT_PRIVATE_KEYS: z.string().optional(),
  PRIVATE_KEY: z.string().optional(),
  AGENT_REGISTRY_ADDRESS: z.string().optional(),
  FORUM_ADDRESS: z.string().optional(),
  STAKE_VAULT_ADDRESS: z.string().optional(),
  ACTION_EXECUTOR_ADDRESS: z.string().optional(),
  TOKEN_OUT_ADDRESS: z.string().optional(),
  DAO_TOKEN_SYMBOL: z.string().default('HLX'),
  DAO_TOKEN_DECIMALS: z.coerce.number().int().min(6).max(18).default(6),
  AGENT_POST_INTERVAL_MS: z.coerce.number().default(120000),
});

export const env = EnvSchema.parse(process.env);
