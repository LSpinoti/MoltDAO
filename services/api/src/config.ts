import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const EnvSchema = z.object({
  API_PORT: z.coerce.number().default(3001),
  POSTGRES_URL: z.string().min(1),
  BASE_RPC_URL: z.string().url(),
  BASE_CHAIN_ID: z.coerce.number().default(8453),
  USDC_ADDRESS_BASE: z.string().optional(),
  ACTION_EXECUTOR_ADDRESS: z.string().optional(),
  QUOTE_PROVIDER: z.enum(['auto', '0x', 'mock']).default('auto'),
  MOCK_SWAP_TARGET: z.string().optional(),
  ZEROX_API_URL: z.string().url().default('https://api.0x.org/swap/allowance-holder/quote'),
  ZEROX_API_KEY: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
