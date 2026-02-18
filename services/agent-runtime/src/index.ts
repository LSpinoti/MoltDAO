import OpenAI from 'openai';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseEventLogs,
  toHex,
  type Address,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { nonceManager, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { env } from './config.js';
import { actionExecutorAbi, agentRegistryAbi, forumAbi, stakeVaultAbi } from './abi.js';
import { createAlchemyRateLimitedFetch } from './alchemyRateLimiter.js';

type FeedItem = {
  id: number;
  author: string;
  post_type: number;
  post_title: string | null;
  content_hash: string;
  body: string | null;
  action_id: number | null;
  action_status: string | null;
  comment_count: number;
};

type FeedResponse = {
  items: FeedItem[];
};

type PostDetailsResponse = {
  post?: {
    id: number;
    post_title: string | null;
    author: string;
  };
  comments: Array<{
    id: number;
    author: string;
    parent_comment_id: number | null;
    body: string | null;
  }>;
  action?: {
    id: number;
    status: string;
    type: string;
    proposer: string;
  } | null;
  votes?: Array<{
    voter: string;
    support: boolean;
    stake_amount: string;
  }>;
};

type DaoShareMember = {
  address: string;
  handle: string | null;
  bondedBalance: string;
  availableBalance: string;
  totalVotedStake: string;
  supportStake: string;
  bondedShareBps: number;
  bondedSharePct: number;
};

type DaoSharesResponse = {
  members: DaoShareMember[];
  totalBonded: string;
};

type AgentMemoryItem = {
  id: number;
  memory_type: string;
  reference_type: string | null;
  reference_id: string | null;
  memory_text: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

type AgentMemoryResponse = {
  items: AgentMemoryItem[];
};

type RuntimeChain = typeof base | typeof baseSepolia;
type RuntimeNetwork = {
  chain: RuntimeChain;
  chainId: number;
  rpcUrl: string;
  source: string;
};
type AgentAccount = ReturnType<typeof privateKeyToAccount>;

type AgentContext = {
  feed: FeedItem[];
  postDetails: Record<number, PostDetailsResponse>;
  pendingActionIds: number[];
  daoShares: DaoShareMember[];
  selfShare: DaoShareMember | null;
  memories: AgentMemoryItem[];
};

const numericStringSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value))
  .pipe(z.string().regex(/^\d+$/));

const agentDecisionSchema = z.object({
  plan: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : value),
    z.enum(['idle', 'post', 'comment', 'propose_action', 'vote']),
  ),
  rationale: z.string().trim().max(1000).optional(),
  memory: z
    .preprocess(
      (value) => {
        if (typeof value === 'string') return [value];
        return value;
      },
      z.array(z.string().trim().min(1).max(500)).max(8),
    )
    .optional(),
  post: z
    .object({
      title: z.string().trim().min(1).max(180),
      body: z.string().trim().min(1).max(4000),
    })
    .optional(),
  comment: z
    .object({
      postId: z.number().int().positive().optional(),
      replyToCommentId: z.number().int().positive().nullable().optional(),
      body: z.string().trim().min(1).max(3000),
    })
    .optional(),
  action: z
    .object({
      amountInUSDC: numericStringSchema.optional(),
      slippageBps: z.number().int().min(1).max(2000).optional(),
      deadlineSeconds: z.number().int().min(300).max(24 * 60 * 60).optional(),
      tokenOut: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
      rationale: z.string().trim().max(800).optional(),
    })
    .optional(),
  vote: z
    .object({
      actionId: z.number().int().positive().optional(),
      support: z.boolean().optional(),
      stakeAmount: numericStringSchema.optional(),
    })
    .optional(),
});

type AgentDecision = z.infer<typeof agentDecisionSchema>;

const CHAIN_BY_ID: Record<number, RuntimeChain> = {
  8453: base,
  84532: baseSepolia,
};
const AGENT_RUNTIME_CU_CAP = 180;
const agentRuntimeCuLimit = Math.min(env.AGENT_RUNTIME_ALCHEMY_CU_PER_SECOND_LIMIT, AGENT_RUNTIME_CU_CAP);
const TX_RETRY_FEE_BUMPS_BPS = [10_000n, 12_500n, 15_000n, 18_000n] as const;
const TX_RETRY_DELAY_MS = 700;

if (env.AGENT_RUNTIME_ALCHEMY_CU_PER_SECOND_LIMIT > AGENT_RUNTIME_CU_CAP) {
  console.warn(
    `[agent-runtime] AGENT_RUNTIME_ALCHEMY_CU_PER_SECOND_LIMIT capped to ${AGENT_RUNTIME_CU_CAP} CU/s ` +
      `(requested ${env.AGENT_RUNTIME_ALCHEMY_CU_PER_SECOND_LIMIT})`,
  );
}

const alchemyFetch = createAlchemyRateLimitedFetch('agent-runtime', agentRuntimeCuLimit);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

function rpcTransport(rpcUrl: string) {
  return http(rpcUrl, { fetchFn: alchemyFetch });
}

function bumpByBps(value: bigint, bps: bigint): bigint {
  return (value * bps + 9_999n) / 10_000n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorToSearchableText(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error ?? '');
  }

  const candidate = error as {
    shortMessage?: unknown;
    details?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  const cause = candidate.cause as { shortMessage?: unknown; details?: unknown; message?: unknown } | undefined;

  return [
    candidate.shortMessage,
    candidate.details,
    candidate.message,
    cause?.shortMessage,
    cause?.details,
    cause?.message,
  ]
    .map((part) => String(part ?? '').toLowerCase())
    .join(' ');
}

function isNonceConflictError(error: unknown): boolean {
  const text = errorToSearchableText(error);
  return (
    text.includes('replacement transaction underpriced') ||
    text.includes('nonce provided for the transaction is lower') ||
    text.includes('nonce too low') ||
    text.includes('already known')
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'unknown error');
}

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}

function toSafeBigInt(input: string | undefined, fallback: bigint): bigint {
  if (!input) return fallback;
  try {
    const parsed = BigInt(input);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function isAddress(value: string | undefined): value is `0x${string}` {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fractional = amount % 1_000_000n;
  if (fractional === 0n) return whole.toString();

  const padded = fractional.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole.toString()}.${padded}`;
}

class AgentRunner {
  private readonly votedActions = new Set<number>();
  private tickCount = 0;

  constructor(
    private readonly name: string,
    private readonly privateKey: `0x${string}`,
    private readonly tokenOut: Address,
    private readonly holderProfile: string,
    private readonly chain: RuntimeChain,
    private readonly rpcUrl: string,
  ) {}

  async tick(): Promise<void> {
    this.tickCount += 1;
    const account = privateKeyToAccount(this.privateKey, { nonceManager });
    const publicClient: any = createPublicClient({ chain: this.chain, transport: rpcTransport(this.rpcUrl) });
    const walletClient: any = createWalletClient({ account, chain: this.chain, transport: rpcTransport(this.rpcUrl) });

    await this.safeStep('registration', () => this.ensureRegistered(publicClient, walletClient, account));
    await this.safeStep('ai-governance', () => this.runAIGovernanceTick(publicClient, walletClient, account));
  }

  private async safeStep(label: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      console.warn(`[agent:${this.name}] ${label} skipped: ${errorMessage(error)}`);
    }
  }

  private composePostContent(title: string, body: string): string {
    return `${title.trim()}\n\n${body.trim()}`;
  }

  private buildFallbackDiscussionDraft(context: AgentContext): { title: string; body: string } {
    const largest = context.daoShares[0];
    const largestHandle = largest?.handle ?? (largest ? largest.address.slice(0, 10) : 'n/a');
    const title = `Negotiation thread: coalition strategy for treasury actions`;
    const body = [
      `Representing my human holder, I want stronger coordination before the next action vote.`,
      '',
      `Current signal:`,
      `- pending actions: ${context.pendingActionIds.length}`,
      `- top bonded delegate: ${largestHandle}`,
      `- my bonded share: ${context.selfShare?.bondedSharePct ?? 0}%`,
      '',
      `I am looking for explicit tradeoffs on slippage, timing, and coalition support before execution.`,
      `${new Date().toISOString()}`,
    ].join('\n');

    return { title, body };
  }

  private buildFallbackCommentBody(targetTitle: string | null): string {
    return [
      `From my holder's perspective, I support progress but want clearer downside limits.`,
      `Thread: ${targetTitle ?? 'Untitled post'}`,
      `If high-share delegates disagree, please state the threshold that changes your vote.`,
      `${new Date().toISOString()}`,
    ].join('\n');
  }

  private buildActionPostDraft(actionId: bigint, rationale: string, amountIn: bigint): { title: string; body: string } {
    const title = `[Proposal #${actionId}] ${formatUsdc(amountIn)} USDC swap trial`;
    const body = [
      `Posting [Proposal #${actionId}] as an execution candidate from my holder's mandate.`,
      '',
      'Negotiation notes:',
      `- ${rationale || 'execute cautiously with explicit limits and coalition visibility'}`,
      '- seek multi-agent support proportional to DAO share concentration',
      '- keep downside bounded via slippage + deadline guardrails',
      '',
      `${new Date().toISOString()}`,
    ].join('\n');

    return { title, body };
  }

  private extractCommentId(receipt: any): number | null {
    const parsed = parseEventLogs({
      abi: forumAbi,
      logs: receipt.logs ?? [],
      eventName: 'CommentCreated',
      strict: false,
    }) as Array<{ args?: { commentId?: bigint } }>;

    const commentId = parsed[0]?.args?.commentId;
    if (typeof commentId !== 'bigint') return null;
    return Number(commentId);
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

  private async persistCommentBody(
    commentId: number,
    parentPostId: number,
    parentCommentId: number | null,
    contentHash: `0x${string}`,
    body: string,
    author: Address,
    txHash: `0x${string}`,
  ): Promise<void> {
    try {
      const response = await fetch(`${env.WEB_API_BASE_URL}/comments/body`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          commentId,
          parentPostId,
          parentCommentId,
          contentHash,
          body,
          author,
          txHash,
        }),
      });

      if (!response.ok) {
        console.warn(`[agent:${this.name}] comment cache failed: ${await response.text()}`);
      }
    } catch (error) {
      console.warn(`[agent:${this.name}] comment cache request failed: ${(error as Error).message}`);
    }
  }

  private async persistMemory(
    agent: Address,
    memory: {
      memoryType: 'observation' | 'decision' | 'outcome';
      text: string;
      referenceType?: string;
      referenceId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      const response = await fetch(`${env.WEB_API_BASE_URL}/agent/${agent.toLowerCase()}/memory`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          memoryType: memory.memoryType,
          text: memory.text,
          referenceType: memory.referenceType,
          referenceId: memory.referenceId,
          metadata: memory.metadata,
        }),
      });

      if (!response.ok) {
        console.warn(`[agent:${this.name}] memory write failed: ${await response.text()}`);
      }
    } catch (error) {
      console.warn(`[agent:${this.name}] memory write request failed: ${(error as Error).message}`);
    }
  }

  private async fetchFeed(limit: number): Promise<FeedItem[]> {
    const response = await fetch(`${env.WEB_API_BASE_URL}/feed?limit=${limit}`);
    if (!response.ok) return [];
    const parsed = await parseJsonResponse<FeedResponse>(response);
    if (!parsed?.items) return [];
    return parsed.items;
  }

  private async fetchPostDetails(postId: number): Promise<PostDetailsResponse | null> {
    const response = await fetch(`${env.WEB_API_BASE_URL}/post/${postId}`);
    if (!response.ok) return null;
    return await parseJsonResponse<PostDetailsResponse>(response);
  }

  private async fetchDaoShares(): Promise<DaoSharesResponse> {
    const response = await fetch(`${env.WEB_API_BASE_URL}/dao/shares`);
    if (!response.ok) {
      return { members: [], totalBonded: '0' };
    }

    const parsed = await parseJsonResponse<DaoSharesResponse>(response);
    if (!parsed?.members) {
      return { members: [], totalBonded: '0' };
    }

    return parsed;
  }

  private async fetchMemories(agent: Address): Promise<AgentMemoryItem[]> {
    const response = await fetch(`${env.WEB_API_BASE_URL}/agent/${agent.toLowerCase()}/memory?limit=${env.AGENT_MEMORY_LIMIT}`);
    if (!response.ok) return [];

    const parsed = await parseJsonResponse<AgentMemoryResponse>(response);
    if (!parsed?.items) return [];
    return parsed.items;
  }

  private async buildContext(account: Address): Promise<AgentContext> {
    const [feed, daoShares, memories] = await Promise.all([
      this.fetchFeed(env.AGENT_CONTEXT_FEED_LIMIT),
      this.fetchDaoShares(),
      this.fetchMemories(account),
    ]);

    const postIds = [...new Set(feed.slice(0, 6).map((item) => item.id))];
    const postEntries = await Promise.all(
      postIds.map(async (postId) => {
        const details = await this.fetchPostDetails(postId);
        return { postId, details };
      }),
    );

    const postDetails: Record<number, PostDetailsResponse> = {};
    for (const entry of postEntries) {
      if (entry.details) {
        postDetails[entry.postId] = entry.details;
      }
    }

    const pendingActionIds = [...new Set(feed.filter((item) => item.action_status === 'CREATED').map((item) => item.action_id))]
      .filter((value): value is number => typeof value === 'number')
      .filter((actionId) => !this.votedActions.has(actionId));

    const selfShare = daoShares.members.find((member) => member.address.toLowerCase() === account.toLowerCase()) ?? null;

    return {
      feed,
      postDetails,
      pendingActionIds,
      daoShares: daoShares.members,
      selfShare,
      memories,
    };
  }

  private async filterLivePendingActions(publicClient: any, actionIds: number[]): Promise<number[]> {
    const unique = [...new Set(actionIds)];
    const checked = await Promise.all(
      unique.map(async (actionId) => {
        try {
          const exists = (await publicClient.readContract({
            address: env.ACTION_EXECUTOR_ADDRESS as Address,
            abi: actionExecutorAbi,
            functionName: 'actionExists',
            args: [BigInt(actionId)],
          })) as boolean;

          return exists ? actionId : null;
        } catch {
          return null;
        }
      }),
    );

    return checked.filter((value): value is number => typeof value === 'number');
  }

  private async decideNextAction(account: Address, context: AgentContext): Promise<AgentDecision> {
    const feedSummary = context.feed.slice(0, 15).map((item) => ({
      id: item.id,
      author: item.author,
      title: item.post_title,
      postType: item.post_type === 1 ? 'ACTION' : 'DISCUSSION',
      actionId: item.action_id,
      actionStatus: item.action_status,
      commentCount: item.comment_count,
      bodyPreview: item.body ? item.body.slice(0, 180) : null,
    }));

    const postDetailSummary = Object.entries(context.postDetails).map(([postId, details]) => ({
      postId: Number(postId),
      commentCount: details.comments.length,
      comments: details.comments.slice(0, 5).map((comment) => ({
        id: comment.id,
        author: comment.author,
        body: comment.body?.slice(0, 240) ?? null,
      })),
      action: details.action
        ? {
            id: details.action.id,
            status: details.action.status,
            type: details.action.type,
            proposer: details.action.proposer,
          }
        : null,
      votes: (details.votes ?? []).slice(0, 8).map((vote) => ({
        voter: vote.voter,
        support: vote.support,
        stakeAmount: vote.stake_amount,
      })),
    }));

    const daoShareSummary = context.daoShares.slice(0, 12).map((member) => ({
      address: member.address,
      handle: member.handle,
      bondedSharePct: member.bondedSharePct,
      bondedBalance: member.bondedBalance,
      availableBalance: member.availableBalance,
      totalVotedStake: member.totalVotedStake,
    }));

    const memorySummary = context.memories.slice(0, 20).map((memory) => ({
      type: memory.memory_type,
      text: memory.memory_text,
      createdAt: memory.created_at,
    }));

    const promptPayload = {
      now: new Date().toISOString(),
      agent: {
        name: this.name,
        address: account,
        holderProfile: this.holderProfile,
        share: context.selfShare,
      },
      pendingActionIds: context.pendingActionIds,
      daoShares: daoShareSummary,
      feed: feedSummary,
      postDetails: postDetailSummary,
      memories: memorySummary,
      constraints: {
        maxOneOnchainActionPerTick: true,
        canDo: ['idle', 'post', 'comment', 'propose_action', 'vote'],
      },
    };

    const systemPrompt = [
      `You are ${this.name}, an autonomous DAO ambassador acting for a human crypto holder.`,
      `Primary objective: represent that holder's interests in governance debates and execution decisions.`,
      `Use DAO share distribution to guide negotiation strategy: identify who can block/pass decisions and build coalitions explicitly.`,
      `You may choose exactly one on-chain action this tick: idle, post, comment, propose_action, or vote.`,
      `Prefer substantive negotiation over spam. Use specific references to current posts/actions/votes when possible.`,
      `Return only strict JSON with fields: plan, rationale, memory, and optional post/comment/action/vote objects.`,
      `Do not include markdown fences.`,
    ].join('\n');

    try {
      const completion = await openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        temperature: env.OPENAI_TEMPERATURE,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(promptPayload) },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = parseJsonObject(raw);
      const decision = agentDecisionSchema.safeParse(parsed);
      if (decision.success) {
        return decision.data;
      }

      const firstIssue = decision.error.issues[0];
      console.warn(
        `[agent:${this.name}] ai decision parse failed (${firstIssue?.path?.join('.') ?? 'unknown'}: ${firstIssue?.message ?? 'invalid'}), using fallback`,
      );
      return this.fallbackDecision(context);
    } catch (error) {
      console.warn(`[agent:${this.name}] ai decision request failed: ${errorMessage(error)}`);
      return this.fallbackDecision(context);
    }
  }

  private fallbackDecision(context: AgentContext): AgentDecision {
    if (context.pendingActionIds.length > 0) {
      return {
        plan: 'vote',
        rationale: 'Fallback: support pending action for liveness.',
        vote: {
          actionId: context.pendingActionIds[0],
          support: true,
          stakeAmount: '70000000',
        },
      };
    }

    if (context.feed.length > 0) {
      if (this.tickCount % 2 === 0) {
        return {
          plan: 'comment',
          rationale: 'Fallback: keep negotiations active by commenting.',
          comment: {
            postId: context.feed[0]?.id,
            body: this.buildFallbackCommentBody(context.feed[0]?.post_title ?? null),
          },
        };
      }

      return {
        plan: 'post',
        rationale: 'Fallback: add a fresh governance discussion thread.',
      };
    }

    return {
      plan: 'post',
      rationale: 'Fallback: bootstrap first thread when feed is empty.',
    };
  }

  private async writeContractWithRetry(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    request: Record<string, unknown>,
    label: string,
  ): Promise<`0x${string}`> {
    for (const [attemptIndex, feeBumpBps] of TX_RETRY_FEE_BUMPS_BPS.entries()) {
      const feeEstimate = await publicClient.estimateFeesPerGas();
      const nonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: 'pending',
      });

      const feeOverrides =
        feeEstimate.maxFeePerGas !== null &&
        feeEstimate.maxFeePerGas !== undefined &&
        feeEstimate.maxPriorityFeePerGas !== null &&
        feeEstimate.maxPriorityFeePerGas !== undefined
          ? {
              maxFeePerGas: bumpByBps(feeEstimate.maxFeePerGas, feeBumpBps),
              maxPriorityFeePerGas: bumpByBps(feeEstimate.maxPriorityFeePerGas, feeBumpBps),
            }
          : feeEstimate.gasPrice !== null && feeEstimate.gasPrice !== undefined
            ? {
                gasPrice: bumpByBps(feeEstimate.gasPrice, feeBumpBps),
              }
            : {};

      try {
        return await walletClient.writeContract({
          ...request,
          account,
          chain: walletClient.chain,
          nonce,
          ...feeOverrides,
        });
      } catch (error) {
        const exhausted = attemptIndex === TX_RETRY_FEE_BUMPS_BPS.length - 1;
        if (!isNonceConflictError(error) || exhausted) {
          throw error;
        }

        const nextBumpBps = TX_RETRY_FEE_BUMPS_BPS[attemptIndex + 1] ?? feeBumpBps;
        console.warn(`[agent:${this.name}] ${label} nonce conflict; retrying with ${nextBumpBps} bps fee bump`);
        await sleep(TX_RETRY_DELAY_MS * (attemptIndex + 1));
      }
    }

    throw new Error(`Unable to submit ${label} transaction`);
  }

  private async isRegistered(publicClient: any, account: Address): Promise<boolean> {
    const profile = await publicClient.readContract({
      address: env.AGENT_REGISTRY_ADDRESS as Address,
      abi: agentRegistryAbi,
      functionName: 'profiles',
      args: [account],
    });

    return profile[5] as boolean;
  }

  private async getNonceWindow(publicClient: any, account: Address): Promise<{ latest: number; pending: number }> {
    const [latest, pending] = await Promise.all([
      publicClient.getTransactionCount({
        address: account,
        blockTag: 'latest',
      }),
      publicClient.getTransactionCount({
        address: account,
        blockTag: 'pending',
      }),
    ]);

    return {
      latest: Number(latest),
      pending: Number(pending),
    };
  }

  private async ensureRegistered(publicClient: any, walletClient: any, account: AgentAccount): Promise<void> {
    if (await this.isRegistered(publicClient, account.address)) {
      return;
    }

    const handle = `${this.name}-${account.address.slice(2, 6).toLowerCase()}`;
    const metadataCIDHash = keccak256(toHex(`agent:${handle}`));
    const nonceWindow = await this.getNonceWindow(publicClient, account.address);
    if (nonceWindow.pending > nonceWindow.latest) {
      console.log(
        `[agent:${this.name}] registration pending for ${account.address} ` +
          `(latest=${nonceWindow.latest}, pending=${nonceWindow.pending}); waiting`,
      );
      return;
    }

    const txHash = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      {
        address: env.AGENT_REGISTRY_ADDRESS as Address,
        abi: agentRegistryAbi,
        functionName: 'registerAgent',
        args: [account.address, handle, metadataCIDHash],
      },
      'registerAgent',
    );

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[agent:${this.name}] registered ${account.address}`);
  }

  private async maybeCreateDiscussionPost(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const [availableStake, postBondMin] = await Promise.all([
      publicClient.readContract({
        address: env.STAKE_VAULT_ADDRESS as Address,
        abi: stakeVaultAbi,
        functionName: 'availableBalance',
        args: [account.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: env.STAKE_VAULT_ADDRESS as Address,
        abi: stakeVaultAbi,
        functionName: 'postBondMin',
        args: [],
      }) as Promise<bigint>,
    ]);

    if (availableStake < postBondMin) {
      return `discussion skipped: available stake ${availableStake.toString()} below postBondMin ${postBondMin.toString()}`;
    }

    const draft = decision.post ?? this.buildFallbackDiscussionDraft(context);
    const contentHash = keccak256(toHex(this.composePostContent(draft.title, draft.body)));

    const txHash = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      {
        address: env.FORUM_ADDRESS as Address,
        abi: forumAbi,
        functionName: 'createPost',
        args: [contentHash, 0, '0x'],
      },
      'createPost',
    );

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    await this.persistPostBody(contentHash, draft.title, draft.body, account.address, txHash);
    return `discussion created tx=${txHash}`;
  }

  private async maybeCreateComment(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const decisionPostId = decision.comment?.postId;
    const fallbackPost =
      context.feed.find((item) => item.author.toLowerCase() !== account.address.toLowerCase()) ?? context.feed[0] ?? null;

    const targetPostId = decisionPostId ?? fallbackPost?.id;
    if (!targetPostId) {
      return 'comment skipped: no post targets available';
    }

    const targetPost = context.feed.find((item) => item.id === targetPostId) ?? null;
    const details = context.postDetails[targetPostId] ?? (await this.fetchPostDetails(targetPostId));
    const commentPool = details?.comments ?? [];

    let parentCommentId: number | null = null;
    if (decision.comment?.replyToCommentId) {
      const exists = commentPool.some((comment) => comment.id === decision.comment?.replyToCommentId);
      parentCommentId = exists ? decision.comment.replyToCommentId ?? null : null;
    } else if (commentPool.length > 0 && this.tickCount % 2 === 0) {
      parentCommentId = commentPool[0]?.id ?? null;
    }

    const body = decision.comment?.body?.trim() || this.buildFallbackCommentBody(targetPost?.post_title ?? null);
    const contentHash = keccak256(toHex(body));

    const txHash = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      {
        address: env.FORUM_ADDRESS as Address,
        abi: forumAbi,
        functionName: 'comment',
        args: [BigInt(targetPostId), contentHash],
      },
      'comment',
    );

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const commentId = this.extractCommentId(receipt);
    if (commentId === null) {
      return `comment submitted on post ${targetPostId} (comment id decode failed)`;
    }

    await this.persistCommentBody(commentId, targetPostId, parentCommentId, contentHash, body, account.address, txHash);
    return `comment created post=${targetPostId} comment=${commentId}`;
  }

  private async maybeCreateAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
  ): Promise<string> {
    const [availableStake, actionBondMin] = await Promise.all([
      publicClient.readContract({
        address: env.STAKE_VAULT_ADDRESS as Address,
        abi: stakeVaultAbi,
        functionName: 'availableBalance',
        args: [account.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: env.STAKE_VAULT_ADDRESS as Address,
        abi: stakeVaultAbi,
        functionName: 'actionBondMin',
        args: [],
      }) as Promise<bigint>,
    ]);

    if (availableStake < actionBondMin) {
      return `action skipped: available stake ${availableStake.toString()} below actionBondMin ${actionBondMin.toString()}`;
    }

    const actionConfig = decision.action;
    const amountIn = toSafeBigInt(actionConfig?.amountInUSDC, 50_000_000n);
    const minAmountOut = 1n;
    const slippageBps = clampInt(actionConfig?.slippageBps, 100, 1, 2000);
    const deadlineSeconds = clampInt(actionConfig?.deadlineSeconds, 60 * 60, 300, 24 * 60 * 60);
    const tokenOut = isAddress(actionConfig?.tokenOut) ? actionConfig.tokenOut : this.tokenOut;

    const draftResponse = await fetch(`${env.WEB_API_BASE_URL}/actions/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        proposer: account.address,
        tokenOut,
        amountInUSDC: amountIn.toString(),
        slippageBps,
        deadlineSeconds,
      }),
    });

    if (!draftResponse.ok) {
      return `action draft failed: ${await draftResponse.text()}`;
    }

    const draft = await parseJsonResponse<{ calldataHash?: `0x${string}` }>(draftResponse);
    if (!draft?.calldataHash) {
      return 'action draft failed: invalid JSON payload';
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
    const simulation = await publicClient.simulateContract({
      account,
      address: env.ACTION_EXECUTOR_ADDRESS as Address,
      abi: actionExecutorAbi,
      functionName: 'createAction',
      args: [0n, tokenOut, amountIn, minAmountOut, deadline, draft.calldataHash],
    });

    const actionTx = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      {
        ...simulation.request,
      },
      'createAction',
    );

    await publicClient.waitForTransactionReceipt({ hash: actionTx });
    const actionId = simulation.result as bigint;
    const actionRef = encodeAbiParameters([{ type: 'uint256' }], [actionId]);

    const actionPost = this.buildActionPostDraft(actionId, actionConfig?.rationale ?? decision.rationale ?? '', amountIn);
    const actionPostHash = keccak256(toHex(this.composePostContent(actionPost.title, actionPost.body)));

    const postTx = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      {
        address: env.FORUM_ADDRESS as Address,
        abi: forumAbi,
        functionName: 'createPost',
        args: [actionPostHash, 1, actionRef],
      },
      'createActionPost',
    );

    await publicClient.waitForTransactionReceipt({ hash: postTx });
    await this.persistPostBody(actionPostHash, actionPost.title, actionPost.body, account.address, postTx);
    return `action proposed id=${actionId.toString()}`;
  }

  private async maybeVoteAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const requestedActionId = decision.vote?.actionId;
    const targetActionId =
      (requestedActionId && context.pendingActionIds.includes(requestedActionId) ? requestedActionId : context.pendingActionIds[0]) ??
      null;

    if (targetActionId === null) {
      return 'vote skipped: no pending actions';
    }

    if (this.votedActions.has(targetActionId)) {
      return `vote skipped: already voted action ${targetActionId}`;
    }

    const availableStake = (await publicClient.readContract({
      address: env.STAKE_VAULT_ADDRESS as Address,
      abi: stakeVaultAbi,
      functionName: 'availableBalance',
      args: [account.address],
    })) as bigint;

    if (availableStake <= 0n) {
      return 'vote skipped: no available stake';
    }

    const requestedStake = toSafeBigInt(decision.vote?.stakeAmount, 70_000_000n);
    const stakeAmount = requestedStake > availableStake ? availableStake : requestedStake;
    if (stakeAmount <= 0n) {
      return 'vote skipped: computed stake amount is zero';
    }

    const support = decision.vote?.support ?? true;

    const simulation = await publicClient.simulateContract({
      account,
      address: env.FORUM_ADDRESS as Address,
      abi: forumAbi,
      functionName: 'voteAction',
      args: [BigInt(targetActionId), support, stakeAmount],
    });

    const txHash = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      {
        ...simulation.request,
      },
      'voteAction',
    );

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    this.votedActions.add(targetActionId);
    return `voted action=${targetActionId} support=${String(support)} stake=${stakeAmount.toString()}`;
  }

  private async executeDecision(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    switch (decision.plan) {
      case 'idle':
        return `idle: ${decision.rationale ?? 'no-op this tick'}`;
      case 'post':
        return await this.maybeCreateDiscussionPost(publicClient, walletClient, account, decision, context);
      case 'comment':
        return await this.maybeCreateComment(publicClient, walletClient, account, decision, context);
      case 'propose_action':
        return await this.maybeCreateAction(publicClient, walletClient, account, decision);
      case 'vote':
        return await this.maybeVoteAction(publicClient, walletClient, account, decision, context);
      default:
        return 'idle: unknown plan';
    }
  }

  private async runAIGovernanceTick(publicClient: any, walletClient: any, account: AgentAccount): Promise<void> {
    const context = await this.buildContext(account.address);
    const livePendingActionIds = await this.filterLivePendingActions(publicClient, context.pendingActionIds);
    if (livePendingActionIds.length !== context.pendingActionIds.length) {
      console.log(
        `[agent:${this.name}] filtered stale pending actions ${JSON.stringify(context.pendingActionIds)} -> ${JSON.stringify(livePendingActionIds)}`,
      );
    }
    context.pendingActionIds = livePendingActionIds;

    const topHolders = context.daoShares
      .slice(0, 3)
      .map((member) => `${member.handle ?? member.address.slice(0, 10)}:${member.bondedSharePct}%`)
      .join(', ');

    await this.persistMemory(account.address, {
      memoryType: 'observation',
      referenceType: 'tick',
      referenceId: `${Date.now()}`,
      text: `Observed ${context.feed.length} posts, ${context.pendingActionIds.length} pending actions, top shares [${topHolders || 'none'}].`,
      metadata: {
        tick: this.tickCount,
        pendingActionIds: context.pendingActionIds,
        selfSharePct: context.selfShare?.bondedSharePct ?? 0,
      },
    });

    const decision = await this.decideNextAction(account.address, context);
    await this.persistMemory(account.address, {
      memoryType: 'decision',
      referenceType: decision.plan,
      text: `Plan=${decision.plan}; rationale=${decision.rationale ?? 'none'}`,
      metadata: {
        plan: decision.plan,
        rationale: decision.rationale ?? null,
      },
    });

    for (const memory of decision.memory ?? []) {
      await this.persistMemory(account.address, {
        memoryType: 'observation',
        referenceType: 'llm_memory',
        text: memory,
      });
    }

    const outcome = await this.executeDecision(publicClient, walletClient, account, decision, context);
    await this.persistMemory(account.address, {
      memoryType: 'outcome',
      referenceType: decision.plan,
      text: outcome,
    });
    console.log(`[agent:${this.name}] ${outcome}`);
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
    const probeClient: any = createPublicClient({ chain: base, transport: rpcTransport(rpcUrl) });
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
    const client: any = createPublicClient({ chain: network.chain, transport: rpcTransport(network.rpcUrl) });
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
  const client: any = createPublicClient({ chain: network.chain, transport: rpcTransport(network.rpcUrl) });
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

function buildHolderProfile(index: number): string {
  const profiles = [
    'Conservative holder prioritizing treasury safety and stable execution quality.',
    'Growth-oriented holder accepting measured risk for upside and faster iteration.',
    'Income-focused DeFi holder prioritizing predictable outcomes and downside protection.',
    'Active governance participant who values transparency, coalition-building, and accountability.',
  ];

  return profiles[index % profiles.length] ?? profiles[0];
}

async function main() {
  assertContractsConfigured();
  const network = await resolveRuntimeNetwork();
  await assertContractsDeployed(network);

  const privateKeys = buildPrivateKeys();
  const addresses = privateKeys.map((privateKey) => privateKeyToAccount(privateKey).address.toLowerCase());
  const duplicateAddresses = addresses.filter((address, index) => addresses.indexOf(address) !== index);
  if (duplicateAddresses.length > 0) {
    const unique = [...new Set(duplicateAddresses)];
    console.warn(
      `[agent-runtime] duplicate agent private keys detected for address(es): ${unique.join(', ')}; ` +
        'shared nonces will be managed, but using unique keys per agent is recommended.',
    );
  }

  const tokenOut = (env.TOKEN_OUT_ADDRESS ?? '0x4200000000000000000000000000000000000006') as Address;
  const runners = privateKeys.map(
    (privateKey, index) =>
      new AgentRunner(
        `agent${index + 1}`,
        privateKey,
        tokenOut,
        buildHolderProfile(index),
        network.chain,
        network.rpcUrl,
      ),
  );

  console.log(
    `[agent-runtime] starting ${runners.length} AI agents on chain ${network.chainId} via ${rpcHost(network.rpcUrl)} (${network.source})`,
  );

  let running = false;
  const runAll = async () => {
    if (running) {
      console.warn('[agent-runtime] previous tick is still running; skipping this interval');
      return;
    }

    running = true;
    try {
      for (const runner of runners) {
        try {
          await runner.tick();
        } catch (error) {
          console.error('[agent-runtime] agent tick failed', error);
        }
      }
    } finally {
      running = false;
    }
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
