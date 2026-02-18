import dotenv from 'dotenv';
import { createPublicClient, http, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { env } from './config.js';
import { db, getIndexerCursor, setIndexerCursor } from './db.js';
import { ACTION_EXECUTOR_EVENTS, AGENT_REGISTRY_EVENTS, FORUM_EVENTS, REPUTATION_EVENTS } from './abi.js';
import { createAlchemyRateLimitedFetch } from './alchemyRateLimiter.js';

dotenv.config();

const INDEXER_CURSOR_KEY = `base_last_indexed_block_${env.BASE_CHAIN_ID}`;
const CHAIN_BY_ID = {
  8453: base,
  84532: baseSepolia,
} as const;
const runtimeChain = CHAIN_BY_ID[env.BASE_CHAIN_ID as keyof typeof CHAIN_BY_ID] ?? base;
const logBlockRange = BigInt(env.INDEXER_LOG_BLOCK_RANGE);
const LOG_FETCH_BASE_DELAY_MS = 1000;
const LOG_FETCH_MAX_DELAY_MS = 30000;
const INDEXER_CU_CAP = 300;
const indexerCuLimit = Math.min(env.INDEXER_ALCHEMY_CU_PER_SECOND_LIMIT, INDEXER_CU_CAP);

if (env.INDEXER_ALCHEMY_CU_PER_SECOND_LIMIT > INDEXER_CU_CAP) {
  // eslint-disable-next-line no-console
  console.warn(
    `[indexer] INDEXER_ALCHEMY_CU_PER_SECOND_LIMIT capped to ${INDEXER_CU_CAP} CU/s ` +
      `(requested ${env.INDEXER_ALCHEMY_CU_PER_SECOND_LIMIT})`,
  );
}

const alchemyFetch = createAlchemyRateLimitedFetch('indexer', indexerCuLimit);

const client = createPublicClient({
  chain: runtimeChain,
  transport: http(env.BASE_RPC_URL, { fetchFn: alchemyFetch }),
});

const blockTimeCache = new Map<bigint, string>();

const actionStatusMap: Record<number, string> = {
  0: 'NONE',
  1: 'CREATED',
  2: 'EXECUTED',
  3: 'FAILED',
  4: 'CANCELLED',
};

const actionTypeMap: Record<number, string> = {
  0: 'SWAP_USDC_TO_TOKEN',
  1: 'TRANSFER_USDC',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLogsWithRetry(params: any, label: string): Promise<any[]> {
  let attempt = 0;
  while (true) {
    try {
      return (await (client as any).getLogs(params)) as any[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = message.includes('429') || message.includes('Too Many Requests');
      if (!retryable) {
        throw error;
      }

      const delayMs = Math.min(LOG_FETCH_BASE_DELAY_MS * 2 ** attempt, LOG_FETCH_MAX_DELAY_MS);
      // eslint-disable-next-line no-console
      console.warn(`[indexer] ${label} logs rate-limited, retrying in ${delayMs}ms (attempt ${attempt + 1})`);
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

async function getBlockTimestamp(blockNumber: bigint): Promise<string> {
  if (blockTimeCache.has(blockNumber)) {
    return blockTimeCache.get(blockNumber)!;
  }

  const block = await client.getBlock({ blockNumber });
  const iso = new Date(Number(block.timestamp) * 1000).toISOString();
  blockTimeCache.set(blockNumber, iso);
  return iso;
}

async function handleAgentRegistryLogs(logs: any[]) {
  for (const log of logs) {
    if (!log.eventName || !log.args) continue;

    if (log.eventName === 'AgentRegistered') {
      const args = log.args as {
        agent: Address;
        owner: Address;
        handle: string;
        metadataHash: `0x${string}`;
      };

      const createdAt = await getBlockTimestamp(log.blockNumber!);

      await db.query(
        `
          INSERT INTO agents (address, owner, handle, metadata_hash, verified, created_at)
          VALUES ($1, $2, $3, $4, false, $5)
          ON CONFLICT (address)
          DO UPDATE SET owner = EXCLUDED.owner, handle = EXCLUDED.handle, metadata_hash = EXCLUDED.metadata_hash
        `,
        [args.agent, args.owner, args.handle, args.metadataHash, createdAt],
      );
    }

    if (log.eventName === 'AgentUpdated') {
      const args = log.args as {
        agent: Address;
        handle: string;
        metadataHash: `0x${string}`;
        verified: boolean;
      };

      await db.query(
        `
          UPDATE agents
          SET handle = $2, metadata_hash = $3, verified = $4
          WHERE address = $1
        `,
        [args.agent, args.handle, args.metadataHash, args.verified],
      );
    }
  }
}

async function handleForumLogs(logs: any[]) {
  for (const log of logs) {
    if (!log.eventName || !log.args || !log.transactionHash || !log.blockNumber) continue;

    if (log.eventName === 'PostCreated') {
      const args = log.args as {
        postId: bigint;
        author: Address;
        postType: number;
        contentHash: `0x${string}`;
        actionId: bigint;
      };

      const createdAt = await getBlockTimestamp(log.blockNumber);

      await db.query(
        `
          INSERT INTO posts (id, author, post_type, content_hash, action_id, created_at, tx_hash)
          VALUES ($1, $2, $3, $4, NULLIF($5, 0), $6, $7)
          ON CONFLICT (id)
          DO UPDATE SET
            author = EXCLUDED.author,
            post_type = EXCLUDED.post_type,
            content_hash = EXCLUDED.content_hash,
            action_id = EXCLUDED.action_id,
            created_at = EXCLUDED.created_at,
            tx_hash = EXCLUDED.tx_hash
        `,
        [
          args.postId.toString(),
          args.author,
          Number(args.postType),
          args.contentHash,
          args.actionId.toString(),
          createdAt,
          log.transactionHash,
        ],
      );
    }

    if (log.eventName === 'CommentCreated') {
      const args = log.args as {
        commentId: bigint;
        parentPostId: bigint;
        author: Address;
        contentHash: `0x${string}`;
      };

      const createdAt = await getBlockTimestamp(log.blockNumber);

      await db.query(
        `
          INSERT INTO comments (id, parent_post_id, author, content_hash, created_at, tx_hash)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id)
          DO UPDATE SET
            parent_post_id = EXCLUDED.parent_post_id,
            author = EXCLUDED.author,
            content_hash = EXCLUDED.content_hash,
            created_at = EXCLUDED.created_at,
            tx_hash = EXCLUDED.tx_hash
        `,
        [
          args.commentId.toString(),
          args.parentPostId.toString(),
          args.author,
          args.contentHash,
          createdAt,
          log.transactionHash,
        ],
      );
    }
  }
}

async function handleActionExecutorLogs(logs: any[]) {
  for (const log of logs) {
    if (!log.eventName || !log.args || !log.blockNumber) continue;

    if (log.eventName === 'ActionCreated') {
      const args = log.args as {
        actionId: bigint;
        postId: bigint;
        proposer: Address;
        actionType: number;
        amountIn: bigint;
        minAmountOut: bigint;
        deadline: bigint;
        calldataHash: `0x${string}`;
      };

      const createdAt = await getBlockTimestamp(log.blockNumber);

      await db.query(
        `
          INSERT INTO actions (
            id,
            post_id,
            proposer,
            type,
            token_out,
            amount_in,
            min_amount_out,
            deadline,
            calldata_hash,
            status,
            created_at
          )
          VALUES ($1, NULLIF($2, 0), $3, $4, NULL, $5, $6, $7, $8, 'CREATED', $9)
          ON CONFLICT (id)
          DO UPDATE SET
            post_id = COALESCE(EXCLUDED.post_id, actions.post_id),
            proposer = EXCLUDED.proposer,
            type = EXCLUDED.type,
            amount_in = EXCLUDED.amount_in,
            min_amount_out = EXCLUDED.min_amount_out,
            deadline = EXCLUDED.deadline,
            calldata_hash = EXCLUDED.calldata_hash
        `,
        [
          args.actionId.toString(),
          args.postId.toString(),
          args.proposer,
          actionTypeMap[Number(args.actionType)] ?? `UNKNOWN_${String(args.actionType)}`,
          args.amountIn.toString(),
          args.minAmountOut.toString(),
          args.deadline.toString(),
          args.calldataHash,
          createdAt,
        ],
      );
    }

    if (log.eventName === 'ActionPostAttached') {
      const args = log.args as { actionId: bigint; postId: bigint };

      await db.query('UPDATE actions SET post_id = $2 WHERE id = $1', [args.actionId.toString(), args.postId.toString()]);
      await db.query('UPDATE posts SET action_id = $2 WHERE id = $1', [args.postId.toString(), args.actionId.toString()]);
    }

    if (log.eventName === 'ActionVoted') {
      const args = log.args as {
        actionId: bigint;
        voter: Address;
        support: boolean;
        stakeAmount: bigint;
      };

      const createdAt = await getBlockTimestamp(log.blockNumber);

      await db.query(
        `
          INSERT INTO votes (action_id, voter, support, stake_amount, block_number, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (action_id, voter)
          DO NOTHING
        `,
        [
          args.actionId.toString(),
          args.voter,
          args.support,
          args.stakeAmount.toString(),
          log.blockNumber.toString(),
          createdAt,
        ],
      );
    }

    if (log.eventName === 'ActionStatusUpdated') {
      const args = log.args as { actionId: bigint; status: number };
      const status = actionStatusMap[Number(args.status)] ?? `UNKNOWN_${String(args.status)}`;

      await db.query(
        `
          UPDATE actions
          SET status = $2,
              executed_at = CASE WHEN $2 IN ('EXECUTED', 'FAILED', 'CANCELLED') THEN NOW() ELSE executed_at END
          WHERE id = $1
        `,
        [args.actionId.toString(), status],
      );
    }

    if (log.eventName === 'ActionExecuted') {
      if (!log.transactionHash) continue;

      const args = log.args as {
        actionId: bigint;
        executor: Address;
        success: boolean;
      };

      const txReceipt = await client.getTransactionReceipt({ hash: log.transactionHash });
      const createdAt = await getBlockTimestamp(log.blockNumber);

      await db.query(
        `
          INSERT INTO executions (action_id, executor, tx_hash, success, gas_used, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING
        `,
        [
          args.actionId.toString(),
          args.executor,
          log.transactionHash,
          args.success,
          txReceipt.gasUsed.toString(),
          createdAt,
        ],
      );
    }
  }
}

async function handleReputationLogs(logs: any[]) {
  for (const log of logs) {
    if (!log.eventName || !log.args) continue;

    if (log.eventName === 'PostRecorded') {
      const args = log.args as {
        agent: Address;
        postsAccepted: bigint;
      };

      await db.query(
        `
          INSERT INTO reputation (agent, posts_accepted, actions_succeeded, actions_failed, score)
          VALUES ($1, $2::bigint, 0, 0, $3::numeric)
          ON CONFLICT (agent)
          DO UPDATE SET posts_accepted = EXCLUDED.posts_accepted
        `,
        [args.agent, args.postsAccepted.toString(), args.postsAccepted.toString()],
      );

      await refreshScore(args.agent);
    }

    if (log.eventName === 'ActionRecorded') {
      const args = log.args as {
        agent: Address;
        actionsSucceeded: bigint;
        actionsFailed: bigint;
      };

      await db.query(
        `
          INSERT INTO reputation (agent, posts_accepted, actions_succeeded, actions_failed, score)
          VALUES ($1, 0, $2, $3, 0)
          ON CONFLICT (agent)
          DO UPDATE SET
            actions_succeeded = EXCLUDED.actions_succeeded,
            actions_failed = EXCLUDED.actions_failed
        `,
        [args.agent, args.actionsSucceeded.toString(), args.actionsFailed.toString()],
      );

      await refreshScore(args.agent);
    }
  }
}

async function refreshScore(agent: string) {
  await db.query(
    `
      UPDATE reputation
      SET score = GREATEST(posts_accepted + (actions_succeeded * 10) - (actions_failed * 5), 0)
      WHERE agent = $1
    `,
    [agent],
  );
}

async function poll(): Promise<void> {
  const head = await client.getBlockNumber();
  const finalBlock = head > BigInt(env.INDEXER_FINALITY_BLOCKS) ? head - BigInt(env.INDEXER_FINALITY_BLOCKS) : 0n;

  const lastIndexed = await getIndexerCursor(INDEXER_CURSOR_KEY);
  const configuredStart = env.INDEXER_START_BLOCK ?? finalBlock;
  const bootstrapFrom = configuredStart > finalBlock ? finalBlock : configuredStart;
  let fromBlock = lastIndexed === null ? bootstrapFrom : lastIndexed + 1n;

  // Cursor can become invalid when switching networks but reusing the same database.
  if (lastIndexed !== null && lastIndexed > finalBlock) {
    // eslint-disable-next-line no-console
    console.warn(
      `[indexer] cursor ${lastIndexed} is ahead of final block ${finalBlock}; ` +
        `resetting scan start to ${bootstrapFrom} for chain ${env.BASE_CHAIN_ID}`,
    );
    fromBlock = bootstrapFrom;
  }

  if (fromBlock > finalBlock) {
    return;
  }

  const originalFrom = fromBlock;

  while (fromBlock <= finalBlock) {
    const toBlock = fromBlock + logBlockRange - 1n < finalBlock ? fromBlock + logBlockRange - 1n : finalBlock;

    if (env.AGENT_REGISTRY_ADDRESS) {
      const logs = await getLogsWithRetry({
        address: env.AGENT_REGISTRY_ADDRESS as Address,
        events: AGENT_REGISTRY_EVENTS,
        fromBlock,
        toBlock,
        strict: false,
      }, 'agent-registry');

      await handleAgentRegistryLogs(logs as any[]);
    }

    if (env.FORUM_ADDRESS) {
      const logs = await getLogsWithRetry({
        address: env.FORUM_ADDRESS as Address,
        events: FORUM_EVENTS,
        fromBlock,
        toBlock,
        strict: false,
      }, 'forum');

      await handleForumLogs(logs as any[]);
    }

    if (env.ACTION_EXECUTOR_ADDRESS) {
      const logs = await getLogsWithRetry({
        address: env.ACTION_EXECUTOR_ADDRESS as Address,
        events: ACTION_EXECUTOR_EVENTS,
        fromBlock,
        toBlock,
        strict: false,
      }, 'action-executor');

      await handleActionExecutorLogs(logs as any[]);
    }

    if (env.REPUTATION_ADDRESS) {
      const logs = await getLogsWithRetry({
        address: env.REPUTATION_ADDRESS as Address,
        events: REPUTATION_EVENTS,
        fromBlock,
        toBlock,
        strict: false,
      }, 'reputation');

      await handleReputationLogs(logs as any[]);
    }

    await setIndexerCursor(INDEXER_CURSOR_KEY, toBlock);
    fromBlock = toBlock + 1n;
  }

  // eslint-disable-next-line no-console
  console.log(`[indexer] indexed blocks ${originalFrom}..${finalBlock} (chunk=${env.INDEXER_LOG_BLOCK_RANGE})`);
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('[indexer] starting');

  await poll();
  setInterval(() => {
    poll().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[indexer] poll failed', error);
    });
  }, env.INDEXER_POLL_INTERVAL_MS);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[indexer] fatal', error);
  process.exit(1);
});
