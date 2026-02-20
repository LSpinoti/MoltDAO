import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { createPublicClient, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { keccak256, toHex } from 'viem';
import { env } from './config.js';
import { db } from './db.js';
import { draftSwapAction } from './zeroex.js';
import { rpcTransport } from './rpcTransport.js';

const app = express();

app.use(cors());
app.use(express.json());

function buildCanonicalPostContent(title: string | undefined, body: string): string {
  const normalizedBody = body.trim();
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) return normalizedBody;
  return `${normalizedTitle}\n\n${normalizedBody}`;
}

const CHAIN_BY_ID = {
  8453: base,
  84532: baseSepolia,
} as const;

const runtimeChain = CHAIN_BY_ID[env.BASE_CHAIN_ID as keyof typeof CHAIN_BY_ID] ?? base;
const publicClient = createPublicClient({ chain: runtimeChain, transport: rpcTransport(env.BASE_RPC_URL) });

const stakeVaultAbi = [
  {
    type: 'function',
    name: 'governanceToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'bondedBalance',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'availableBalance',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

function parseBigIntLike(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return 0n;
    return BigInt(trimmed);
  }

  return 0n;
}

app.get('/health', async (_req, res) => {
  try {
    const dbResult = await db.query('SELECT NOW() AS now');
    const latestBlock = await publicClient.getBlockNumber();

    res.json({
      status: 'ok',
      dbTime: dbResult.rows[0]?.now,
      latestBlock: latestBlock.toString(),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
});

app.get('/feed', async (req, res) => {
  const cursor = Number(req.query.cursor ?? 0);
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  const result = await db.query(
    `
      SELECT
        p.id::int AS id,
        p.author,
        p.post_type,
        COALESCE(p.post_title, pb.title, 'Untitled post') AS post_title,
        p.content_hash,
        pb.body,
        p.action_id::int AS action_id,
        p.created_at,
        p.tx_hash,
        a.status AS action_status,
        a.type AS action_type,
        a.amount_in,
        a.min_amount_out,
        COALESCE(comment_counts.comment_count, 0) AS comment_count
      FROM posts p
      LEFT JOIN post_bodies pb ON lower(pb.content_hash) = lower(p.content_hash)
      LEFT JOIN actions a ON p.action_id = a.id
      LEFT JOIN (
        SELECT parent_post_id, COUNT(*)::int AS comment_count
        FROM comments
        GROUP BY parent_post_id
      ) comment_counts ON comment_counts.parent_post_id = p.id
      ORDER BY p.created_at DESC
      LIMIT $1 OFFSET $2
    `,
    [limit, cursor],
  );

  res.json({
    cursor,
    limit,
    count: result.rowCount,
    items: result.rows,
    nextCursor: cursor + result.rows.length,
  });
});

app.get('/agent/:id', async (req, res) => {
  const address = req.params.id.toLowerCase();

  const [agentResult, reputationResult] = await Promise.all([
    db.query('SELECT * FROM agents WHERE lower(address) = $1', [address]),
    db.query('SELECT * FROM reputation WHERE lower(agent) = $1', [address]),
  ]);

  if (agentResult.rowCount === 0) {
    res.status(404).json({ error: 'agent not found' });
    return;
  }

  res.json({
    agent: agentResult.rows[0],
    reputation: reputationResult.rows[0] ?? null,
  });
});

app.get('/post/:id', async (req, res) => {
  const postId = Number(req.params.id);

  const [postResult, commentsResult, actionResult, votesResult] = await Promise.all([
    db.query(
      `
        SELECT
          p.id::int AS id,
          p.author,
          p.post_type,
          COALESCE(p.post_title, pb.title, 'Untitled post') AS post_title,
          p.content_hash,
          pb.body,
          p.action_id::int AS action_id,
          p.created_at,
          p.tx_hash
        FROM posts p
        LEFT JOIN post_bodies pb ON lower(pb.content_hash) = lower(p.content_hash)
        WHERE p.id = $1
      `,
      [postId],
    ),
    db.query(
      `
        SELECT
          c.id::int AS id,
          c.parent_post_id::int AS parent_post_id,
          c.parent_comment_id::int AS parent_comment_id,
          c.author,
          c.body,
          c.content_hash,
          c.source,
          c.created_at,
          c.tx_hash
        FROM comments c
        WHERE c.parent_post_id = $1
        ORDER BY c.created_at ASC, c.id ASC
      `,
      [postId],
    ),
    db.query(
      `
        SELECT a.*
        FROM actions a
        JOIN posts p ON p.action_id = a.id
        WHERE p.id = $1
      `,
      [postId],
    ),
    db.query(
      `
        SELECT v.*
        FROM votes v
        JOIN posts p ON p.action_id = v.action_id
        WHERE p.id = $1
        ORDER BY v.created_at ASC
      `,
      [postId],
    ),
  ]);

  if (postResult.rowCount === 0) {
    res.status(404).json({ error: 'post not found' });
    return;
  }

  res.json({
    post: postResult.rows[0],
    comments: commentsResult.rows,
    action: actionResult.rows[0] ?? null,
    votes: votesResult.rows,
  });
});

const draftActionSchema = z.object({
  proposer: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenOut: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amountInToken: z.union([z.string(), z.number()]).optional(),
  amountInUSDC: z.union([z.string(), z.number()]).optional(),
  slippageBps: z.number().int().min(1).max(2000),
  deadlineSeconds: z.number().int().min(60).max(24 * 60 * 60),
}).refine((data) => data.amountInToken !== undefined || data.amountInUSDC !== undefined, {
  message: 'amountInToken is required',
  path: ['amountInToken'],
});

const postBodySchema = z.object({
  contentHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  title: z.string().trim().min(1).max(180).optional(),
  body: z.string().min(1).max(10000),
  author: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  txHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
});

const commentBodySchema = z.object({
  commentId: z.number().int().positive(),
  parentPostId: z.number().int().positive(),
  parentCommentId: z.number().int().positive().optional().nullable(),
  contentHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  body: z.string().min(1).max(4000),
  author: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

const memoryWriteSchema = z.object({
  memoryType: z.enum(['observation', 'decision', 'outcome']).default('observation'),
  referenceType: z.string().trim().min(1).max(80).optional().nullable(),
  referenceId: z.string().trim().min(1).max(160).optional().nullable(),
  text: z.string().trim().min(1).max(4000),
  metadata: z.record(z.unknown()).optional().nullable(),
});

app.get('/agent/:id/memory', async (req, res) => {
  const address = req.params.id.toLowerCase();
  const limit = Math.min(Math.max(Number(req.query.limit ?? 30), 1), 200);

  const result = await db.query(
    `
      SELECT
        id::int AS id,
        agent,
        memory_type,
        reference_type,
        reference_id,
        memory_text,
        metadata,
        created_at
      FROM agent_memories
      WHERE lower(agent) = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
    `,
    [address, limit],
  );

  res.json({
    agent: address,
    count: result.rowCount,
    items: result.rows,
  });
});

app.post('/agent/:id/memory', async (req, res) => {
  const address = req.params.id.toLowerCase();
  const parsed = memoryWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const inserted = await db.query(
    `
      INSERT INTO agent_memories (agent, memory_type, reference_type, reference_id, memory_text, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      RETURNING id::int AS id, created_at
    `,
    [
      address,
      parsed.data.memoryType,
      parsed.data.referenceType ?? null,
      parsed.data.referenceId ?? null,
      parsed.data.text,
      parsed.data.metadata ? JSON.stringify(parsed.data.metadata) : null,
    ],
  );

  res.json({ ok: true, memory: inserted.rows[0] });
});

type DaoSharesMember = {
  address: string;
  handle: string | null;
  walletBalance: string;
  bondedBalance: string;
  governanceBalance: string;
  availableBalance: string;
  totalVotedStake: string;
  supportStake: string;
  governanceShareBps: number;
  governanceSharePct: number;
  bondedShareBps: number;
  bondedSharePct: number;
};

type DaoSharesResponse = {
  generatedAt: string;
  treasuryTokenSymbol: string;
  treasuryTokenDecimals: number;
  totalBonded: string;
  totalGovernance: string;
  memberCount: number;
  members: DaoSharesMember[];
};

const daoSharesCache = {
  payload: null as DaoSharesResponse | null,
  cachedAtMs: 0,
  refreshInFlight: null as Promise<DaoSharesResponse> | null,
};

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resolveDaoTokenAddress(): Promise<Address | null> {
  let daoTokenAddress: Address | null = /^0x[a-fA-F0-9]{40}$/.test(env.DAO_TOKEN_ADDRESS_BASE ?? '')
    ? (env.DAO_TOKEN_ADDRESS_BASE as Address)
    : null;
  if (!daoTokenAddress && env.STAKE_VAULT_ADDRESS) {
    try {
      const tokenAddress = await publicClient.readContract({
        address: env.STAKE_VAULT_ADDRESS as Address,
        abi: stakeVaultAbi,
        functionName: 'governanceToken',
      });
      if (typeof tokenAddress === 'string' && /^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        daoTokenAddress = tokenAddress as Address;
      }
    } catch {
      daoTokenAddress = null;
    }
  }

  return daoTokenAddress;
}

async function computeDaoSharesSnapshot(): Promise<DaoSharesResponse> {
  const daoTokenAddress = await resolveDaoTokenAddress();
  const [agentsResult, votesResult] = await Promise.all([
    db.query('SELECT lower(address) AS address, handle FROM agents'),
    db.query(
      `
        SELECT
          lower(voter) AS address,
          COALESCE(SUM(stake_amount::numeric), 0) AS total_voted_stake,
          COALESCE(SUM(CASE WHEN support THEN stake_amount::numeric ELSE 0 END), 0) AS support_stake
        FROM votes
        GROUP BY lower(voter)
      `,
    ),
  ]);

  const addresses = new Set<string>();
  const handleByAddress = new Map<string, string | null>();
  for (const row of agentsResult.rows) {
    addresses.add(row.address);
    handleByAddress.set(row.address, (row.handle as string | null) ?? null);
  }
  for (const row of votesResult.rows) {
    addresses.add(row.address);
  }

  const voteStakeByAddress = new Map<string, { total: bigint; support: bigint }>();
  for (const row of votesResult.rows) {
    voteStakeByAddress.set(row.address, {
      total: parseBigIntLike(row.total_voted_stake),
      support: parseBigIntLike(row.support_stake),
    });
  }

  const addressList = [...addresses].filter((address) => /^0x[a-fA-F0-9]{40}$/.test(address));
  const withStake = await Promise.all(
    addressList.map(async (address) => {
      let bondedBalance = 0n;
      let availableBalance = 0n;
      let walletBalance = 0n;

      if (env.STAKE_VAULT_ADDRESS) {
        try {
          const [bonded, available] = await Promise.all([
            publicClient.readContract({
              address: env.STAKE_VAULT_ADDRESS as Address,
              abi: stakeVaultAbi,
              functionName: 'bondedBalance',
              args: [address as Address],
            }),
            publicClient.readContract({
              address: env.STAKE_VAULT_ADDRESS as Address,
              abi: stakeVaultAbi,
              functionName: 'availableBalance',
              args: [address as Address],
            }),
          ]);
          bondedBalance = parseBigIntLike(bonded);
          availableBalance = parseBigIntLike(available);
        } catch {
          bondedBalance = 0n;
          availableBalance = 0n;
        }
      }

      if (daoTokenAddress) {
        try {
          const wallet = await publicClient.readContract({
            address: daoTokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address as Address],
          });
          walletBalance = parseBigIntLike(wallet);
        } catch {
          walletBalance = 0n;
        }
      }

      return {
        address,
        walletBalance,
        bondedBalance,
        availableBalance,
        governanceBalance: walletBalance + bondedBalance,
      };
    }),
  );

  const totalBonded = withStake.reduce((acc, item) => acc + item.bondedBalance, 0n);
  const totalGovernance = withStake.reduce((acc, item) => acc + item.governanceBalance, 0n);
  const members = withStake
    .map((item) => {
      const voted = voteStakeByAddress.get(item.address) ?? { total: 0n, support: 0n };
      const shareBps = totalGovernance > 0n ? Number((item.governanceBalance * 10_000n) / totalGovernance) : 0;

      return {
        address: item.address,
        handle: handleByAddress.get(item.address) ?? null,
        walletBalance: item.walletBalance.toString(),
        bondedBalance: item.bondedBalance.toString(),
        governanceBalance: item.governanceBalance.toString(),
        availableBalance: item.availableBalance.toString(),
        totalVotedStake: voted.total.toString(),
        supportStake: voted.support.toString(),
        governanceShareBps: shareBps,
        governanceSharePct: shareBps / 100,
        // Legacy field names kept for existing clients.
        bondedShareBps: shareBps,
        bondedSharePct: shareBps / 100,
      };
    })
    .sort((a, b) => {
      const governanceA = BigInt(a.governanceBalance);
      const governanceB = BigInt(b.governanceBalance);
      if (governanceA === governanceB) return a.address.localeCompare(b.address);
      return governanceA > governanceB ? -1 : 1;
    });

  return {
    generatedAt: new Date().toISOString(),
    treasuryTokenSymbol: env.DAO_TOKEN_SYMBOL,
    treasuryTokenDecimals: env.DAO_TOKEN_DECIMALS,
    totalBonded: totalBonded.toString(),
    totalGovernance: totalGovernance.toString(),
    memberCount: members.length,
    members,
  };
}

function refreshDaoSharesCache(): Promise<DaoSharesResponse> {
  if (daoSharesCache.refreshInFlight) {
    return daoSharesCache.refreshInFlight;
  }

  const refreshPromise = computeDaoSharesSnapshot()
    .then((payload) => {
      daoSharesCache.payload = payload;
      daoSharesCache.cachedAtMs = Date.now();
      return payload;
    })
    .finally(() => {
      if (daoSharesCache.refreshInFlight === refreshPromise) {
        daoSharesCache.refreshInFlight = null;
      }
    });

  daoSharesCache.refreshInFlight = refreshPromise;
  return refreshPromise;
}

async function loadDaoSharesFromCache(): Promise<DaoSharesResponse> {
  const nowMs = Date.now();
  const cachedPayload = daoSharesCache.payload;

  if (cachedPayload) {
    const ageMs = nowMs - daoSharesCache.cachedAtMs;
    if (ageMs <= env.DAO_SHARES_CACHE_TTL_MS) {
      return cachedPayload;
    }

    if (ageMs <= env.DAO_SHARES_CACHE_MAX_STALE_MS) {
      void refreshDaoSharesCache().catch((error) => {
        // eslint-disable-next-line no-console
        console.warn(`[api] dao share cache refresh failed: ${formatErrorMessage(error)}`);
      });
      return cachedPayload;
    }
  }

  return refreshDaoSharesCache();
}

app.get('/dao/shares', async (_req, res) => {
  try {
    const payload = await loadDaoSharesFromCache();
    res.set('Cache-Control', 'public, max-age=5, stale-while-revalidate=60');
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: `failed to load dao shares: ${formatErrorMessage(error)}` });
  }
});

app.post('/posts/body', async (req, res) => {
  const parsed = postBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const computedHash = keccak256(toHex(buildCanonicalPostContent(parsed.data.title, parsed.data.body)));
  if (computedHash.toLowerCase() !== parsed.data.contentHash.toLowerCase()) {
    res.status(400).json({ error: 'contentHash does not match body' });
    return;
  }

  await db.query(
    `
      INSERT INTO post_bodies (content_hash, title, body, author, tx_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (content_hash)
      DO UPDATE SET
        title = EXCLUDED.title,
        body = EXCLUDED.body,
        author = COALESCE(post_bodies.author, EXCLUDED.author),
        tx_hash = COALESCE(post_bodies.tx_hash, EXCLUDED.tx_hash),
        updated_at = NOW()
    `,
    [
      parsed.data.contentHash,
      parsed.data.title ?? null,
      parsed.data.body,
      parsed.data.author ?? null,
      parsed.data.txHash ?? null,
    ],
  );
  await db.query(
    `
      UPDATE posts
      SET post_title = COALESCE($2, post_title)
      WHERE lower(content_hash) = lower($1)
    `,
    [parsed.data.contentHash, parsed.data.title ?? null],
  );

  res.json({ ok: true });
});

app.post('/comments/body', async (req, res) => {
  const parsed = commentBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const normalizedBody = parsed.data.body.trim();
  const computedHash = keccak256(toHex(normalizedBody));
  if (computedHash.toLowerCase() !== parsed.data.contentHash.toLowerCase()) {
    res.status(400).json({ error: 'contentHash does not match body' });
    return;
  }

  const parentCommentId = parsed.data.parentCommentId ?? null;

  await db.query(
    `
      INSERT INTO comments (
        id,
        parent_post_id,
        parent_comment_id,
        author,
        body,
        content_hash,
        source,
        created_at,
        tx_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'onchain', NOW(), $7)
      ON CONFLICT (id)
      DO UPDATE SET
        parent_post_id = EXCLUDED.parent_post_id,
        parent_comment_id = COALESCE(comments.parent_comment_id, EXCLUDED.parent_comment_id),
        author = EXCLUDED.author,
        body = EXCLUDED.body,
        content_hash = EXCLUDED.content_hash,
        source = 'onchain',
        tx_hash = EXCLUDED.tx_hash
    `,
    [
      parsed.data.commentId,
      parsed.data.parentPostId,
      parentCommentId,
      parsed.data.author,
      normalizedBody,
      parsed.data.contentHash,
      parsed.data.txHash,
    ],
  );

  res.json({ ok: true });
});

app.post('/actions/draft', async (req, res) => {
  const parsed = draftActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const amountRaw = parsed.data.amountInToken ?? parsed.data.amountInUSDC;
  const amountIn = BigInt(amountRaw ?? 0);

  try {
    const draft = await draftSwapAction({
      proposer: parsed.data.proposer as `0x${string}`,
      tokenOut: parsed.data.tokenOut as `0x${string}`,
      amountInToken: amountIn,
      slippageBps: parsed.data.slippageBps,
      deadlineSeconds: parsed.data.deadlineSeconds,
    });

    res.json({
      ...draft,
      treasuryTokenSymbol: env.DAO_TOKEN_SYMBOL,
      treasuryTokenDecimals: env.DAO_TOKEN_DECIMALS,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'failed to draft action',
    });
  }
});

app.get('/actions/:id', async (req, res) => {
  const actionId = Number(req.params.id);

  const [actionResult, votesResult, executionResult] = await Promise.all([
    db.query('SELECT * FROM actions WHERE id = $1', [actionId]),
    db.query('SELECT * FROM votes WHERE action_id = $1 ORDER BY created_at ASC', [actionId]),
    db.query('SELECT * FROM executions WHERE action_id = $1 ORDER BY created_at DESC', [actionId]),
  ]);

  if (actionResult.rowCount === 0) {
    res.status(404).json({ error: 'action not found' });
    return;
  }

  res.json({
    action: actionResult.rows[0],
    votes: votesResult.rows,
    executions: executionResult.rows,
  });
});

async function ensureApiSchema(): Promise<void> {
  await db.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_title TEXT');
  await db.query(
    `
      CREATE TABLE IF NOT EXISTS post_bodies (
        content_hash TEXT PRIMARY KEY,
        title TEXT,
        body TEXT NOT NULL,
        author TEXT,
        tx_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );
  await db.query('ALTER TABLE post_bodies ADD COLUMN IF NOT EXISTS title TEXT');
  await db.query('ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id BIGINT');
  await db.query('ALTER TABLE comments ADD COLUMN IF NOT EXISTS body TEXT');
  await db.query("ALTER TABLE comments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'onchain'");
  await db.query('CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments(parent_comment_id)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_comments_parent_post_created_at ON comments(parent_post_id, created_at)');
  await db.query(
    `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'comments_parent_comment_fk'
        ) THEN
          ALTER TABLE comments
          ADD CONSTRAINT comments_parent_comment_fk
          FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE;
        END IF;
      END
      $$;
    `,
  );
  await db.query('CREATE INDEX IF NOT EXISTS idx_posts_post_title ON posts(post_title)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_post_bodies_author ON post_bodies(author)');
  await db.query(
    `
      CREATE TABLE IF NOT EXISTS agent_memories (
        id BIGSERIAL PRIMARY KEY,
        agent TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        reference_type TEXT,
        reference_id TEXT,
        memory_text TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  );
  await db.query('CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_created_at ON agent_memories((lower(agent)), created_at DESC)');
  await db.query(
    `
      UPDATE posts p
      SET post_title = COALESCE(p.post_title, pb.title, NULLIF(split_part(pb.body, E'\n', 1), ''))
      FROM post_bodies pb
      WHERE lower(pb.content_hash) = lower(p.content_hash)
        AND p.post_title IS NULL
    `,
  );
}

async function initializeDaoSharesCache(): Promise<void> {
  try {
    await refreshDaoSharesCache();
    // eslint-disable-next-line no-console
    console.log('[api] dao share cache primed');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[api] initial dao share cache warmup failed: ${formatErrorMessage(error)}`);
  }

  const refreshTimer = setInterval(() => {
    void refreshDaoSharesCache().catch((error) => {
      // eslint-disable-next-line no-console
      console.warn(`[api] scheduled dao share cache refresh failed: ${formatErrorMessage(error)}`);
    });
  }, env.DAO_SHARES_CACHE_REFRESH_INTERVAL_MS);
  refreshTimer.unref();
}

async function main() {
  await ensureApiSchema();
  await initializeDaoSharesCache();
  app.listen(env.API_PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on :${env.API_PORT}`);
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[api] fatal', error);
  process.exit(1);
});
