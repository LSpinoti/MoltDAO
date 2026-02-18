const METHOD_THROUGHPUT_CU: Record<string, number> = {
  eth_blockNumber: 10,
  eth_call: 26,
  eth_chainId: 0,
  eth_estimateGas: 20,
  eth_feeHistory: 10,
  eth_gasPrice: 20,
  eth_getBlockByNumber: 20,
  eth_getCode: 20,
  eth_getFilterLogs: 60,
  eth_getLogs: 60,
  eth_getTransactionCount: 20,
  eth_getTransactionReceipt: 20,
  eth_maxPriorityFeePerGas: 10,
  eth_sendRawTransaction: 250,
  net_version: 0,
};

const DEFAULT_METHOD_THROUGHPUT_CU = 500;

type RpcPayload = {
  method?: unknown;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CuRateLimiter {
  private nextAvailableMs = Date.now();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly cuPerSecondLimit: number) {}

  async consume(cu: number): Promise<void> {
    const units = Math.max(0, Math.ceil(cu));
    if (units === 0) return;

    const durationMs = (units / this.cuPerSecondLimit) * 1000;
    const task = this.queue.then(async () => {
      const now = Date.now();
      const start = Math.max(now, this.nextAvailableMs);
      const waitMs = start - now;
      this.nextAvailableMs = start + durationMs;
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    });

    this.queue = task.catch(() => undefined);
    await task;
  }
}

function resolveMethodCu(method: unknown): number {
  if (typeof method !== 'string') return DEFAULT_METHOD_THROUGHPUT_CU;
  return METHOD_THROUGHPUT_CU[method] ?? DEFAULT_METHOD_THROUGHPUT_CU;
}

function estimateRequestCu(body: RequestInit['body']): number {
  if (typeof body !== 'string') {
    return DEFAULT_METHOD_THROUGHPUT_CU;
  }

  try {
    const parsed = JSON.parse(body) as RpcPayload | RpcPayload[];
    const payloads = Array.isArray(parsed) ? parsed : [parsed];
    if (payloads.length === 0) return DEFAULT_METHOD_THROUGHPUT_CU;
    return payloads.reduce((total, payload) => total + resolveMethodCu(payload.method), 0);
  } catch {
    return DEFAULT_METHOD_THROUGHPUT_CU;
  }
}

function isAlchemyUrl(input: string | URL | Request): boolean {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes('alchemy.com') || host.includes('alchemyapi.io');
  } catch {
    return false;
  }
}

export function createAlchemyRateLimitedFetch(serviceName: string, cuPerSecondLimit: number): typeof fetch {
  if (cuPerSecondLimit <= 0) {
    return fetch;
  }

  const limiter = new CuRateLimiter(cuPerSecondLimit);
  // eslint-disable-next-line no-console
  console.log(`[${serviceName}] Alchemy throughput capped at ${cuPerSecondLimit} CU/s`);

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (isAlchemyUrl(input)) {
      await limiter.consume(estimateRequestCu(init?.body));
    }
    return fetch(input, init);
  };
}
