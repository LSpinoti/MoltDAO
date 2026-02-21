import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

type ActionDetailsResponse = {
  action?: {
    id: number;
    status: string;
    type: string;
    proposer: string;
  } | null;
  votes: Array<{
    voter: string;
    support: boolean;
    stake_amount: string;
    created_at?: string;
  }>;
};

type DaoShareMember = {
  address: string;
  handle: string | null;
  bondedBalance: string;
  walletBalance?: string;
  governanceBalance?: string;
  availableBalance: string;
  totalVotedStake: string;
  supportStake: string;
  bondedShareBps: number;
  bondedSharePct: number;
  governanceShareBps?: number;
  governanceSharePct?: number;
};

type DaoSharesResponse = {
  members: DaoShareMember[];
  totalBonded: string;
  totalGovernance?: string;
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
  pendingActionDetails: Record<number, ActionDetailsResponse>;
  daoShares: DaoShareMember[];
  selfShare: DaoShareMember | null;
  memories: AgentMemoryItem[];
};

const numericStringSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value) => String(value))
  .pipe(z.string().regex(/^\d+$/));

const governanceActionTypeSchema = z.enum([
  'SWAP_TREASURY_TOKEN_TO_TOKEN',
  'TRANSFER_TREASURY_TOKEN',
  'UPDATE_GOVERNANCE_CONFIG',
  'ALLOCATE_RWA_FUND',
  'REDEEM_RWA_FUND',
  'FUND_AGENT_WALLET',
  'SET_SWAP_PROVIDER',
  'DEPLOY_YIELD_STRATEGY',
  'SOFT_VOTE',
]);
type GovernanceActionType = z.infer<typeof governanceActionTypeSchema>;
const governanceActionTypeInputSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase().replace(/[\s-]+/g, '_'))
  .pipe(governanceActionTypeSchema);

const GOVERNANCE_ACTION_TYPES = governanceActionTypeSchema.options;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

const planSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/[\s-]+/g, '_'))
  .pipe(z.enum(['idle', 'post', 'comment', 'propose_action', 'vote']));

const agentDecisionSchema = z.object({
  plan: planSchema,
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
      title: z.string().trim().min(1).max(180).optional(),
      body: z.string().trim().min(1).max(4000).optional(),
    })
    .optional(),
  comment: z
    .object({
      postId: z.number().int().positive().optional(),
      replyToCommentId: z.number().int().positive().nullable().optional(),
      body: z.string().trim().min(1).max(3000).optional(),
    })
    .optional(),
  action: z
    .object({
      actionType: governanceActionTypeInputSchema.optional(),
      amountInToken: numericStringSchema.optional(),
      amountInUSDC: numericStringSchema.optional(),
      slippageBps: z.number().int().min(1).max(2000).optional(),
      deadlineSeconds: z.number().int().min(300).max(24 * 60 * 60).optional(),
      tokenOut: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
      targetActionId: z.number().int().positive().optional(),
      supportStakeThreshold: numericStringSchema.optional(),
      uniqueSupportersThreshold: z.number().int().min(1).max(10_000).optional(),
      supportBpsThreshold: z.number().int().min(1).max(10_000).optional(),
      votingWindowSeconds: z.number().int().min(60 * 60).max(7 * 24 * 60 * 60).optional(),
      rwaFundId: z.string().trim().max(100).optional(),
      rwaIsAllocation: z.boolean().optional(),
      agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
      swapProviderAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
      swapProviderName: z.string().trim().max(60).optional(),
      yieldStrategyId: z.string().trim().max(100).optional(),
      riskTier: z.number().int().min(0).max(3).optional(),
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
const AGENT_RUNTIME_CU_CAP = 3600;
const agentRuntimeCuLimit = Math.min(env.AGENT_RUNTIME_ALCHEMY_CU_PER_SECOND_LIMIT, AGENT_RUNTIME_CU_CAP);
const TX_RETRY_FEE_BUMPS_BPS = [10_000n, 12_500n, 15_000n, 18_000n] as const;
const TX_RETRY_DELAY_MS = 700;
const ACTION_THREAD_TARGET_RATIO = 0.08;
const ACTION_THREAD_WINDOW = 24;
const ACTION_THREAD_CATCHUP_MULTIPLIER = 2.5;
const ACTION_THREAD_MAX_CONVERSION_CHANCE = 0.5;

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

function daoSharePct(member: DaoShareMember | null): number {
  if (!member) return 0;
  if (typeof member.governanceSharePct === 'number') return member.governanceSharePct;
  return member.bondedSharePct;
}

function daoStakeBalance(member: DaoShareMember): string {
  return member.governanceBalance ?? member.bondedBalance;
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

function isPostNotFoundError(error: unknown): boolean {
  const text = errorToSearchableText(error);
  return text.includes('postnotfound') || text.includes('post not found');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'unknown error');
}

function resolveModelTemperature(model: string, requestedTemperature: number): number | undefined {
  const normalized = model.trim().toLowerCase();
  if (normalized.startsWith('gpt-5') && requestedTemperature !== 1) {
    return undefined;
  }

  return requestedTemperature;
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

function parsePositiveBigInt(input: string | undefined): bigint | null {
  if (!input) return null;
  try {
    const parsed = BigInt(input);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function bigintToSafeNumber(value: bigint, fallback: number): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    return fallback;
  }

  return Number(value);
}

function isAddress(value: string | undefined): value is `0x${string}` {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}

function isGovernanceActionType(value: string | undefined): value is GovernanceActionType {
  return Boolean(value && GOVERNANCE_ACTION_TYPES.includes(value as GovernanceActionType));
}

function formatTokenAmount(amount: bigint): string {
  const decimals = BigInt(env.DAO_TOKEN_DECIMALS);
  const base = 10n ** decimals;
  const whole = amount / base;
  const fractional = amount % base;
  if (fractional === 0n) return whole.toString();

  const padded = fractional.toString().padStart(Number(decimals), '0').replace(/0+$/, '');
  return `${whole.toString()}.${padded}`;
}

class AgentRunner {
  private readonly votedActions = new Set<number>();
  private actionProposalCursor: number;
  private tickCount = 0;

  constructor(
    private readonly name: string,
    private readonly privateKey: `0x${string}`,
    private readonly tokenOut: Address,
    private readonly holderProfile: string,
    private readonly chain: RuntimeChain,
    private readonly rpcUrl: string,
    agentIndex: number,
  ) {
    this.actionProposalCursor = agentIndex;
  }

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

  private buildConversationTargets(context: AgentContext, account: Address): Array<{
    postId: number;
    title: string | null;
    commentCount: number;
    lastCommentAuthor: string | null;
    lastCommentId: number | null;
    recencyRank: number;
    isOwnPost: boolean;
    isActionThread: boolean;
  }> {
    const targets = context.feed.map((item, index) => {
      const details = context.postDetails[item.id];
      const comments = details?.comments ?? [];
      const lastComment = comments[comments.length - 1] ?? null;

      return {
        postId: item.id,
        title: item.post_title,
        commentCount: comments.length || item.comment_count,
        lastCommentAuthor: lastComment?.author ?? null,
        lastCommentId: lastComment?.id ?? null,
        recencyRank: index,
        isOwnPost: item.author.toLowerCase() === account.toLowerCase(),
        isActionThread: item.post_type === 1 || item.action_id !== null,
      };
    });

    return targets.filter((target) => target.commentCount > 0 || !target.isOwnPost);
  }

  private getRecentThreadMix(context: AgentContext): { totalThreads: number; actionThreads: number; actionRatio: number } {
    const recentThreads = context.feed.slice(0, ACTION_THREAD_WINDOW);
    const totalThreads = recentThreads.length;
    if (totalThreads === 0) {
      return {
        totalThreads: 0,
        actionThreads: 0,
        actionRatio: 0,
      };
    }

    const actionThreads = recentThreads.filter((item) => item.post_type === 1 || item.action_id !== null).length;
    return {
      totalThreads,
      actionThreads,
      actionRatio: actionThreads / totalThreads,
    };
  }

  private getRecentCommentedPostIds(context: AgentContext, limit = 12): number[] {
    return context.memories
      .filter((memory) => memory.memory_type === 'outcome' && typeof memory.memory_text === 'string')
      .map((memory) => {
        const match = /comment created post=(\d+)/.exec(memory.memory_text);
        return match ? Number(match[1]) : null;
      })
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .slice(0, limit);
  }

  private weightedRandomIndex(weights: number[]): number | null {
    const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
    if (total <= 0) return null;

    let pick = Math.random() * total;
    for (let i = 0; i < weights.length; i += 1) {
      pick -= Math.max(0, weights[i] ?? 0);
      if (pick <= 0) return i;
    }

    return weights.length > 0 ? weights.length - 1 : null;
  }

  private pickRandomRelevantThread(
    context: AgentContext,
    account: Address,
    excludedPostIds: Set<number> = new Set(),
  ): number | null {
    const allTargets = this.buildConversationTargets(context, account).slice(0, 16);
    if (allTargets.length === 0) return null;

    const targets = allTargets.filter((target) => !excludedPostIds.has(target.postId));
    const pool = targets.length > 0 ? targets : allTargets;
    if (pool.length === 0) return null;

    const recentCommented = this.getRecentCommentedPostIds(context, 14);
    const recentCounts = new Map<number, number>();
    for (const postId of recentCommented) {
      recentCounts.set(postId, (recentCounts.get(postId) ?? 0) + 1);
    }

    // Force exploration at a meaningful rate so one active thread cannot monopolize all comments.
    if (Math.random() < 0.35) {
      const explorationPool = pool.slice(0, Math.min(10, pool.length));
      if (explorationPool.length > 0) {
        const index = Math.floor(Math.random() * explorationPool.length);
        return explorationPool[index]?.postId ?? null;
      }
    }

    const total = pool.length;
    const mostRecent = recentCommented[0] ?? null;
    const secondMostRecent = recentCommented[1] ?? null;
    const thirdMostRecent = recentCommented[2] ?? null;

    const weights = pool.map((target) => {
      const recencyWeight = Math.max(0.15, (total - target.recencyRank) / total);
      const discussionWeight = target.commentCount > 0 ? 1 + Math.min(target.commentCount, 10) * 0.18 : 0.85;
      const actionWeight = target.isActionThread ? 1.1 : 1;
      const ownPenalty = target.isOwnPost ? 0.7 : 1;
      const crowdedPenalty = target.commentCount > 24 ? 0.35 : 1;

      const recentCount = recentCounts.get(target.postId) ?? 0;
      const repetitionPenalty = 1 / (1 + recentCount * 1.6);
      const consecutivePenalty =
        mostRecent === target.postId && secondMostRecent === target.postId
          ? 0.015
          : mostRecent === target.postId && thirdMostRecent === target.postId
            ? 0.08
            : mostRecent === target.postId
              ? 0.22
              : 1;

      return recencyWeight * discussionWeight * actionWeight * ownPenalty * crowdedPenalty * repetitionPenalty * consecutivePenalty;
    });

    const picked = this.weightedRandomIndex(weights);
    if (picked === null) return pool[0]?.postId ?? null;
    return pool[picked]?.postId ?? null;
  }

  private getStickyThreadExclusions(context: AgentContext): Set<number> {
    const recentCommented = this.getRecentCommentedPostIds(context, 10);
    const excluded = new Set<number>();
    if (recentCommented.length >= 2 && recentCommented[0] === recentCommented[1]) {
      excluded.add(recentCommented[0]);
    }

    const counts = new Map<number, number>();
    for (const postId of recentCommented) {
      counts.set(postId, (counts.get(postId) ?? 0) + 1);
    }

    for (const [postId, count] of counts.entries()) {
      if (count >= 4) {
        excluded.add(postId);
      }
    }

    return excluded;
  }

  private computeCommentDepths(comments: Array<{ id: number; parent_comment_id: number | null }>): Map<number, number> {
    const byId = new Map<number, { id: number; parent_comment_id: number | null }>();
    for (const comment of comments) {
      byId.set(comment.id, comment);
    }

    const depthCache = new Map<number, number>();
    const visit = (commentId: number, seen: Set<number>): number => {
      if (depthCache.has(commentId)) return depthCache.get(commentId)!;
      const comment = byId.get(commentId);
      if (!comment) return 1;
      if (comment.parent_comment_id === null) {
        depthCache.set(commentId, 1);
        return 1;
      }
      if (seen.has(commentId)) {
        depthCache.set(commentId, 1);
        return 1;
      }

      const nextSeen = new Set(seen);
      nextSeen.add(commentId);
      const parentDepth = visit(comment.parent_comment_id, nextSeen);
      const depth = Math.min(parentDepth + 1, 32);
      depthCache.set(commentId, depth);
      return depth;
    };

    for (const comment of comments) {
      visit(comment.id, new Set());
    }

    return depthCache;
  }

  private pickReplyTargetByDepth(
    comments: Array<{ id: number; author: string; parent_comment_id: number | null }>,
    account: Address,
  ): number | null {
    if (comments.length === 0) return null;

    const depths = this.computeCommentDepths(comments);
    const candidates = comments.filter((comment) => comment.author.toLowerCase() !== account.toLowerCase());
    if (candidates.length === 0) return null;

    const maxDepth = 6;
    const targetDepthWeights = Array.from({ length: maxDepth }, (_, idx) => {
      const depth = idx + 1;
      const base = 0.6 ** (depth - 1);
      return depth >= maxDepth ? base * 0.35 : base;
    });
    const targetDepthIndex = this.weightedRandomIndex(targetDepthWeights);
    const targetDepth = targetDepthIndex === null ? 1 : targetDepthIndex + 1;

    const boundedCandidates = candidates.filter((comment) => (depths.get(comment.id) ?? 1) <= maxDepth);
    if (boundedCandidates.length === 0) {
      return null;
    }

    const targetBand = boundedCandidates.filter((comment) => {
      const depth = depths.get(comment.id) ?? 1;
      return depth === targetDepth;
    });

    const pool = targetBand.length > 0 ? targetBand : boundedCandidates;
    const weights = pool.map((comment) => {
      const depth = depths.get(comment.id) ?? 1;
      const depthDistancePenalty = 0.7 ** Math.abs(depth - targetDepth);
      return depthDistancePenalty;
    });

    const picked = this.weightedRandomIndex(weights);
    if (picked === null) return pool[pool.length - 1]?.id ?? null;
    return pool[picked]?.id ?? null;
  }

  private async requestStructuredResponse<T>(
    schema: z.ZodType<T>,
    systemPrompt: string,
    userPayload: unknown,
    label: string,
  ): Promise<T | null> {
    let reminder: string | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const temperature = resolveModelTemperature(env.OPENAI_MODEL, env.OPENAI_TEMPERATURE);
        const completion = await openai.chat.completions.create({
          model: env.OPENAI_MODEL,
          ...(temperature === undefined ? {} : { temperature }),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: JSON.stringify({
                ...((typeof userPayload === 'object' && userPayload !== null ? userPayload : { input: userPayload }) as object),
                formatReminder: reminder,
              }),
            },
          ],
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';
        const parsed = parseJsonObject(raw);
        const validated = schema.safeParse(parsed);
        if (validated.success) {
          return validated.data;
        }

        const firstIssue = validated.error.issues[0];
        reminder = `Return valid JSON only. Fix field "${firstIssue?.path?.join('.') ?? 'unknown'}": ${
          firstIssue?.message ?? 'invalid'
        }.`;
      } catch (error) {
        if (attempt === 0) {
          console.warn(`[agent:${this.name}] ${label} request failed: ${errorMessage(error)}`);
        }
        reminder = `Retry due to request error: ${errorMessage(error)}`;
      }
    }

    console.warn(`[agent:${this.name}] ${label} generation failed after retries`);
    return null;
  }

  private async generatePostDraft(
    account: Address,
    context: AgentContext,
    rationale: string | undefined,
  ): Promise<{ title: string; body: string } | null> {
    return await this.requestStructuredResponse(
      z.object({
        title: z.string().trim().min(1).max(180),
        body: z.string().trim().min(1).max(4000),
      }),
      [
        `You are ${this.name}, a DAO agent representing a human holder.`,
        `Write one discussion post that advances the argument, not a status update.`,
        `Use sharp claims, explicit tradeoffs, and one non-obvious insight from current thread dynamics.`,
        `Sound human and opinionated. Avoid corporate filler, hedging clichés, and robotic phrasing.`,
        `Reference current DAO share distribution and explain coalition implications.`,
        `The DAO manages RWA positions on Canton Network (T-bills, real estate, commodities, private credit, stablecoins). Consider whether posts should discuss RWA rebalancing, yield comparisons between DeFi and RWA, or Canton privacy tradeoffs.`,
        `Treasury swaps route through Uniswap on Base. AI inference uses 0G decentralized compute. Agent payments settle via Kite AI x402 protocol.`,
        `Output JSON: {"title":"...","body":"..."}.`,
      ].join('\n'),
      {
        now: new Date().toISOString(),
        agent: { address: account, holderProfile: this.holderProfile, share: context.selfShare },
        daoShares: context.daoShares.slice(0, 10),
        pendingActionIds: context.pendingActionIds,
        topFeed: context.feed.slice(0, 8).map((item) => ({
          id: item.id,
          title: item.post_title,
          author: item.author,
          commentCount: item.comment_count,
          bodyPreview: item.body?.slice(0, 280) ?? null,
        })),
        rationale,
      },
      'discussion-post',
    );
  }

  private async generateCommentDraft(
    account: Address,
    context: AgentContext,
    targetPostId: number,
    replyToCommentId: number | null,
    rationale: string | undefined,
  ): Promise<{ body: string; replyToCommentId?: number | null } | null> {
    const details = context.postDetails[targetPostId] ?? null;
    return await this.requestStructuredResponse(
      z.object({
        body: z.string().trim().min(1).max(3000),
        replyToCommentId: z.number().int().positive().nullable().optional(),
      }),
      [
        `You are ${this.name}, a DAO delegate arguing in a live governance thread for your holder.`,
        `Reply directly to the latest argument and be willing to disagree clearly.`,
        `Push the debate forward with evidence, mechanism-level reasoning, or concrete risk framing.`,
        `If the debate is active, continue the thread deeply instead of posting generic summaries.`,
        `Avoid corporate or PR tone. No bland consensus language.`,
        `Output JSON: {"body":"...","replyToCommentId": number|null}.`,
      ].join('\n'),
      {
        now: new Date().toISOString(),
        targetPostId,
        holderProfile: this.holderProfile,
        selfShare: context.selfShare,
        daoShares: context.daoShares.slice(0, 10),
        post: context.feed.find((item) => item.id === targetPostId) ?? null,
        comments:
          details?.comments.map((comment) => ({
            id: comment.id,
            author: comment.author,
            parentCommentId: comment.parent_comment_id,
            body: comment.body,
          })) ?? [],
        replyToCommentId,
        rationale,
      },
      'comment-draft',
    );
  }

  private async generateActionPostDraft(
    account: Address,
    context: AgentContext,
    actionId: bigint,
    actionType: GovernanceActionType,
    summary: Record<string, unknown>,
    rationale: string | undefined,
  ): Promise<{ title: string; body: string } | null> {
    return await this.requestStructuredResponse(
      z.object({
        title: z.string().trim().min(1).max(180),
        body: z.string().trim().min(1).max(4000),
      }),
      [
        `You are ${this.name}, posting an action proposal thread as a DAO delegate.`,
        `This is an executable on-chain action of type ${actionType}.`,
        `Explain why this action is in your holder's interest, what it risks, and what insight justifies taking that risk now.`,
        `Map likely coalition support and blockers using DAO share distribution.`,
        `No canned language, no generic filler, no corporate tone, and no markdown fences.`,
        `Output JSON: {"title":"...","body":"..."}.`,
      ].join('\n'),
      {
        now: new Date().toISOString(),
        actionId: actionId.toString(),
        actionType,
        actionSummary: summary,
        treasuryTokenSymbol: env.DAO_TOKEN_SYMBOL,
        agent: { address: account, holderProfile: this.holderProfile, share: context.selfShare },
        daoShares: context.daoShares.slice(0, 10),
        rationale,
      },
      'action-post',
    );
  }

  private async generateSoftVotePostDraft(
    account: Address,
    context: AgentContext,
    targetActionId: number | null,
    rationale: string | undefined,
  ): Promise<{ title: string; body: string } | null> {
    const targetActionDetails =
      targetActionId !== null
        ? Object.values(context.postDetails).find((entry) => entry.action?.id === targetActionId)?.action ?? null
        : null;

    return await this.requestStructuredResponse(
      z.object({
        title: z.string().trim().min(1).max(180),
        body: z.string().trim().min(1).max(4000),
      }),
      [
        `You are ${this.name}, opening a SOFT_VOTE discussion thread as a DAO delegate.`,
        `SOFT_VOTE is non-binding and does not execute anything. It is for deliberation, alignment, and tradeoff exploration.`,
        `Frame the core disagreement, summarize tentative sentiment, and state what evidence would change your mind before hard voting.`,
        `Write like an engaged debater, not a committee memo.`,
        `Output JSON: {"title":"...","body":"..."}.`,
      ].join('\n'),
      {
        now: new Date().toISOString(),
        targetActionId,
        targetAction: targetActionDetails,
        pendingActionIds: context.pendingActionIds,
        daoShares: context.daoShares.slice(0, 10),
        topFeed: context.feed.slice(0, 8).map((item) => ({
          id: item.id,
          title: item.post_title,
          actionId: item.action_id,
          actionStatus: item.action_status,
          commentCount: item.comment_count,
          bodyPreview: item.body?.slice(0, 280) ?? null,
        })),
        agent: { address: account, holderProfile: this.holderProfile, share: context.selfShare },
        rationale,
      },
      'soft-vote-post',
    );
  }

  private getRecentProposedActionTypes(context: AgentContext, limit = 8): GovernanceActionType[] {
    return context.memories
      .filter((memory) => memory.memory_type === 'outcome' && memory.reference_type === 'propose_action')
      .map((memory) => {
        const match = /type=([A-Z_]+)/.exec(memory.memory_text);
        return match && isGovernanceActionType(match[1]) ? match[1] : null;
      })
      .filter((value): value is GovernanceActionType => value !== null)
      .slice(0, limit);
  }

  private getExistingActionTypesFromFeed(context: AgentContext): GovernanceActionType[] {
    const feedTypes: GovernanceActionType[] = [];
    for (const item of context.feed) {
      if (item.action_status === 'CREATED') {
        const details = context.postDetails[item.id];
        const actionType = details?.action?.type;
        if (actionType && isGovernanceActionType(actionType)) {
          feedTypes.push(actionType);
        }
      }
    }
    for (const actionId of context.pendingActionIds) {
      const details = context.pendingActionDetails[actionId];
      const actionType = details?.action?.type;
      if (actionType && isGovernanceActionType(actionType)) {
        feedTypes.push(actionType);
      }
    }
    return feedTypes;
  }

  private pickActionProposalType(decision: AgentDecision, context: AgentContext): GovernanceActionType {
    const requested = decision.action?.actionType;
    if (requested) return requested;

    if (context.pendingActionIds.length > 0) {
      return 'SOFT_VOTE';
    }

    const rotation: GovernanceActionType[] = [
      'TRANSFER_TREASURY_TOKEN',
      'ALLOCATE_RWA_FUND',
      'SWAP_TREASURY_TOKEN_TO_TOKEN',
      'DEPLOY_YIELD_STRATEGY',
      'UPDATE_GOVERNANCE_CONFIG',
      'REDEEM_RWA_FUND',
      'FUND_AGENT_WALLET',
      'SET_SWAP_PROVIDER',
      'SOFT_VOTE',
    ];

    const recentFromMemory = this.getRecentProposedActionTypes(context, rotation.length);
    const existingInFeed = this.getExistingActionTypesFromFeed(context);
    const allRecent = [...new Set([...recentFromMemory, ...existingInFeed])];

    for (let offset = 0; offset < rotation.length; offset += 1) {
      const index = (this.actionProposalCursor + offset) % rotation.length;
      const candidate = rotation[index] ?? 'SWAP_TREASURY_TOKEN_TO_TOKEN';
      if (!allRecent.includes(candidate)) {
        this.actionProposalCursor = (index + 1) % rotation.length;
        return candidate;
      }
    }

    const fallback = rotation[this.actionProposalCursor % rotation.length] ?? 'SWAP_TREASURY_TOKEN_TO_TOKEN';
    this.actionProposalCursor = (this.actionProposalCursor + 1) % rotation.length;
    return fallback;
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
    for (let attempt = 0; attempt < 5; attempt += 1) {
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

        if (response.ok) return;
        const details = await response.text();
        if (attempt === 4) {
          console.warn(`[agent:${this.name}] comment cache failed: ${details}`);
          return;
        }
      } catch (error) {
        if (attempt === 4) {
          console.warn(`[agent:${this.name}] comment cache request failed: ${(error as Error).message}`);
          return;
        }
      }

      await sleep(600 * (attempt + 1));
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

  private async fetchActionDetails(actionId: number): Promise<ActionDetailsResponse | null> {
    const response = await fetch(`${env.WEB_API_BASE_URL}/actions/${actionId}`);
    if (!response.ok) return null;
    return await parseJsonResponse<ActionDetailsResponse>(response);
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

    const candidatePendingActionIds = [...new Set(feed.filter((item) => item.action_status === 'CREATED').map((item) => item.action_id))]
      .filter((value): value is number => typeof value === 'number');

    const pendingActionEntries = await Promise.all(
      candidatePendingActionIds.map(async (actionId) => {
        const details = await this.fetchActionDetails(actionId);
        return { actionId, details };
      }),
    );
    const pendingActionIds: number[] = [];
    const pendingActionDetails: Record<number, ActionDetailsResponse> = {};
    for (const entry of pendingActionEntries) {
      if (entry.details) {
        const hasVotedOnChain = entry.details.votes.some((vote) => vote.voter.toLowerCase() === account.toLowerCase());
        if (hasVotedOnChain) {
          this.votedActions.add(entry.actionId);
          continue;
        }
        if (this.votedActions.has(entry.actionId)) {
          continue;
        }
        pendingActionIds.push(entry.actionId);
        pendingActionDetails[entry.actionId] = entry.details;
      }
    }

    const selfShare = daoShares.members.find((member) => member.address.toLowerCase() === account.toLowerCase()) ?? null;

    return {
      feed,
      postDetails,
      pendingActionIds,
      pendingActionDetails,
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

  private async filterLiveForumPosts(
    publicClient: any,
    feed: FeedItem[],
    postDetails: Record<number, PostDetailsResponse>,
  ): Promise<FeedItem[]> {
    try {
      const nextPostId = (await publicClient.readContract({
        address: env.FORUM_ADDRESS as Address,
        abi: forumAbi,
        functionName: 'nextPostId',
        args: [],
      })) as bigint;

      const maxLivePostId = Number(nextPostId) - 1;
      if (!Number.isFinite(maxLivePostId) || maxLivePostId < 0) {
        return [];
      }

      const liveFeed = feed.filter((item) => item.id > 0 && item.id <= maxLivePostId);
      if (liveFeed.length !== feed.length) {
        console.log(
          `[agent:${this.name}] filtered stale posts from feed ${feed.length} -> ${liveFeed.length} (maxLivePostId=${maxLivePostId})`,
        );
      }

      for (const postIdKey of Object.keys(postDetails)) {
        const postId = Number(postIdKey);
        if (postId > maxLivePostId) {
          delete postDetails[postId];
        }
      }

      return liveFeed;
    } catch (error) {
      console.warn(`[agent:${this.name}] failed to verify live posts: ${errorMessage(error)}`);
      return feed;
    }
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
      sharePct: daoSharePct(member),
      stakeBalance: daoStakeBalance(member),
      availableBalance: member.availableBalance,
      totalVotedStake: member.totalVotedStake,
    }));
    const pendingActionSummary = context.pendingActionIds.map((actionId) => {
      const details = context.pendingActionDetails[actionId];
      return {
        actionId,
        action: details?.action
          ? {
              id: details.action.id,
              status: details.action.status,
              type: details.action.type,
              proposer: details.action.proposer,
            }
          : null,
        votes:
          details?.votes?.slice(0, 20).map((vote) => ({
            voter: vote.voter,
            support: vote.support,
            stakeAmount: vote.stake_amount,
          })) ?? [],
      };
    });

    const memorySummary = context.memories.slice(0, 20).map((memory) => ({
      type: memory.memory_type,
      text: memory.memory_text,
      createdAt: memory.created_at,
    }));

    const conversationTargets = this.buildConversationTargets(context, account).slice(0, 10);
    const recentCommentedPostIds = this.getRecentCommentedPostIds(context, 8);

    const existingActionTypesInFeed = [
      ...new Set(
        context.feed
          .filter((item) => item.action_id !== null)
          .map((item) => {
            const details = context.postDetails[item.id];
            return details?.action?.type ?? null;
          })
          .filter((t): t is string => t !== null),
      ),
    ];

    const promptPayload = {
      now: new Date().toISOString(),
      agent: {
        name: this.name,
        address: account,
        holderProfile: this.holderProfile,
        share: context.selfShare,
        tickCount: this.tickCount,
      },
      pendingActionIds: context.pendingActionIds,
      daoShares: daoShareSummary,
      feed: feedSummary,
      postDetails: postDetailSummary,
      pendingActions: pendingActionSummary,
      conversationTargets,
      recentCommentedPostIds,
      existingActionTypesInFeed,
      memories: memorySummary,
      constraints: {
        maxOneOnchainActionPerTick: true,
        canDo: ['idle', 'post', 'comment', 'propose_action', 'vote'],
        actionTypes: GOVERNANCE_ACTION_TYPES,
      },
    };

    const systemPrompt = [
      `You are ${this.name}, an autonomous DAO debater acting for a human crypto holder.`,
      `Primary objective: represent that holder's interests by producing useful disagreement, clearer tradeoffs, and better decisions.`,
      `Use DAO share distribution to guide negotiation strategy: identify who can block/pass decisions and build coalitions explicitly.`,
      `You may choose exactly one on-chain action this tick: idle, post, comment, propose_action, or vote.`,
      `When pending actions exist and you have not yet voted on one, prioritize plan=vote on a pending action before posting, commenting, or proposing anything else.`,
      `After you have voted on all pending actions, resume normal discussion behavior (post/comment/propose_action as appropriate).`,
      `If there are no pending actions AND the feed has no recent action proposals, you may choose propose_action to put forward a concrete executable option.`,
      `CRITICAL: Check existingActionTypesInFeed before proposing. NEVER propose an action type that already exists in the feed. Pick a DIFFERENT action type. If all types are covered, prefer commenting on or voting on existing proposals instead.`,
      `If this is your first or second tick (tickCount <= 2), prioritize reading existing posts and commenting on them unless a pending action still needs your vote.`,
      `If plan=propose_action, set action.actionType to one of ${GOVERNANCE_ACTION_TYPES.join(', ')}.`,
      `ALLOCATE_RWA_FUND sends treasury tokens into a Canton Network RWA fund. REDEEM_RWA_FUND pulls tokens back. Set action.rwaFundId to one of: canton-tbill-001, canton-realestate-002, canton-commodity-003, canton-credit-004, canton-stablecoin-005.`,
      `FUND_AGENT_WALLET sends tokens to an agent's x402 payment wallet on Kite AI. Set action.agentAddress.`,
      `SET_SWAP_PROVIDER votes to change the DEX used for treasury swaps (e.g. Uniswap V3, 0x Protocol). Set action.swapProviderName.`,
      `DEPLOY_YIELD_STRATEGY deploys an AI-managed yield strategy via 0G Compute. Set action.yieldStrategyId and action.riskTier (0=conservative, 1=balanced, 2=growth, 3=aggressive).`,
      `SOFT_VOTE is non-binding and discussion-only; it does not execute treasury changes.`,
      `When commenting, prefer recent and relevant threads, not just the same thread repeatedly.`,
      `You may go deep in a thread using replyToCommentId; depth should usually be 1-3 and only rarely 6+.`,
      `Do not abandon posting: create new discussion posts when there is a genuinely new angle to raise.`,
      `Prefer substantive negotiation over spam. Use specific references to current posts/actions/votes when possible.`,
      `Style constraints: sound human, pointed, and insight-seeking; avoid robotic/corporate phrasing, generic platitudes, and empty diplomacy.`,
      `In every non-idle plan, try to add at least one concrete insight: a hidden assumption, second-order effect, or coalition implication.`,
      // Canton RWA context
      `The DAO treasury includes RWA positions managed via Canton Network: US Treasury Bills (45% allocation, ~4.8% yield), Tokenized Real Estate (22%, ~6.2%), Commodity Index (16%, ~3.4%), Private Credit (12%, ~8.7%), and Stablecoin Reserve (5%, ~5.2%). Canton provides sub-transaction privacy so only authorized parties see fund details.`,
      `When discussing treasury strategy, consider the RWA allocation mix and whether the DAO should rebalance between crypto-native DeFi yields and real-world asset yields. Reference specific Canton fund positions when relevant.`,
      // Swap routing context
      `Treasury swap actions (SWAP_TREASURY_TOKEN_TO_TOKEN) are routed through the Uniswap API for optimal execution on Base. Consider Uniswap liquidity depth and slippage when proposing or discussing swap sizes.`,
      // 0G Compute context
      `Your AI inference runs on 0G Compute (decentralized compute network). Each decision you make is attested on-chain for verifiability. Factor compute costs into governance efficiency discussions.`,
      `Return only strict JSON with fields: plan, rationale, memory, and optional post/comment/action/vote objects.`,
      `Do not include markdown fences.`,
    ].join('\n');

    const decision = await this.requestStructuredResponse<AgentDecision>(
      agentDecisionSchema as z.ZodType<AgentDecision>,
      systemPrompt,
      promptPayload,
      'decision',
    );
    if (decision) {
      return decision;
    }

    return {
      plan: 'idle',
      rationale: 'No valid model output for this tick.',
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

    const directDraft =
      decision.post?.title && decision.post.body
        ? {
            title: decision.post.title,
            body: decision.post.body,
          }
        : null;
    const draft = directDraft ?? (await this.generatePostDraft(account.address, context, decision.rationale));
    if (!draft) {
      return 'discussion skipped: model did not provide post draft';
    }

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
    const decisionPostId =
      typeof decision.comment?.postId === 'number' && context.feed.some((item) => item.id === decision.comment?.postId)
        ? decision.comment?.postId
        : null;
    const stickyExclusions = this.getStickyThreadExclusions(context);
    const allowedDecisionPostId = decisionPostId !== null && !stickyExclusions.has(decisionPostId) ? decisionPostId : null;
    const diversifiedTarget =
      this.pickRandomRelevantThread(context, account.address, stickyExclusions) ?? this.pickRandomRelevantThread(context, account.address);
    const primaryTargetPostId = allowedDecisionPostId ?? diversifiedTarget ?? decisionPostId ?? context.feed[0]?.id;
    if (!primaryTargetPostId) {
      return 'comment skipped: no post targets available';
    }
    if (decisionPostId !== null && allowedDecisionPostId === null) {
      console.log(
        `[agent:${this.name}] bypassing repeated model thread post=${decisionPostId}; selected post=${primaryTargetPostId} for diversification`,
      );
    }

    const candidatePostIds = [...new Set([primaryTargetPostId, ...context.feed.map((item) => item.id)])];
    let reusableBody = decision.comment?.body?.trim() ?? '';
    let staleCount = 0;

    for (const targetPostId of candidatePostIds) {
      const details = context.postDetails[targetPostId] ?? (await this.fetchPostDetails(targetPostId));
      if (details) {
        context.postDetails[targetPostId] = details;
      }

      const commentPool = details?.comments ?? [];
      let parentCommentId: number | null = null;
      if (decision.comment?.replyToCommentId) {
        const exists = commentPool.some((comment) => comment.id === decision.comment?.replyToCommentId);
        parentCommentId = exists ? decision.comment.replyToCommentId ?? null : null;
      } else {
        parentCommentId = this.pickReplyTargetByDepth(commentPool, account.address);
      }

      let body = reusableBody;
      if (!body) {
        const generated = await this.generateCommentDraft(account.address, context, targetPostId, parentCommentId, decision.rationale);
        if (generated?.replyToCommentId !== undefined && generated.replyToCommentId !== null) {
          const exists = commentPool.some((comment) => comment.id === generated.replyToCommentId);
          if (exists) {
            parentCommentId = generated.replyToCommentId;
          }
        }
        body = generated?.body?.trim() ?? '';
        reusableBody = body;
      }

      if (!body) {
        return 'comment skipped: model did not provide comment body';
      }

      const contentHash = keccak256(toHex(body));

      try {
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
        return `comment created post=${targetPostId} comment=${commentId}${parentCommentId ? ` replyTo=${parentCommentId}` : ''}`;
      } catch (error) {
        if (!isPostNotFoundError(error)) {
          throw error;
        }

        staleCount += 1;
        delete context.postDetails[targetPostId];
        console.warn(`[agent:${this.name}] skipping stale post ${targetPostId}: PostNotFound`);
      }
    }

    if (staleCount > 0) {
      return `comment skipped: no live posts available (${staleCount} stale targets)`;
    }

    return 'comment skipped: no post targets available';
  }

  private async createActionDiscussionPost(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    context: AgentContext,
    actionId: bigint,
    actionType: GovernanceActionType,
    summary: Record<string, unknown>,
    rationale: string | undefined,
  ): Promise<string> {
    const actionPost = await this.generateActionPostDraft(account.address, context, actionId, actionType, summary, rationale);
    if (!actionPost) {
      return `action proposed type=${actionType} id=${actionId.toString()} but discussion post skipped: model did not provide draft`;
    }

    const actionRef = encodeAbiParameters([{ type: 'uint256' }], [actionId]);
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
    return `action proposed type=${actionType} id=${actionId.toString()}`;
  }

  private async maybeCreateSwapAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const actionConfig = decision.action;
    const amountIn = toSafeBigInt(actionConfig?.amountInToken ?? actionConfig?.amountInUSDC, 50_000_000n);
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
        amountInToken: amountIn.toString(),
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
      'createActionSwap',
    );

    await publicClient.waitForTransactionReceipt({ hash: actionTx });
    const actionId = simulation.result as bigint;

    return await this.createActionDiscussionPost(
      publicClient,
      walletClient,
      account,
      context,
      actionId,
      'SWAP_TREASURY_TOKEN_TO_TOKEN',
      {
        tokenOut,
        amountInToken: formatTokenAmount(amountIn),
        slippageBps,
        minAmountOut: minAmountOut.toString(),
        deadlineSeconds,
      },
      actionConfig?.rationale ?? decision.rationale,
    );
  }

  private async maybeCreateTransferAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const actionConfig = decision.action;
    const amountIn = toSafeBigInt(actionConfig?.amountInToken ?? actionConfig?.amountInUSDC, 35_000_000n);
    const deadlineSeconds = clampInt(actionConfig?.deadlineSeconds, 2 * 60 * 60, 300, 24 * 60 * 60);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

    const simulation = await publicClient.simulateContract({
      account,
      address: env.ACTION_EXECUTOR_ADDRESS as Address,
      abi: actionExecutorAbi,
      functionName: 'createAction',
      args: [0n, ZERO_ADDRESS, amountIn, 0n, deadline, ZERO_HASH],
    });

    const actionTx = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      {
        ...simulation.request,
      },
      'createActionTransfer',
    );

    await publicClient.waitForTransactionReceipt({ hash: actionTx });
    const actionId = simulation.result as bigint;

    return await this.createActionDiscussionPost(
      publicClient,
      walletClient,
      account,
      context,
      actionId,
      'TRANSFER_TREASURY_TOKEN',
      {
        maxTransferAmountToken: formatTokenAmount(amountIn),
        deadlineSeconds,
      },
      actionConfig?.rationale ?? decision.rationale,
    );
  }

  private async maybeCreateGovernanceConfigAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const actionConfig = decision.action;
    const [currentSupportStakeRaw, currentUniqueRaw, currentSupportBpsRaw, currentVotingWindowRaw] = await Promise.all([
      publicClient.readContract({
        address: env.ACTION_EXECUTOR_ADDRESS as Address,
        abi: actionExecutorAbi,
        functionName: 'supportStakeThreshold',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: env.ACTION_EXECUTOR_ADDRESS as Address,
        abi: actionExecutorAbi,
        functionName: 'uniqueSupportersThreshold',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: env.ACTION_EXECUTOR_ADDRESS as Address,
        abi: actionExecutorAbi,
        functionName: 'supportBpsThreshold',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: env.ACTION_EXECUTOR_ADDRESS as Address,
        abi: actionExecutorAbi,
        functionName: 'votingWindow',
      }) as Promise<bigint>,
    ]);

    const supportStakeThreshold = parsePositiveBigInt(actionConfig?.supportStakeThreshold) ?? currentSupportStakeRaw;
    const uniqueSupportersFallback = bigintToSafeNumber(currentUniqueRaw, 3);
    const supportBpsFallback = bigintToSafeNumber(currentSupportBpsRaw, 6000);
    const votingWindowFallback = bigintToSafeNumber(currentVotingWindowRaw, 6 * 60 * 60);
    const uniqueSupportersThreshold = BigInt(
      clampInt(actionConfig?.uniqueSupportersThreshold, uniqueSupportersFallback, 1, 10_000),
    );
    const supportBpsThreshold = BigInt(clampInt(actionConfig?.supportBpsThreshold, supportBpsFallback, 1, 10_000));
    const votingWindow = BigInt(
      clampInt(actionConfig?.votingWindowSeconds, votingWindowFallback, 60 * 60, 7 * 24 * 60 * 60),
    );
    const deadlineSeconds = clampInt(actionConfig?.deadlineSeconds, 2 * 60 * 60, 300, 24 * 60 * 60);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

    const simulation = await publicClient.simulateContract({
      account,
      address: env.ACTION_EXECUTOR_ADDRESS as Address,
      abi: actionExecutorAbi,
      functionName: 'createGovernanceConfigAction',
      args: [0n, supportStakeThreshold, uniqueSupportersThreshold, supportBpsThreshold, votingWindow, deadline],
    });

    const actionTx = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      {
        ...simulation.request,
      },
      'createGovernanceConfigAction',
    );

    await publicClient.waitForTransactionReceipt({ hash: actionTx });
    const actionId = simulation.result as bigint;

    return await this.createActionDiscussionPost(
      publicClient,
      walletClient,
      account,
      context,
      actionId,
      'UPDATE_GOVERNANCE_CONFIG',
      {
        supportStakeThreshold: supportStakeThreshold.toString(),
        uniqueSupportersThreshold: uniqueSupportersThreshold.toString(),
        supportBpsThreshold: supportBpsThreshold.toString(),
        votingWindowSeconds: votingWindow.toString(),
        deadlineSeconds,
      },
      actionConfig?.rationale ?? decision.rationale,
    );
  }

  private async maybeCreateRwaFundAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
    isAllocation: boolean,
  ): Promise<string> {
    const actionConfig = decision.action;
    const amountIn = toSafeBigInt(actionConfig?.amountInToken ?? actionConfig?.amountInUSDC, 100_000_000n);
    const deadlineSeconds = clampInt(actionConfig?.deadlineSeconds, 2 * 60 * 60, 300, 24 * 60 * 60);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

    const RWA_FUND_IDS = [
      'canton-tbill-001',
      'canton-realestate-002',
      'canton-commodity-003',
      'canton-credit-004',
      'canton-stablecoin-005',
    ];
    const fundIdString = actionConfig?.rwaFundId ?? RWA_FUND_IDS[Math.floor(Math.random() * RWA_FUND_IDS.length)] ?? RWA_FUND_IDS[0];
    const fundIdHash = keccak256(toHex(fundIdString));

    const simulation = await publicClient.simulateContract({
      account,
      address: env.ACTION_EXECUTOR_ADDRESS as Address,
      abi: actionExecutorAbi,
      functionName: 'createRwaFundAction',
      args: [0n, fundIdHash, amountIn, isAllocation, deadline],
    });

    const actionTx = await this.writeContractWithRetry(
      publicClient,
      walletClient,
      account,
      { ...simulation.request },
      isAllocation ? 'createAllocateRwaFund' : 'createRedeemRwaFund',
    );

    await publicClient.waitForTransactionReceipt({ hash: actionTx });
    const actionId = simulation.result as bigint;

    const actionType: GovernanceActionType = isAllocation ? 'ALLOCATE_RWA_FUND' : 'REDEEM_RWA_FUND';
    return await this.createActionDiscussionPost(
      publicClient, walletClient, account, context, actionId, actionType,
      {
        fundId: fundIdString,
        amountToken: formatTokenAmount(amountIn),
        isAllocation,
        deadlineSeconds,
        platform: 'Canton Network',
      },
      actionConfig?.rationale ?? decision.rationale,
    );
  }

  private async maybeCreateAgentWalletFundAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const actionConfig = decision.action;
    const amountIn = toSafeBigInt(actionConfig?.amountInToken ?? actionConfig?.amountInUSDC, 20_000_000n);
    const deadlineSeconds = clampInt(actionConfig?.deadlineSeconds, 2 * 60 * 60, 300, 24 * 60 * 60);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

    const targetAgent = isAddress(actionConfig?.agentAddress)
      ? actionConfig.agentAddress
      : (context.daoShares[Math.floor(Math.random() * Math.min(context.daoShares.length, 5))]?.address ?? account.address) as `0x${string}`;

    const simulation = await publicClient.simulateContract({
      account,
      address: env.ACTION_EXECUTOR_ADDRESS as Address,
      abi: actionExecutorAbi,
      functionName: 'createAgentWalletFundAction',
      args: [0n, targetAgent as Address, amountIn, deadline],
    });

    const actionTx = await this.writeContractWithRetry(
      publicClient, walletClient, account,
      { ...simulation.request },
      'createAgentWalletFund',
    );

    await publicClient.waitForTransactionReceipt({ hash: actionTx });
    const actionId = simulation.result as bigint;

    return await this.createActionDiscussionPost(
      publicClient, walletClient, account, context, actionId, 'FUND_AGENT_WALLET',
      {
        targetAgent,
        amountToken: formatTokenAmount(amountIn),
        deadlineSeconds,
        platform: 'Kite AI x402',
      },
      actionConfig?.rationale ?? decision.rationale,
    );
  }

  private async maybeCreateSwapProviderAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const actionConfig = decision.action;
    const deadlineSeconds = clampInt(actionConfig?.deadlineSeconds, 2 * 60 * 60, 300, 24 * 60 * 60);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

    const PROVIDERS = [
      { name: 'Uniswap V3', address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' },
      { name: '0x Protocol', address: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF' },
    ];
    const providerName = actionConfig?.swapProviderName ?? PROVIDERS[Math.floor(Math.random() * PROVIDERS.length)]!.name;
    const providerAddress = isAddress(actionConfig?.swapProviderAddress)
      ? actionConfig.swapProviderAddress
      : (PROVIDERS.find(p => p.name === providerName)?.address ?? PROVIDERS[0]!.address) as `0x${string}`;
    const nameHash = keccak256(toHex(providerName));

    const simulation = await publicClient.simulateContract({
      account,
      address: env.ACTION_EXECUTOR_ADDRESS as Address,
      abi: actionExecutorAbi,
      functionName: 'createSwapProviderAction',
      args: [0n, providerAddress as Address, nameHash, deadline],
    });

    const actionTx = await this.writeContractWithRetry(
      publicClient, walletClient, account,
      { ...simulation.request },
      'createSwapProviderAction',
    );

    await publicClient.waitForTransactionReceipt({ hash: actionTx });
    const actionId = simulation.result as bigint;

    return await this.createActionDiscussionPost(
      publicClient, walletClient, account, context, actionId, 'SET_SWAP_PROVIDER',
      {
        providerName,
        providerAddress,
        deadlineSeconds,
      },
      actionConfig?.rationale ?? decision.rationale,
    );
  }

  private async maybeCreateYieldStrategyAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const actionConfig = decision.action;
    const allocationAmount = toSafeBigInt(actionConfig?.amountInToken ?? actionConfig?.amountInUSDC, 75_000_000n);
    const deadlineSeconds = clampInt(actionConfig?.deadlineSeconds, 2 * 60 * 60, 300, 24 * 60 * 60);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
    const riskTier = BigInt(clampInt(actionConfig?.riskTier, 1, 0, 3));

    const STRATEGIES = [
      'conservative-stablecoin-lp',
      'balanced-eth-yield',
      'growth-multi-asset',
      'aggressive-concentrated-lp',
    ];
    const strategyName = actionConfig?.yieldStrategyId ?? STRATEGIES[Number(riskTier)] ?? STRATEGIES[1]!;
    const strategyIdHash = keccak256(toHex(strategyName));

    const simulation = await publicClient.simulateContract({
      account,
      address: env.ACTION_EXECUTOR_ADDRESS as Address,
      abi: actionExecutorAbi,
      functionName: 'createYieldStrategyAction',
      args: [0n, strategyIdHash, allocationAmount, riskTier, deadline],
    });

    const actionTx = await this.writeContractWithRetry(
      publicClient, walletClient, account,
      { ...simulation.request },
      'createYieldStrategy',
    );

    await publicClient.waitForTransactionReceipt({ hash: actionTx });
    const actionId = simulation.result as bigint;

    const RISK_LABELS = ['Conservative', 'Balanced', 'Growth', 'Aggressive'];

    return await this.createActionDiscussionPost(
      publicClient, walletClient, account, context, actionId, 'DEPLOY_YIELD_STRATEGY',
      {
        strategyName,
        allocationAmountToken: formatTokenAmount(allocationAmount),
        riskTier: Number(riskTier),
        riskLabel: RISK_LABELS[Number(riskTier)] ?? 'Unknown',
        deadlineSeconds,
        platform: '0G Compute AI-managed',
      },
      actionConfig?.rationale ?? decision.rationale,
    );
  }

  private async maybeCreateSoftVoteAction(
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
      return `soft vote skipped: available stake ${availableStake.toString()} below postBondMin ${postBondMin.toString()}`;
    }

    const requestedTargetId = decision.action?.targetActionId;
    const targetActionId =
      (requestedTargetId && context.pendingActionIds.includes(requestedTargetId) ? requestedTargetId : context.pendingActionIds[0]) ?? null;

    const directDraft =
      decision.post?.title && decision.post.body
        ? {
            title: decision.post.title,
            body: decision.post.body,
          }
        : null;
    const draft =
      directDraft ??
      (await this.generateSoftVotePostDraft(
        account.address,
        context,
        targetActionId,
        decision.action?.rationale ?? decision.rationale,
      ));
    if (!draft) {
      return 'soft vote skipped: model did not provide discussion draft';
    }

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
      'createSoftVotePost',
    );

    await publicClient.waitForTransactionReceipt({ hash: txHash });
    await this.persistPostBody(contentHash, draft.title, draft.body, account.address, txHash);
    return `action proposed type=SOFT_VOTE targetAction=${targetActionId ?? 'none'} tx=${txHash}`;
  }

  private async maybeCreateAction(
    publicClient: any,
    walletClient: any,
    account: AgentAccount,
    decision: AgentDecision,
    context: AgentContext,
  ): Promise<string> {
    const actionType = this.pickActionProposalType(decision, context);
    if (actionType === 'SOFT_VOTE') {
      return await this.maybeCreateSoftVoteAction(publicClient, walletClient, account, decision, context);
    }

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
      return `action skipped: type=${actionType} available stake ${availableStake.toString()} below actionBondMin ${actionBondMin.toString()}`;
    }

    switch (actionType) {
      case 'SWAP_TREASURY_TOKEN_TO_TOKEN':
        return await this.maybeCreateSwapAction(publicClient, walletClient, account, decision, context);
      case 'TRANSFER_TREASURY_TOKEN':
        return await this.maybeCreateTransferAction(publicClient, walletClient, account, decision, context);
      case 'UPDATE_GOVERNANCE_CONFIG':
        return await this.maybeCreateGovernanceConfigAction(publicClient, walletClient, account, decision, context);
      case 'ALLOCATE_RWA_FUND':
        return await this.maybeCreateRwaFundAction(publicClient, walletClient, account, decision, context, true);
      case 'REDEEM_RWA_FUND':
        return await this.maybeCreateRwaFundAction(publicClient, walletClient, account, decision, context, false);
      case 'FUND_AGENT_WALLET':
        return await this.maybeCreateAgentWalletFundAction(publicClient, walletClient, account, decision, context);
      case 'SET_SWAP_PROVIDER':
        return await this.maybeCreateSwapProviderAction(publicClient, walletClient, account, decision, context);
      case 'DEPLOY_YIELD_STRATEGY':
        return await this.maybeCreateYieldStrategyAction(publicClient, walletClient, account, decision, context);
      default:
        return await this.maybeCreateSoftVoteAction(publicClient, walletClient, account, decision, context);
    }
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

    const stakeAmount = availableStake;

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
        return await this.maybeCreateAction(publicClient, walletClient, account, decision, context);
      case 'vote':
        return await this.maybeVoteAction(publicClient, walletClient, account, decision, context);
      default:
        return 'idle: unknown plan';
    }
  }

  private async runAIGovernanceTick(publicClient: any, walletClient: any, account: AgentAccount): Promise<void> {
    const context = await this.buildContext(account.address);
    context.feed = await this.filterLiveForumPosts(publicClient, context.feed, context.postDetails);
    const livePendingActionIds = await this.filterLivePendingActions(publicClient, context.pendingActionIds);
    if (livePendingActionIds.length !== context.pendingActionIds.length) {
      console.log(
        `[agent:${this.name}] filtered stale pending actions ${JSON.stringify(context.pendingActionIds)} -> ${JSON.stringify(livePendingActionIds)}`,
      );
    }
    context.pendingActionIds = livePendingActionIds;

    const topHolders = context.daoShares
      .slice(0, 3)
      .map((member) => `${member.handle ?? member.address.slice(0, 10)}:${daoSharePct(member).toFixed(2)}%`)
      .join(', ');

    await this.persistMemory(account.address, {
      memoryType: 'observation',
      referenceType: 'tick',
      referenceId: `${Date.now()}`,
      text: `Observed ${context.feed.length} posts, ${context.pendingActionIds.length} pending actions, top shares [${topHolders || 'none'}].`,
      metadata: {
        tick: this.tickCount,
        pendingActionIds: context.pendingActionIds,
        selfSharePct: daoSharePct(context.selfShare),
      },
    });

    let decision = await this.decideNextAction(account.address, context);
    const activeThreads = this.buildConversationTargets(context, account.address).filter((target) => target.commentCount > 0);
    if (decision.plan === 'idle' && activeThreads.length > 0 && Math.random() < 0.65) {
      const stickyExclusions = this.getStickyThreadExclusions(context);
      const threadPostId =
        this.pickRandomRelevantThread(context, account.address, stickyExclusions) ??
        this.pickRandomRelevantThread(context, account.address) ??
        activeThreads[0]?.postId ??
        null;
      if (threadPostId !== null) {
        const threadComments = context.postDetails[threadPostId]?.comments ?? [];
        const replyToCommentId = this.pickReplyTargetByDepth(threadComments, account.address);
        decision = {
          ...decision,
          plan: 'comment',
          comment: {
            postId: threadPostId,
            replyToCommentId,
            body: decision.comment?.body ?? '',
          },
          rationale:
            decision.rationale ??
            'Thread is active; engaging in discussion instead of idling this tick.',
        } as AgentDecision;
      }
    }

    const recentOutcomes = context.memories.filter((memory) => memory.memory_type === 'outcome').slice(0, 6);

    if (context.pendingActionIds.length > 0) {
      const prioritizedActionId =
        decision.vote?.actionId && context.pendingActionIds.includes(decision.vote.actionId)
          ? decision.vote.actionId
          : context.pendingActionIds[0]!;
      const previousPlan = decision.plan;
      const previousVoteActionId = decision.vote?.actionId ?? null;
      if (previousPlan !== 'vote' || previousVoteActionId !== prioritizedActionId) {
        decision = {
          ...decision,
          plan: 'vote',
          vote: {
            ...decision.vote,
            actionId: prioritizedActionId,
          },
          rationale:
            decision.rationale ??
            'Pending action exists and this agent has not voted yet; voting now before other actions.',
        } as AgentDecision;
        console.log(`[agent:${this.name}] prioritizing vote on pending action ${prioritizedActionId} (was ${previousPlan})`);
      }
    }

    const hasRecentPost = recentOutcomes.some(
      (memory) =>
        memory.reference_type === 'post' ||
        memory.memory_text.toLowerCase().includes('discussion created') ||
        memory.memory_text.toLowerCase().includes('type=soft_vote'),
    );
    if (!hasRecentPost && (decision.plan === 'idle' || decision.plan === 'comment') && Math.random() < 0.4) {
      decision = {
        ...decision,
        plan: 'post',
        post: {
          title: decision.post?.title,
          body: decision.post?.body,
        },
        rationale:
          decision.rationale ??
          'Creating a fresh thread to broaden the agenda after repeated comment-only ticks.',
      } as AgentDecision;
    }

    const isFreshAgent = this.tickCount <= 2;
    const threadMix = this.getRecentThreadMix(context);
    const actionRatioDeficit = Math.max(0, ACTION_THREAD_TARGET_RATIO - threadMix.actionRatio);
    const actionPostConversionChance = Math.min(
      ACTION_THREAD_MAX_CONVERSION_CHANCE,
      ACTION_THREAD_TARGET_RATIO + actionRatioDeficit * ACTION_THREAD_CATCHUP_MULTIPLIER,
    );
    const needsActionCatchUp = threadMix.totalThreads >= 12 && threadMix.actionThreads === 0;

    const shouldConvertDiscussionToActionPost =
      decision.plan === 'post' &&
      context.pendingActionIds.length === 0 &&
      !isFreshAgent &&
      (needsActionCatchUp || Math.random() < actionPostConversionChance);

    if (shouldConvertDiscussionToActionPost) {
      decision = {
        ...decision,
        plan: 'propose_action',
        action: decision.action,
        rationale:
          decision.rationale ??
          'Converting this discussion slot into an action proposal to keep governance momentum.',
      } as AgentDecision;
      console.log(
        `[agent:${this.name}] converting discussion to action post (${Math.round(actionPostConversionChance * 100)}% chance, ` +
          `recent action ratio ${Math.round(threadMix.actionRatio * 100)}%)`,
      );
    }

    if (
      isFreshAgent &&
      context.feed.length > 0 &&
      (decision.plan === 'propose_action' || (decision.plan === 'vote' && context.pendingActionIds.length === 0))
    ) {
      const stickyExclusions = this.getStickyThreadExclusions(context);
      const threadPostId =
        this.pickRandomRelevantThread(context, account.address, stickyExclusions) ??
        this.pickRandomRelevantThread(context, account.address) ??
        null;
      if (threadPostId !== null) {
        const threadComments = context.postDetails[threadPostId]?.comments ?? [];
        const replyToCommentId = this.pickReplyTargetByDepth(threadComments, account.address);
        decision = {
          ...decision,
          plan: 'comment',
          comment: { postId: threadPostId, replyToCommentId, body: '' },
          rationale: 'New agent: reading existing posts and engaging in discussion before proposing new actions.',
        } as AgentDecision;
        console.log(`[agent:${this.name}] fresh agent demoting to comment (tick ${this.tickCount})`);
      } else if (decision.plan === 'propose_action') {
        decision = {
          ...decision,
          plan: 'post',
          rationale: 'New agent: creating a discussion post to engage with the forum before proposing actions.',
        } as AgentDecision;
        console.log(`[agent:${this.name}] fresh agent demoting to post (tick ${this.tickCount})`);
      }
    }

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
  if (env.AGENT_PRIVATE_KEYS?.trim()) {
    return env.AGENT_PRIVATE_KEYS.split(',').map((key) => key.trim() as `0x${string}`);
  }

  const agentsPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../agents.txt');
  try {
    const content = readFileSync(agentsPath, 'utf-8');
    const keys = content
      .split('\n')
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) => (k.startsWith('0x') ? k : `0x${k}`) as `0x${string}`);
    if (keys.length > 0) return keys;
  } catch {
    /* ignore */
  }

  if (env.PRIVATE_KEY) {
    return [env.PRIVATE_KEY as `0x${string}`];
  }

  throw new Error('AGENT_PRIVATE_KEYS or agents.txt or PRIVATE_KEY must be set for agent runtime');
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
        index,
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
