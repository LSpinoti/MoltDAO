import { http } from 'viem';
import { env } from './config.js';
import { createAlchemyRateLimitedFetch } from './alchemyRateLimiter.js';

const API_CU_CAP = 20;
const apiCuLimit = Math.min(env.API_ALCHEMY_CU_PER_SECOND_LIMIT, API_CU_CAP);

if (env.API_ALCHEMY_CU_PER_SECOND_LIMIT > API_CU_CAP) {
  // eslint-disable-next-line no-console
  console.warn(
    `[api] API_ALCHEMY_CU_PER_SECOND_LIMIT capped to ${API_CU_CAP} CU/s ` +
      `(requested ${env.API_ALCHEMY_CU_PER_SECOND_LIMIT})`,
  );
}

const alchemyFetch = createAlchemyRateLimitedFetch('api', apiCuLimit);

export function rpcTransport(url: string) {
  return http(url, { fetchFn: alchemyFetch });
}
