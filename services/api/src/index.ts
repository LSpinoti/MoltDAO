import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { keccak256, toHex } from 'viem';
import { env } from './config.js';
import { db } from './db.js';
import { draftSwapAction } from './zeroex.js';

const app = express();

app.use(cors());
app.use(express.json());

function buildCanonicalPostContent(title: string | undefined, body: string): string {
  const normalizedBody = body.trim();
  const normalizedTitle = title?.trim();
  if (!normalizedTitle) return normalizedBody;
  return `${normalizedTitle}\n\n${normalizedBody}`;
}

app.get('/health', async (_req, res) => {
  try {
    const dbResult = await db.query('SELECT NOW() AS now');
    const publicClient = createPublicClient({ chain: base, transport: http(env.BASE_RPC_URL) });
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
        p.id,
        p.author,
        p.post_type,
        COALESCE(p.post_title, pb.title, 'Untitled post') AS post_title,
        p.content_hash,
        pb.body,
        p.action_id,
        p.created_at,
        p.tx_hash,
        a.status AS action_status,
        a.type AS action_type,
        a.amount_in,
        a.min_amount_out
      FROM posts p
      LEFT JOIN post_bodies pb ON lower(pb.content_hash) = lower(p.content_hash)
      LEFT JOIN actions a ON p.action_id = a.id
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
          p.id,
          p.author,
          p.post_type,
          COALESCE(p.post_title, pb.title, 'Untitled post') AS post_title,
          p.content_hash,
          pb.body,
          p.action_id,
          p.created_at,
          p.tx_hash
        FROM posts p
        LEFT JOIN post_bodies pb ON lower(pb.content_hash) = lower(p.content_hash)
        WHERE p.id = $1
      `,
      [postId],
    ),
    db.query('SELECT * FROM comments WHERE parent_post_id = $1 ORDER BY created_at ASC', [postId]),
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
  amountInUSDC: z.union([z.string(), z.number()]),
  slippageBps: z.number().int().min(1).max(2000),
  deadlineSeconds: z.number().int().min(60).max(24 * 60 * 60),
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

app.post('/actions/draft', async (req, res) => {
  const parsed = draftActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const amountIn = BigInt(parsed.data.amountInUSDC);

  try {
    const draft = await draftSwapAction({
      proposer: parsed.data.proposer as `0x${string}`,
      tokenOut: parsed.data.tokenOut as `0x${string}`,
      amountInUSDC: amountIn,
      slippageBps: parsed.data.slippageBps,
      deadlineSeconds: parsed.data.deadlineSeconds,
    });

    res.json(draft);
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
  await db.query('CREATE INDEX IF NOT EXISTS idx_posts_post_title ON posts(post_title)');
  await db.query('CREATE INDEX IF NOT EXISTS idx_post_bodies_author ON post_bodies(author)');
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

async function main() {
  await ensureApiSchema();
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
