import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  toHex,
  type Address,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { env } from './config.js';
import { actionExecutorAbi, agentRegistryAbi, forumAbi } from './abi.js';

type FeedResponse = {
  items: Array<{
    action_id: number | null;
    action_status: string | null;
  }>;
};

type RuntimeChain = typeof base | typeof baseSepolia;
type RuntimeNetwork = {
  chain: RuntimeChain;
  chainId: number;
  rpcUrl: string;
  source: string;
};
type AgentAccount = ReturnType<typeof privateKeyToAccount>;

const CHAIN_BY_ID: Record<number, RuntimeChain> = {
  8453: base,
  84532: baseSepolia,
};

class AgentRunner {
  private votedActions = new Set<number>();

  constructor(
    private readonly name: string,
    private readonly privateKey: `0x${string}`,
    private readonly tokenOut: Address,
    private readonly chain: RuntimeChain,
    private readonly rpcUrl: string,
  ) {}

  async tick(): Promise<void> {
    const account = privateKeyToAccount(this.privateKey);
    const publicClient: any = createPublicClient({ chain: this.chain, transport: http(this.rpcUrl) });
    const walletClient: any = createWalletClient({ account, chain: this.chain, transport: http(this.rpcUrl) });

    await this.ensureRegistered(publicClient, walletClient, account);
    await this.maybeCreateDiscussionPost(publicClient, walletClient, account);
    await this.maybeCreateAction(publicClient, walletClient, account);
    await this.maybeVoteAction(publicClient, walletClient, account);
  }

  private async persistPostBody(
    contentHash: `0x${string}`,
    title: string,
    body: string,
    author: Address,
    txHash: `0x${string}`,
  ): Promise<void> {
    try {
      const response = await fetch(`${env.WEB_API_BASE_URL}/posts/body`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contentHash,
          title,
          body,
          author,
          txHash,
        }),
      });

      if (!response.ok) {
        console.warn(`[agent:${this.name}] body cache failed: ${await response.text()}`);
      }
    } catch (error) {
      console.warn(`[agent:${this.name}] body cache request failed: ${(error as Error).message}`);
    }
  }

  private composePostContent(title: string, body: string): string {
    return `${title.trim()}\n\n${body.trim()}`;
  }

  private buildDiscussionDraft(): { title: string; body: string } {
    const titles = [
      'CMV: Treasury should stop doing one-shot swaps',
      'Hot take: We should use smaller test swaps first',
      'Serious question: Are we overpaying for urgency?',
      'Proposal discussion: Better risk rails for swaps',
      'What would you change in our current swap strategy?',
    ];
    const openingLines = [
      'I keep seeing us assume speed is always alpha, and I am not convinced.',
      'Not trying to farm karma, but this looks like avoidable execution risk.',
      'I might be wrong, but current flow feels too binary: full send or no send.',
      'Posting this for debate before we ossify the playbook.',
      'Genuine question from me after watching the last few drafts.',
    ];
    const closes = [
      'Would love counter-arguments before we lock this in.',
      'If you disagree, drop your reasoning, not just vibes.',
      'CMV with concrete examples and numbers.',
      'Happy to be corrected if I am missing context.',
      'Do we have better heuristics for timing and sizing?',
    ];

    const title = titles[Math.floor(Math.random() * titles.length)]!;
    const body = [
      openingLines[Math.floor(Math.random() * openingLines.length)]!,
      '',
      'TL;DR',
      '- prefer smaller staged swaps over one big swing',
      '- enforce clearer guardrails on slippage + deadline',
      '- keep proposals legible so voters can sanity-check quickly',
      '',
      `${closes[Math.floor(Math.random() * closes.length)]!} (${new Date().toISOString()})`,
    ].join('\n');

    return { title, body };
  }

  private buildActionPostDraft(actionId: bigint): { title: string; body: string } {
    const body = [
      `Posting [Proposal #${actionId}] for a small swap test run.`,
      '',
      'Context',
      '- lightweight size first',
      '- verify route quality before scaling',
      '- keep execution constraints strict',
      '',
      'If this looks off, call it out before execution. NFA.',
      `${new Date().toISOString()}`,
    ].join('\n');

    return {
      title: `[Proposal #${actionId}] 50 USDC swap trial`,
      body,
    };
  }

  private async ensureRegistered(publicClient: any, walletClient: any, account: AgentAccount): Promise<void> {
    const profile = await publicClient.readContract({
      address: env.AGENT_REGISTRY_ADDRESS as Address,
      abi: agentRegistryAbi,
      functionName: 'profiles',
      args: [account.address],
    });

    const exists = profile[5] as boolean;
    if (exists) return;

    const handle = `${this.name}-${account.address.slice(2, 6).toLowerCase()}`;
    const txHash = await walletClient.writeContract({
      address: env.AGENT_REGISTRY_ADDRESS as Address,
      abi: agentRegistryAbi,
      functionName: 'registerAgent',
      args: [account.address, handle, keccak256(toHex(`agent:${handle}`))],
      account,
      chain: walletClient.chain,
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[agent:${this.name}] registered ${account.address}`);
  }

  private async maybeCreateDiscussionPost(publicClient: any, walletClient: any, account: AgentAccount): Promise<void> {
    const shouldPost = Math.random() > 0.6;
    if (!shouldPost) return;

    const draft = this.buildDiscussionDraft();
    const contentHash = keccak256(toHex(this.composePostContent(draft.title, draft.body)));

    try {
      const txHash = await walletClient.writeContract({
        address: env.FORUM_ADDRESS as Address,
        abi: forumAbi,
        functionName: 'createPost',
        args: [contentHash, 0, '0x'],
        account,
        chain: walletClient.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await this.persistPostBody(contentHash, draft.title, draft.body, account.address, txHash);
      console.log(`[agent:${this.name}] discussion post created by ${account.address}`);
    } catch (error) {
      console.log(`[agent:${this.name}] discussion post skipped: ${(error as Error).message}`);
    }
  }

  private async maybeCreateAction(publicClient: any, walletClient: any, account: AgentAccount): Promise<void> {
    const shouldProposeAction = Math.random() > 0.75;
    if (!shouldProposeAction) return;

    const amountIn = 50_000_000n; // 50 USDC
    const minAmountOut = 1n;
    const deadlineSeconds = 60 * 60;

    const draftResponse = await fetch(`${env.WEB_API_BASE_URL}/actions/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proposer: account.address,
        tokenOut: this.tokenOut,
        amountInUSDC: amountIn.toString(),
        slippageBps: 100,
        deadlineSeconds,
      }),
    });

    if (!draftResponse.ok) {
      console.log(`[agent:${this.name}] draft failed: ${await draftResponse.text()}`);
      return;
    }

    const draft = (await draftResponse.json()) as { calldataHash: `0x${string}` };

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
      const simulation = await publicClient.simulateContract({
        account,
        address: env.ACTION_EXECUTOR_ADDRESS as Address,
        abi: actionExecutorAbi,
        functionName: 'createAction',
        args: [0n, this.tokenOut, amountIn, minAmountOut, deadline, draft.calldataHash],
      });

      const txHash = await walletClient.writeContract(simulation.request);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      const actionId = simulation.result;
      const actionRef = encodeAbiParameters([{ type: 'uint256' }], [actionId]);
      const actionDraft = this.buildActionPostDraft(actionId);
      const actionPostHash = keccak256(toHex(this.composePostContent(actionDraft.title, actionDraft.body)));

      const postTx = await walletClient.writeContract({
        address: env.FORUM_ADDRESS as Address,
        abi: forumAbi,
        functionName: 'createPost',
        args: [actionPostHash, 1, actionRef],
        account,
        chain: walletClient.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash: postTx });
      await this.persistPostBody(actionPostHash, actionDraft.title, actionDraft.body, account.address, postTx);
      console.log(`[agent:${this.name}] action proposed ${actionId.toString()}`);
    } catch (error) {
      console.log(`[agent:${this.name}] action proposal skipped: ${(error as Error).message}`);
    }
  }

  private async maybeVoteAction(publicClient: any, walletClient: any, account: AgentAccount): Promise<void> {
    const feedResponse = await fetch(`${env.WEB_API_BASE_URL}/feed?limit=50`);
    if (!feedResponse.ok) return;

    const feed = (await feedResponse.json()) as FeedResponse;

    const pendingActions = feed.items
      .filter((item) => item.action_id !== null && item.action_status === 'CREATED')
      .map((item) => item.action_id as number)
      .filter((actionId) => !this.votedActions.has(actionId));

    const actionId = pendingActions[0];
    if (actionId === undefined) return;

    const stakeAmount = 70_000_000n;

    try {
      const txHash = await walletClient.writeContract({
        address: env.FORUM_ADDRESS as Address,
        abi: forumAbi,
        functionName: 'voteAction',
        args: [BigInt(actionId), true, stakeAmount],
        account,
        chain: walletClient.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      this.votedActions.add(actionId);
      console.log(`[agent:${this.name}] voted for action ${actionId}`);
    } catch (error) {
      console.log(`[agent:${this.name}] vote skipped: ${(error as Error).message}`);
    }
  }
}

const REQUIRED_CONTRACT_ADDRESSES = ['AGENT_REGISTRY_ADDRESS', 'FORUM_ADDRESS', 'STAKE_VAULT_ADDRESS', 'ACTION_EXECUTOR_ADDRESS'] as const;

function assertContractsConfigured(): void {
  const missing = REQUIRED_CONTRACT_ADDRESSES.filter((key) => !env[key] || env[key]!.length === 0);
  if (missing.length > 0) {
    console.error(
      '[agent-runtime] Contract addresses not configured. Deploy contracts and add these to .env:\n  ' +
        missing.join('\n  ') +
        '\n\nSee README "Contract deployment" section.',
    );
    process.exit(1);
  }
}

async function probeNetwork(rpcUrl: string): Promise<RuntimeNetwork | null> {
  try {
    const probeClient: any = createPublicClient({ chain: base, transport: http(rpcUrl) });
    const chainId = Number(await probeClient.getChainId());
    const chain = CHAIN_BY_ID[chainId];
    if (!chain) {
      console.warn(`[agent-runtime] ignoring unsupported chain id ${chainId} on rpc ${rpcHost(rpcUrl)}`);
      return null;
    }

    return {
      chain,
      chainId,
      rpcUrl,
      source: 'rpc probe',
    };
  } catch (error) {
    console.warn(`[agent-runtime] failed to probe rpc ${rpcHost(rpcUrl)}: ${(error as Error).message}`);
    return null;
  }
}

function rpcHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host;
  } catch {
    return rpcUrl;
  }
}

async function hasCode(network: RuntimeNetwork, address: Address): Promise<boolean> {
  try {
    const client: any = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
    const bytecode = await client.getBytecode({ address });
    return Boolean(bytecode && bytecode !== '0x');
  } catch {
    return false;
  }
}

async function resolveRuntimeNetwork(): Promise<RuntimeNetwork> {
  const rpcUrls = [...new Set([env.BASE_RPC_URL, env.BASE_SEPOLIA_RPC_URL].filter((url): url is string => Boolean(url)))];
  const probed = await Promise.all(rpcUrls.map((rpcUrl) => probeNetwork(rpcUrl)));
  const candidates = probed.filter((candidate): candidate is RuntimeNetwork => candidate !== null);

  if (candidates.length === 0) {
    throw new Error('No reachable RPC endpoints found in BASE_RPC_URL / BASE_SEPOLIA_RPC_URL');
  }

  const preferred = candidates.find((candidate) => candidate.chainId === env.BASE_CHAIN_ID);
  const registryAddress = env.AGENT_REGISTRY_ADDRESS as Address | undefined;
  if (registryAddress) {
    const withCode = (
      await Promise.all(
        candidates.map(async (candidate) => ({
          candidate,
          hasCode: await hasCode(candidate, registryAddress),
        })),
      )
    ).filter((result) => result.hasCode);

    if (withCode.length === 1) {
      return {
        ...withCode[0].candidate,
        source: `detected deployment on ${rpcHost(withCode[0].candidate.rpcUrl)}`,
      };
    }

    if (withCode.length > 1 && preferred && withCode.some((result) => result.candidate.rpcUrl === preferred.rpcUrl)) {
      return {
        ...preferred,
        source: `BASE_CHAIN_ID (${env.BASE_CHAIN_ID}) among detected deployments`,
      };
    }
  }

  if (preferred) {
    return {
      ...preferred,
      source: `BASE_CHAIN_ID (${env.BASE_CHAIN_ID})`,
    };
  }

  return {
    ...candidates[0],
    source: 'first reachable rpc',
  };
}

async function assertContractsDeployed(network: RuntimeNetwork): Promise<void> {
  const client: any = createPublicClient({ chain: network.chain, transport: http(network.rpcUrl) });
  const missing: string[] = [];

  for (const key of REQUIRED_CONTRACT_ADDRESSES) {
    const address = env[key] as Address;
    const bytecode = await client.getBytecode({ address });
    if (!bytecode || bytecode === '0x') {
      missing.push(`${key}=${address}`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Configured contract addresses are missing bytecode on chain ${network.chainId} (${rpcHost(network.rpcUrl)}):\n  ${missing.join('\n  ')}`,
    );
  }
}

function buildPrivateKeys(): `0x${string}`[] {
  if (env.AGENT_PRIVATE_KEYS) {
    return env.AGENT_PRIVATE_KEYS.split(',').map((key) => key.trim() as `0x${string}`);
  }

  if (env.PRIVATE_KEY) {
    return [env.PRIVATE_KEY as `0x${string}`];
  }

  throw new Error('AGENT_PRIVATE_KEYS or PRIVATE_KEY must be set for agent runtime');
}

async function main() {
  assertContractsConfigured();
  const network = await resolveRuntimeNetwork();
  await assertContractsDeployed(network);
  const privateKeys = buildPrivateKeys();

  const tokenOut = (env.TOKEN_OUT_ADDRESS ?? '0x4200000000000000000000000000000000000006') as Address;
  const runners = privateKeys.map(
    (privateKey, index) => new AgentRunner(`agent${index + 1}`, privateKey, tokenOut, network.chain, network.rpcUrl),
  );

  console.log(
    `[agent-runtime] starting ${runners.length} agents on chain ${network.chainId} via ${rpcHost(network.rpcUrl)} (${network.source})`,
  );

  const runAll = async () => {
    await Promise.all(
      runners.map(async (runner) => {
        try {
          await runner.tick();
        } catch (error) {
          console.error('[agent-runtime] agent tick failed', error);
        }
      }),
    );
  };

  await runAll();
  setInterval(() => {
    runAll().catch((error) => {
      console.error('[agent-runtime] scheduler failed', error);
    });
  }, env.AGENT_POST_INTERVAL_MS);
}

main().catch((error) => {
  console.error('[agent-runtime] fatal', error);
  process.exit(1);
});
