import {
  encodeAbiParameters,
  keccak256,
  type Address,
  type Hex,
  createPublicClient,
  http,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { env } from './config.js';

export type DraftActionInput = {
  proposer: Address;
  tokenOut: Address;
  amountInUSDC: bigint;
  slippageBps: number;
  deadlineSeconds: number;
};

export async function draftSwapAction(input: DraftActionInput) {
  const provider = resolveQuoteProvider();
  if (provider === 'mock') {
    return draftMockSwapAction(input);
  }

  return draftZeroxSwapAction(input);
}

const ZEROX_SUPPORTED_CHAIN_IDS = new Set<number>([
  1, 10, 56, 137, 8453, 42161, 43114, 59144, 534352, 5000, 81457, 34443, 480, 10143, 130, 80094, 57073, 9745, 143,
  146, 2741,
]);

type QuoteProvider = '0x' | 'mock';

function resolveQuoteProvider(): QuoteProvider {
  const configured = env.QUOTE_PROVIDER;
  const chainSupportedBy0x = ZEROX_SUPPORTED_CHAIN_IDS.has(env.BASE_CHAIN_ID);

  if (configured === 'mock') {
    return 'mock';
  }

  if (configured === '0x') {
    if (!chainSupportedBy0x) {
      throw new Error(
        `QUOTE_PROVIDER=0x is not supported for chain ${env.BASE_CHAIN_ID}. ` +
          'Use QUOTE_PROVIDER=mock for testnets such as Base Sepolia (84532).',
      );
    }
    return '0x';
  }

  // auto mode: use 0x on supported chains, mock quote path on unsupported ones.
  return chainSupportedBy0x ? '0x' : 'mock';
}

async function draftZeroxSwapAction(input: DraftActionInput) {
  const usdc = env.USDC_ADDRESS_BASE as Address | undefined;
  if (!usdc) {
    throw new Error('USDC_ADDRESS_BASE is not configured');
  }

  const requestUrl = new URL(env.ZEROX_API_URL);
  requestUrl.searchParams.set('chainId', String(env.BASE_CHAIN_ID));
  requestUrl.searchParams.set('sellToken', usdc);
  requestUrl.searchParams.set('buyToken', input.tokenOut);
  requestUrl.searchParams.set('sellAmount', input.amountInUSDC.toString());
  requestUrl.searchParams.set('slippageBps', String(input.slippageBps));
  requestUrl.searchParams.set('taker', env.ACTION_EXECUTOR_ADDRESS ?? input.proposer);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    '0x-version': 'v2',
  };

  if (env.ZEROX_API_KEY) {
    headers['0x-api-key'] = env.ZEROX_API_KEY;
  }

  const response = await fetch(requestUrl, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`0x quote request failed (${response.status}): ${body}`);
  }

  const quote = await response.json();
  const target = (quote.transaction?.to ?? quote.to) as Address | undefined;
  const data = (quote.transaction?.data ?? quote.data) as Hex | undefined;

  if (!target || !data) {
    throw new Error('0x quote missing target/data');
  }

  const swapCalldata = encodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes' }],
    [target, data],
  );

  const calldataHash = keccak256(swapCalldata);

  const riskChecks = {
    slippageWithinMax: input.slippageBps <= 500,
    deadlineWithinOneDay: input.deadlineSeconds <= 24 * 60 * 60,
    quoteHasRoute: Boolean(quote.route || quote.sources || quote.orders),
    isMockQuote: false,
  };

  const simulation = await simulateSwapCall(target, data);

  return {
    provider: '0x',
    quote,
    swapCalldata,
    calldataHash,
    simulation,
    riskChecks,
  };
}

async function draftMockSwapAction(input: DraftActionInput) {
  const usdc = env.USDC_ADDRESS_BASE as Address | undefined;
  if (!usdc) {
    throw new Error('USDC_ADDRESS_BASE is not configured');
  }

  const target = (env.MOCK_SWAP_TARGET ??
    env.ACTION_EXECUTOR_ADDRESS ??
    '0x000000000000000000000000000000000000dEaD') as Address;
  const mockTaker = (env.ACTION_EXECUTOR_ADDRESS as Address | undefined) ?? input.proposer;
  const mockPayload = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address' },
    ],
    [
      input.tokenOut,
      input.amountInUSDC,
      BigInt(input.slippageBps),
      BigInt(input.deadlineSeconds),
      mockTaker,
    ],
  );
  const data = (`0x12345678${mockPayload.slice(2)}`) as Hex;

  const swapCalldata = encodeAbiParameters([{ type: 'address' }, { type: 'bytes' }], [target, data]);
  const calldataHash = keccak256(swapCalldata);

  const quote = {
    provider: 'mock',
    chainId: env.BASE_CHAIN_ID,
    sellToken: usdc,
    buyToken: input.tokenOut,
    sellAmount: input.amountInUSDC.toString(),
    buyAmount: '1',
    liquidityAvailable: false,
    transaction: {
      to: target,
      data,
    },
    notes: 'Mock quote path for testnet/dev environments where 0x is unavailable.',
  };

  const riskChecks = {
    slippageWithinMax: input.slippageBps <= 500,
    deadlineWithinOneDay: input.deadlineSeconds <= 24 * 60 * 60,
    quoteHasRoute: false,
    isMockQuote: true,
  };

  return {
    provider: 'mock',
    quote,
    swapCalldata,
    calldataHash,
    simulation: {
      status: 'skipped',
      reason: 'mock quote provider enabled',
    },
    riskChecks,
  };
}

async function simulateSwapCall(to: Address, data: Hex) {
  if (!env.ACTION_EXECUTOR_ADDRESS) {
    return {
      status: 'skipped',
      reason: 'ACTION_EXECUTOR_ADDRESS not configured',
    };
  }

  const chain = env.BASE_CHAIN_ID === 84532 ? baseSepolia : base;
  const publicClient = createPublicClient({
    chain,
    transport: http(env.BASE_RPC_URL),
  });

  try {
    const estimateGas = await publicClient.estimateGas({
      account: env.ACTION_EXECUTOR_ADDRESS as Address,
      to,
      data,
    });

    return {
      status: 'ok',
      estimatedGas: estimateGas.toString(),
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'unknown simulation error',
    };
  }
}
