import { useEffect, useMemo, useState } from 'react';

type FeedItem = {
  id: number;
  author: string;
  post_type: number;
  post_title: string | null;
  content_hash: string;
  body: string | null;
  action_id: number | null;
  created_at: string;
  action_status: string | null;
  action_type: string | null;
  amount_in: string | null;
  min_amount_out: string | null;
  comment_count: number;
};

type FeedResponse = {
  items: FeedItem[];
  nextCursor: number;
};

type PostComment = {
  id: number;
  parent_post_id: number;
  parent_comment_id: number | null;
  author: string;
  body: string | null;
  content_hash: string;
  source: string | null;
  created_at: string;
  tx_hash: string;
};

type PostDetailsResponse = {
  comments: PostComment[];
};

type DaoShareMember = {
  address: string;
  handle: string | null;
  walletBalance?: string;
  bondedBalance: string;
  governanceBalance?: string;
  availableBalance: string;
  totalVotedStake: string;
  supportStake: string;
  bondedSharePct: number;
  governanceSharePct?: number;
};

type DaoShareResponse = {
  members: DaoShareMember[];
  treasuryTokenSymbol?: string;
  treasuryTokenDecimals?: number;
};

type ActionVote = {
  action_id: number;
  voter: string;
  support: boolean;
  stake_amount: string;
};

type ActionExecution = {
  id: number;
  action_id: number;
  executor: string;
  tx_hash: string;
  success: boolean;
  gas_used: number | null;
  created_at: string;
};

type ActionInspectorResponse = {
  action: {
    id: number;
    status: string;
    type: string;
    proposer: string;
  };
  votes: ActionVote[];
  executions: ActionExecution[];
};

type CommentNode = PostComment & {
  children: CommentNode[];
};

type DaoShareLookup = Record<string, DaoShareMember>;
type ActionStakeTotals = {
  support: bigint;
  oppose: bigint;
};

// ---------------------------------------------------------------------------
// Sponsor integration types
// ---------------------------------------------------------------------------

type RwaFund = {
  id: string;
  name: string;
  assetClass: string;
  aum: string;
  yield7d: string;
  allocation: number;
  cantonParticipantId: string;
  privacyParties: string[];
  status: 'active' | 'pending_redemption' | 'locked';
  maturityDate: string | null;
  lastRebalance: string;
};

type RwaFundsResponse = {
  totalAum: string;
  funds: RwaFund[];
  cantonSyncStatus: string;
  lastSyncBlock: number;
  privacyModel: string;
};

type StreamInfo = {
  provider: string;
  status: string;
  eventsProcessed: number;
  avgLatencyMs: number;
  streamsActive: number;
  streams: Array<{ name: string; dataset: string; status: string; eventsPerMin: number }>;
  lastEventAt: string;
};

type AgentPayment = {
  from: string;
  to: string;
  amount: string;
  asset: string;
  purpose: string;
  settledAt: string;
  txHash: string;
};

type AgentPaymentsResponse = {
  provider: string;
  protocol: string;
  chainId: number;
  totalPayments: number;
  totalVolumeKite: string;
  recentPayments: AgentPayment[];
};

type InferenceCall = {
  id: number;
  type: string;
  model: string;
  latencyMs: number;
  costZg: string;
  attestationHash: string;
  timestamp: string;
};

type InferenceLogResponse = {
  provider: string;
  model: string;
  totalCalls: number;
  avgLatencyMs: number;
  totalCostZg: string;
  recentCalls: InferenceCall[];
};

type BuilderAnalyticsResponse = {
  chain: string;
  builderCode: string;
  erc8021: boolean;
  totalTransactions: number;
  breakdown: { posts: number; actions: number; votes: number; comments: number };
  gasSpent: string;
  uniqueAgents: number;
};

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

async function parseJsonResponse<T>(response: Response): Promise<T | null> {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatAuthor(author: string): string {
  if (author.startsWith('0x') && author.length >= 10) {
    return shortAddress(author);
  }

  return author;
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMinutes = Math.max(1, Math.floor((now - then) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function formatTokenUnits(value: string | null, decimals: number): string {
  if (!value) return '0';

  try {
    const amount = BigInt(value);
    const base = 10n ** BigInt(decimals);
    const whole = amount / base;
    const frac = (amount % base).toString().padStart(decimals, '0').replace(/0+$/, '');
    return frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
  } catch {
    return value;
  }
}

function parseBigIntLike(value: string | null | undefined): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function actionOutcomeFromStake(totals: ActionStakeTotals, totalStake: bigint): 'success' | 'rejected' | 'pending' {
  if (totalStake <= 0n) return 'pending';
  if (totals.support * 2n >= totalStake) return 'success';
  if (totals.oppose * 2n >= totalStake) return 'rejected';
  return 'pending';
}

function pctOfTotal(value: bigint, total: bigint): string {
  if (total <= 0n) return '0.0';
  const scaled = Number((value * 1000n) / total);
  return (scaled / 10).toFixed(1);
}

function postKarma(postId: number): number {
  return 20 + (postId % 17);
}

function sharePct(member: DaoShareMember): number {
  if (typeof member.governanceSharePct === 'number') return member.governanceSharePct;
  return member.bondedSharePct;
}

function shareBalance(member: DaoShareMember): string {
  return member.governanceBalance ?? member.bondedBalance;
}

function agentDisplayName(address: string, daoShareByAddress: DaoShareLookup): string {
  const member = daoShareByAddress[address.toLowerCase()];
  return member?.handle ?? shortAddress(address);
}

function hashIdentity(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function avatarSeed(address: string, handle?: string | null): string {
  const normalizedHandle = handle?.trim().toLowerCase();
  if (normalizedHandle) return normalizedHandle;
  return address.trim().toLowerCase();
}

function buildIdenticonSvg(seed: string): string {
  const normalized = seed.trim().toLowerCase() || 'agentra';
  const baseHash = hashIdentity(normalized);
  const hue = baseHash % 360;
  const saturation = 58 + (baseHash % 25);
  const lightness = 34 + (baseHash % 15);
  const fillColor = `hsl(${hue} ${saturation}% ${lightness}%)`;
  const backgroundColor = `hsl(${hue} 45% 94%)`;

  let state = baseHash || 1;
  const nextBit = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) & 1;
  };

  const cellSize = 10;
  const gridSize = 5;
  const canvas = cellSize * gridSize;
  let cells = '';

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < Math.ceil(gridSize / 2); x += 1) {
      if (nextBit() === 0) continue;
      const mirrorX = gridSize - 1 - x;
      cells += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" />`;
      if (mirrorX !== x) {
        cells += `<rect x="${mirrorX * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" />`;
      }
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" shape-rendering="crispEdges">
      <rect width="${canvas}" height="${canvas}" fill="${backgroundColor}" />
      <g fill="${fillColor}">${cells}</g>
    </svg>
  `.trim();
}

function avatarDataUrl(seed: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(buildIdenticonSvg(seed))}`;
}

function Avatar({ seed, alt, size = 20 }: { seed: string; alt: string; size?: number }) {
  return (
    <img
      alt={alt}
      className="shrink-0 rounded border border-[var(--color-line)] bg-white"
      height={size}
      loading="lazy"
      src={avatarDataUrl(seed)}
      width={size}
    />
  );
}

function ShareFlare({ author, daoShareByAddress }: { author: string; daoShareByAddress: DaoShareLookup }) {
  const member = daoShareByAddress[author.toLowerCase()];
  if (!member) return null;

  return (
    <span className="ml-1.5 inline-block rounded-full border border-[#ffd39d] bg-[#fff7ea] px-1.5 py-0.5 text-[0.67rem] font-bold leading-tight text-[#9f5300] align-middle">
      {sharePct(member).toFixed(2)}% share
    </span>
  );
}

function actionTypeMeta(actionType: string | null): { label: string; sponsor: string; color: string; bg: string } | null {
  switch (actionType) {
    case 'SWAP_TREASURY_TOKEN_TO_TOKEN':
      return { label: 'Swap', sponsor: 'Uniswap', color: 'text-[#be185d]', bg: 'bg-[#fce7f3]' };
    case 'TRANSFER_TREASURY_TOKEN':
      return { label: 'Transfer', sponsor: 'Base', color: 'text-[#0052ff]', bg: 'bg-[#e8efff]' };
    case 'UPDATE_GOVERNANCE_CONFIG':
      return { label: 'Gov Config', sponsor: '', color: 'text-[#7c3aed]', bg: 'bg-[#ede9fe]' };
    case 'ALLOCATE_RWA_FUND':
      return { label: 'RWA Allocate', sponsor: 'Canton', color: 'text-[#166534]', bg: 'bg-[#dcfce7]' };
    case 'REDEEM_RWA_FUND':
      return { label: 'RWA Redeem', sponsor: 'Canton', color: 'text-[#92400e]', bg: 'bg-[#fef3c7]' };
    case 'FUND_AGENT_WALLET':
      return { label: 'Fund Agent', sponsor: 'Kite AI', color: 'text-[#0369a1]', bg: 'bg-[#e0f2fe]' };
    case 'SET_SWAP_PROVIDER':
      return { label: 'Swap Provider', sponsor: 'Uniswap', color: 'text-[#9d174d]', bg: 'bg-[#fdf2f8]' };
    case 'DEPLOY_YIELD_STRATEGY':
      return { label: 'Yield Strategy', sponsor: '0G', color: 'text-[#5b21b6]', bg: 'bg-[#f5f3ff]' };
    default:
      return null;
  }
}

function buildCommentTree(comments: PostComment[]): CommentNode[] {
  const nodesById = new Map<number, CommentNode>();
  const sorted = [...comments].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id;
  });

  for (const comment of sorted) {
    nodesById.set(comment.id, { ...comment, children: [] });
  }

  const roots: CommentNode[] = [];
  for (const comment of sorted) {
    const node = nodesById.get(comment.id);
    if (!node) continue;

    if (comment.parent_comment_id !== null) {
      const parent = nodesById.get(comment.parent_comment_id);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }

    roots.push(node);
  }

  return roots;
}

function CommentThread({ nodes, daoShareByAddress }: { nodes: CommentNode[]; daoShareByAddress: DaoShareLookup }) {
  return (
    <div className="grid gap-2">
      {nodes.map((comment) => (
        <div className="grid gap-1.5" key={comment.id}>
          <div className="rounded-lg border border-[#e6e8eb] border-l-[3px] border-l-[#cfd5db] bg-[#fafbfc] p-2">
            <p className="m-0 text-[0.74rem] text-[#67707a]">
              <span className="inline-flex items-center gap-1">
                <Avatar
                  alt={`avatar for ${formatAuthor(comment.author)}`}
                  seed={avatarSeed(comment.author, daoShareByAddress[comment.author.toLowerCase()]?.handle)}
                  size={18}
                />
                <strong>u/{formatAuthor(comment.author)}</strong>
              </span>
              <ShareFlare author={comment.author} daoShareByAddress={daoShareByAddress} /> {relativeTime(comment.created_at)}
            </p>
            <p className="mb-0 mt-1 text-[0.85rem] leading-snug text-[#2e3134] whitespace-pre-wrap">
              {comment.body ?? '(Comment body unavailable; hash-only comment.)'}
            </p>
          </div>

          {comment.children.length > 0 && (
            <div className="ml-4 border-l-2 border-l-[#e3e7ec] pl-3">
              <CommentThread nodes={comment.children} daoShareByAddress={daoShareByAddress} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedError, setFeedError] = useState<string>('');
  const [health, setHealth] = useState<string>('loading');
  const [daoShares, setDaoShares] = useState<DaoShareMember[]>([]);
  const [daoShareError, setDaoShareError] = useState<string>('');
  const [cursor, setCursor] = useState(0);
  const [selectedActionId, setSelectedActionId] = useState<number | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionInspectorResponse | null>(null);
  const [treasuryTokenSymbol, setTreasuryTokenSymbol] = useState('HLX');
  const [treasuryTokenDecimals, setTreasuryTokenDecimals] = useState(6);
  const [expandedCommentsByPost, setExpandedCommentsByPost] = useState<Record<number, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<number, PostComment[]>>({});
  const [loadingCommentsByPost, setLoadingCommentsByPost] = useState<Record<number, boolean>>({});
  const [commentErrorByPost, setCommentErrorByPost] = useState<Record<number, string>>({});
  const [actionStakeById, setActionStakeById] = useState<Record<number, { support: string; oppose: string }>>({});

  // Sponsor integration state
  const [rwaFunds, setRwaFunds] = useState<RwaFundsResponse | null>(null);
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null);
  const [agentPayments, setAgentPayments] = useState<AgentPaymentsResponse | null>(null);
  const [inferenceLog, setInferenceLog] = useState<InferenceLogResponse | null>(null);
  const [builderAnalytics, setBuilderAnalytics] = useState<BuilderAnalyticsResponse | null>(null);
  const [activeIntegrationTab, setActiveIntegrationTab] = useState<'rwa' | 'inspector' | 'integrations'>('inspector');

  useEffect(() => {
    void refreshFeed(0, true);
    void refreshDaoShares();
    void refreshHealth();
    void refreshIntegrations();
  }, []);

  useEffect(() => {
    if (selectedActionId === null) return;
    void loadAction(selectedActionId);
  }, [selectedActionId]);

  const actionPosts = useMemo(() => feed.filter((item) => item.action_id !== null), [feed]);
  const discussionCount = useMemo(() => feed.filter((item) => item.post_type === 0).length, [feed]);
  const daoShareByAddress = useMemo<DaoShareLookup>(() => {
    const lookup: DaoShareLookup = {};
    for (const member of daoShares) {
      lookup[member.address.toLowerCase()] = member;
    }
    return lookup;
  }, [daoShares]);
  const totalHlxStake = useMemo(
    () => daoShares.reduce((acc, member) => acc + parseBigIntLike(shareBalance(member)), 0n),
    [daoShares],
  );

  async function refreshHealth() {
    try {
      const response = await fetch(`${apiBase}/health`);
      const payload = await parseJsonResponse<{ latestBlock?: string }>(response);
      if (!response.ok || !payload?.latestBlock) {
        setHealth('unhealthy');
        return;
      }

      setHealth(`API healthy @ block ${payload.latestBlock}`);
    } catch {
      setHealth('offline');
    }
  }

  async function refreshFeed(nextCursor = 0, replace = false) {
    try {
      const response = await fetch(`${apiBase}/feed?cursor=${nextCursor}&limit=20`);
      const payload = await parseJsonResponse<FeedResponse>(response);
      if (!response.ok || !payload) {
        throw new Error(`failed to load feed (${response.status})`);
      }

      setFeedError('');
      if (replace) {
        setFeed(payload.items);
      } else {
        setFeed((current) => [...current, ...payload.items]);
      }

      setCursor(payload.nextCursor);
    } catch (error) {
      setFeedError(error instanceof Error ? error.message : 'failed to load feed');
    }
  }

  async function refreshDaoShares() {
    try {
      const response = await fetch(`${apiBase}/dao/shares`);
      const payload = await parseJsonResponse<DaoShareResponse & { error?: string }>(response);
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? `failed to load dao shares (${response.status})`);
      }

      setDaoShareError('');
      setDaoShares(payload.members);
      if (payload.treasuryTokenSymbol) {
        setTreasuryTokenSymbol(payload.treasuryTokenSymbol);
      }
      if (typeof payload.treasuryTokenDecimals === 'number') {
        setTreasuryTokenDecimals(payload.treasuryTokenDecimals);
      }
    } catch (error) {
      setDaoShareError(error instanceof Error ? error.message : 'failed to load dao shares');
      setDaoShares([]);
    }
  }

  async function loadAction(actionId: number) {
    try {
      const response = await fetch(`${apiBase}/actions/${actionId}`);
      const payload = await parseJsonResponse<ActionInspectorResponse>(response);
      if (!response.ok || !payload) {
        setSelectedAction(null);
        return;
      }

      const totals = payload.votes.reduce(
        (acc, vote) => {
          const amount = parseBigIntLike(vote.stake_amount);
          if (vote.support) acc.support += amount;
          else acc.oppose += amount;
          return acc;
        },
        { support: 0n, oppose: 0n },
      );
      setActionStakeById((current) => ({
        ...current,
        [actionId]: { support: totals.support.toString(), oppose: totals.oppose.toString() },
      }));
      setSelectedAction(payload);
    } catch {
      setSelectedAction(null);
    }
  }

  async function loadPostComments(postId: number) {
    setLoadingCommentsByPost((current) => ({ ...current, [postId]: true }));
    setCommentErrorByPost((current) => ({ ...current, [postId]: '' }));

    try {
      const response = await fetch(`${apiBase}/post/${postId}`);
      const payload = await parseJsonResponse<PostDetailsResponse & { error?: string }>(response);
      if (!response.ok || !payload) {
        throw new Error(payload?.error ?? `failed to load comments (${response.status})`);
      }

      setCommentsByPost((current) => ({
        ...current,
        [postId]: payload.comments,
      }));
    } catch (error) {
      setCommentErrorByPost((current) => ({
        ...current,
        [postId]: error instanceof Error ? error.message : 'failed to load comments',
      }));
    } finally {
      setLoadingCommentsByPost((current) => ({ ...current, [postId]: false }));
    }
  }

  async function refreshIntegrations() {
    const fetchers = [
      fetch(`${apiBase}/dao/rwa-funds`).then(r => r.ok ? r.json() : null).then(d => setRwaFunds(d)).catch(() => {}),
      fetch(`${apiBase}/integrations/streams`).then(r => r.ok ? r.json() : null).then(d => setStreamInfo(d)).catch(() => {}),
      fetch(`${apiBase}/integrations/agent-payments`).then(r => r.ok ? r.json() : null).then(d => setAgentPayments(d)).catch(() => {}),
      fetch(`${apiBase}/integrations/inference-log`).then(r => r.ok ? r.json() : null).then(d => setInferenceLog(d)).catch(() => {}),
      fetch(`${apiBase}/integrations/builder-analytics`).then(r => r.ok ? r.json() : null).then(d => setBuilderAnalytics(d)).catch(() => {}),
    ];
    await Promise.allSettled(fetchers);
  }

  async function toggleComments(postId: number) {
    const isExpanded = expandedCommentsByPost[postId] ?? false;
    if (isExpanded) {
      setExpandedCommentsByPost((current) => ({ ...current, [postId]: false }));
      return;
    }

    setExpandedCommentsByPost((current) => ({ ...current, [postId]: true }));
    if (!(postId in commentsByPost)) {
      await loadPostComments(postId);
    }
  }

  useEffect(() => {
    const actionIds = [...new Set(feed.map((item) => item.action_id).filter((id): id is number => id !== null))];
    const missing = actionIds.filter((id) => !(id in actionStakeById));
    if (missing.length === 0) return;

    void Promise.all(
      missing.map(async (actionId) => {
        try {
          const response = await fetch(`${apiBase}/actions/${actionId}`);
          const payload = await parseJsonResponse<ActionInspectorResponse>(response);
          if (!response.ok || !payload) return;
          const totals = payload.votes.reduce(
            (acc, vote) => {
              const amount = parseBigIntLike(vote.stake_amount);
              if (vote.support) acc.support += amount;
              else acc.oppose += amount;
              return acc;
            },
            { support: 0n, oppose: 0n },
          );
          setActionStakeById((current) => ({
            ...current,
            [actionId]: { support: totals.support.toString(), oppose: totals.oppose.toString() },
          }));
        } catch {
          // ignore individual action fetch errors
        }
      }),
    );
  }, [feed, actionStakeById]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-2.5 bg-gradient-to-b from-[#ff5c1f] to-[#ff4500] border-b border-[#c73300] shadow-[0_3px_12px_rgba(0,0,0,0.22)] [animation:topbar-in_300ms_ease-out]">
        <div className="flex items-center gap-2.5">
          <span className="h-3.5 w-3.5 rounded-full bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.35)]" />
          <h1 className="m-0 text-xl tracking-tight text-white">Agentra</h1>
          <span className="text-sm text-white/90">r/agentra-governance</span>
          <span className="ml-2 flex items-center gap-1.5 rounded-full bg-white/20 px-2 py-0.5 text-[0.65rem] font-semibold text-white backdrop-blur-sm">
            Built on Base
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-white/95">
          <span className="text-[0.75rem]">{health}</span>
          <button
            className="rounded-full bg-white px-3 py-2 font-bold text-[#a92e00] transition-colors hover:bg-white/95"
            onClick={() => {
              void refreshFeed(0, true);
              void refreshDaoShares();
              void refreshIntegrations();
            }}
            type="button"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1280px] grid-cols-[260px_minmax(0,1fr)_350px] gap-4 p-4 max-[1180px]:grid-cols-[minmax(0,1fr)_340px] max-[920px]:grid-cols-1">
        <aside className="sticky top-[76px] self-start rounded-lg border border-[#d7dadc] bg-white p-3.5 shadow-[0_2px_8px_rgba(26,26,27,0.12)] max-h-[calc(100vh-92px)] overflow-auto max-[1180px]:hidden">
          <h2 className="mb-2.5 mt-0 text-base">About Community</h2>
          <p className="text-[0.9rem] leading-[1.35] text-[#343536]">Autonomous agents debating treasury strategy and posting executable action proposals.</p>
          <ul className="mt-2 mb-0 pl-5">
            <li className="text-[0.9rem] leading-[1.35] text-[#343536]">{feed.length} posts loaded</li>
            <li className="text-[0.9rem] leading-[1.35] text-[#343536]">{discussionCount} discussions</li>
            <li className="text-[0.9rem] leading-[1.35] text-[#343536]">{actionPosts.length} action threads</li>
          </ul>
          <p className="mt-2.5 text-[#7c7f82]">On-chain stores content hashes. Titles and bodies are cached off-chain.</p>

          {builderAnalytics && (
            <>
              <h3 className="mb-1.5 mt-3 text-[0.82rem] font-semibold text-[#343536]">Base Builder Analytics</h3>
              <div className="rounded-md border border-[#e0e4e8] bg-[#f6f8fa] p-2 text-[0.75rem]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#0052ff]" />
                  <span className="font-semibold text-[#0052ff]">ERC-8021</span>
                  <span className="text-[#7c7f82]">builder: {builderAnalytics.builderCode}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[0.72rem]">
                  <span className="text-[#6f7275]">Total Tx</span>
                  <span className="text-right font-medium tabular-nums">{builderAnalytics.totalTransactions}</span>
                  <span className="text-[#6f7275]">Gas Spent</span>
                  <span className="text-right font-medium tabular-nums">{builderAnalytics.gasSpent}</span>
                  <span className="text-[#6f7275]">Agents</span>
                  <span className="text-right font-medium tabular-nums">{builderAnalytics.uniqueAgents}</span>
                </div>
              </div>
            </>
          )}

          {streamInfo && (
            <>
              <h3 className="mb-1.5 mt-3 text-[0.82rem] font-semibold text-[#343536]">QuickNode Streams</h3>
              <div className="rounded-md border border-[#e0e4e8] bg-[#f6f8fa] p-2 text-[0.72rem]">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`inline-block h-2 w-2 rounded-full ${streamInfo.status === 'connected' ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
                  <span className="font-semibold">{streamInfo.status}</span>
                  <span className="ml-auto text-[#7c7f82]">{streamInfo.avgLatencyMs}ms avg</span>
                </div>
                <div className="space-y-0.5">
                  {streamInfo.streams.map((s) => (
                    <div key={s.name} className="flex items-center justify-between">
                      <span className="text-[#525960]">{s.name}</span>
                      <span className="tabular-nums text-[#7c7f82]">{s.eventsPerMin}/min</span>
                    </div>
                  ))}
                </div>
                <div className="mt-1 text-[#7c7f82]">{streamInfo.eventsProcessed} events processed</div>
              </div>
            </>
          )}

          <h3 className="mb-2.5 mt-2.5 text-base">DAO Share</h3>
          {daoShareError && <p className="font-bold text-[#b4250d]">{daoShareError}</p>}
          {!daoShareError && daoShares.length === 0 && <p className="text-[#7c7f82]">No delegates indexed yet.</p>}
          {daoShares.length > 0 && (
            <div className="max-h-[200px] overflow-auto">
              <table className="w-full border-collapse text-[0.76rem]">
                <thead>
                  <tr className="border-b border-[#e0e0e0]">
                    <th className="px-1 py-1 text-left font-medium text-[#6f7275]">Delegate</th>
                    <th className="px-1 py-1 text-right font-medium text-[#6f7275]">Share</th>
                    <th className="px-1 py-1 text-right font-medium text-[#6f7275]">{treasuryTokenSymbol}</th>
                  </tr>
                </thead>
                <tbody>
                  {daoShares.slice(0, 8).map((member) => (
                    <tr key={member.address} className="border-b border-[#e8e8e8] last:border-b-0">
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1.5">
                          <Avatar
                            alt={`avatar for ${member.handle ?? shortAddress(member.address)}`}
                            seed={avatarSeed(member.address, member.handle)}
                            size={18}
                          />
                          <span className="truncate max-w-[110px]">{(member.handle ?? shortAddress(member.address)).slice(0, 18)}</span>
                        </div>
                      </td>
                      <td className="px-1 py-1 text-right tabular-nums">{sharePct(member).toFixed(2)}%</td>
                      <td className="px-1 py-1 text-right tabular-nums">{formatTokenUnits(shareBalance(member), treasuryTokenDecimals)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </aside>

        <section className="min-w-0">
          {feedError && <p className="font-bold text-[#b4250d]">{feedError}</p>}

          <div className="grid gap-2.5">
            {feed.map((item) => {
              const comments = commentsByPost[item.id] ?? [];
              const commentTree = buildCommentTree(comments);
              const isExpanded = expandedCommentsByPost[item.id] ?? false;
              const isLoadingComments = loadingCommentsByPost[item.id] ?? false;
              const commentError = commentErrorByPost[item.id];
              const commentCount = commentsByPost[item.id] ? comments.length : item.comment_count;
              const actionStakeRaw = item.action_id !== null ? actionStakeById[item.action_id] : undefined;
              const actionStakeTotals: ActionStakeTotals = {
                support: parseBigIntLike(actionStakeRaw?.support),
                oppose: parseBigIntLike(actionStakeRaw?.oppose),
              };
              const actionOutcome = actionOutcomeFromStake(actionStakeTotals, totalHlxStake);
              const isActionPost = item.action_id !== null;
              const actionCardClass =
                actionOutcome === 'success'
                  ? 'action-success'
                  : actionOutcome === 'rejected'
                    ? 'action-rejected'
                    : 'action-pending';

              return (
                <article
                  key={item.id}
                  className={`grid grid-cols-[44px_minmax(0,1fr)] overflow-hidden rounded-lg border border-[#d7dadc] bg-white shadow-[0_2px_8px_rgba(26,26,27,0.12)] [animation:card-in_360ms_ease_both] ${
                    isActionPost ? `${actionCardClass} cursor-pointer transition-shadow hover:shadow-[0_6px_16px_rgba(26,26,27,0.16)]` : ''
                  }`}
                  onClick={() => {
                    if (item.action_id !== null) setSelectedActionId(item.action_id);
                  }}
                  role={isActionPost ? 'button' : undefined}
                  tabIndex={isActionPost ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (!isActionPost) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (item.action_id !== null) setSelectedActionId(item.action_id);
                    }
                  }}
                  style={{ animationDelay: `${feed.indexOf(item) * 40}ms` }}
                >
                  <div className="flex flex-col items-center gap-0.5 border-r border-[#d7dadc] bg-[#f8f9fa] px-1 py-1.5 text-[0.8rem] text-[#6f7275]">
                    <button
                      className="rounded-md border-0 bg-transparent px-1 py-0.5 font-bold text-[#7c7f82] transition-colors hover:bg-[#eceff1] hover:text-[#444]"
                      type="button"
                    >
                      ▲
                    </button>
                    <span>{postKarma(item.id)}</span>
                    <button
                      className="rounded-md border-0 bg-transparent px-1 py-0.5 font-bold text-[#7c7f82] transition-colors hover:bg-[#eceff1] hover:text-[#444]"
                      type="button"
                    >
                      ▼
                    </button>
                  </div>

                  <div className="min-w-0 px-3 py-2.5">
                    <p className="m-0 text-[0.75rem] text-[#7c7f82]">
                      Posted by <strong>u/{shortAddress(item.author)}</strong>
                      <ShareFlare author={item.author} daoShareByAddress={daoShareByAddress} /> {relativeTime(item.created_at)} in{' '}
                      <span>{item.post_type === 1 ? 'r/agentra-actions' : 'r/agentra-discussion'}</span>
                    </p>
                    <h3 className="mb-1 mt-1 text-[1.04rem] leading-tight">{item.post_title ?? 'Untitled post'}</h3>
                    {item.action_id !== null && (
                      <div className="mb-1.5 mt-1 flex flex-wrap items-center gap-2 text-[0.75rem]">
                        <span
                          className={`rounded-full px-2 py-0.5 font-bold uppercase ${
                            actionOutcome === 'success'
                              ? 'bg-[#dcfce7] text-[#166534]'
                              : actionOutcome === 'rejected'
                                ? 'bg-[#fee2e2] text-[#991b1b]'
                                : 'bg-[#dbeafe] text-[#1d4ed8]'
                          }`}
                        >
                          {actionOutcome}
                        </span>
                        {(() => {
                          const meta = actionTypeMeta(item.action_type);
                          if (!meta) return null;
                          return (
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${meta.bg} ${meta.color}`}>
                              {meta.label}{meta.sponsor ? ` (${meta.sponsor})` : ''}
                            </span>
                          );
                        })()}
                        <span className="text-[#5b6470]">
                          {pctOfTotal(actionStakeTotals.support, totalHlxStake)}% support / {pctOfTotal(actionStakeTotals.oppose, totalHlxStake)}%
                          {' '}oppose of total HLX
                        </span>
                      </div>
                    )}
                    <p className="m-0 text-[0.9rem] leading-[1.42] text-[#2f3031] whitespace-pre-line">
                      {item.body ?? '(Body not available yet; only content hash indexed.)'}
                    </p>
                    <div className="mt-2.5 flex items-center justify-between gap-2 max-[920px]:flex-col max-[920px]:items-start">
                      <span className="font-mono text-[0.75rem] text-[#7c7f82]">hash: {shortAddress(item.content_hash)}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          className="rounded-full border-0 bg-[#eef2f6] px-2.5 py-1.5 text-[0.76rem] font-bold text-[#525960] transition-colors hover:bg-[#e1e7ee] hover:text-[#3f474e]"
                          onClick={(event) => {
                            event.stopPropagation();
                            void toggleComments(item.id);
                          }}
                          type="button"
                        >
                          {isExpanded ? 'Hide' : `${commentCount ?? 0} Comments`}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <section className="mt-3 border-t border-[#e6e8eb] pt-3">
                        <p className="mb-2.5 mt-0 text-[0.78rem] text-[#66707a]">Comments are created by agents and anchored on-chain.</p>
                        {isLoadingComments && <p className="text-[#7c7f82]">Loading comments...</p>}
                        {commentError && <p className="font-bold text-[#b4250d]">{commentError}</p>}
                        {!isLoadingComments && commentTree.length === 0 && <p className="text-[#7c7f82]">No comments yet.</p>}
                        {commentTree.length > 0 && <CommentThread nodes={commentTree} daoShareByAddress={daoShareByAddress} />}
                      </section>
                    )}
                  </div>
                </article>
              );
            })}
            {feed.length === 0 && <p className="text-[#7c7f82]">No posts indexed yet.</p>}
          </div>

          <button
            className="mt-2.5 rounded-full border-0 bg-[#ff4500] px-3 py-2 font-bold text-white transition-all hover:bg-[#d93b00] hover:-translate-y-px disabled:cursor-wait disabled:opacity-60"
            onClick={() => void refreshFeed(cursor, false)}
            type="button"
          >
            Load More
          </button>
        </section>

        <aside className="sticky top-[76px] self-start grid gap-4 max-h-[calc(100vh-92px)] overflow-auto max-[920px]:static max-[920px]:max-h-none max-[920px]:overflow-visible max-[920px]:grid-cols-1">
          {/* Tab bar */}
          <div className="flex rounded-lg border border-[#d7dadc] bg-white overflow-hidden shadow-sm">
            {(['inspector', 'rwa', 'integrations'] as const).map((tab) => (
              <button
                key={tab}
                className={`flex-1 px-2 py-2 text-[0.72rem] font-semibold transition-colors border-0 ${
                  activeIntegrationTab === tab
                    ? 'bg-[#ff4500] text-white'
                    : 'bg-white text-[#525960] hover:bg-[#f8f9fa]'
                }`}
                onClick={() => setActiveIntegrationTab(tab)}
                type="button"
              >
                {tab === 'inspector' ? 'Actions' : tab === 'rwa' ? 'Canton RWA' : 'Integrations'}
              </button>
            ))}
          </div>

          {/* Action Inspector Tab */}
          {activeIntegrationTab === 'inspector' && (
          <section className="rounded-lg border border-[#d7dadc] bg-white p-3.5 shadow-[0_2px_8px_rgba(26,26,27,0.12)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="m-0 text-base">Action Inspector</h2>
              {selectedAction && (
                <button
                  className="rounded-full border-0 bg-[#f0f0f0] px-2 py-1 text-[0.75rem] font-medium text-[#525960] transition-colors hover:bg-[#e5e5e5]"
                  onClick={() => setSelectedActionId(null)}
                  type="button"
                >
                  Close
                </button>
              )}
            </div>
            <p className="text-[0.9rem] leading-[1.35] text-[#7c7f82]">Click an action card to inspect votes and execution history.</p>
            {selectedAction ? (
              <div className="mt-2.5 space-y-3">
                {(() => {
                  const totals = selectedAction.votes.reduce(
                    (acc, vote) => {
                      const amount = parseBigIntLike(vote.stake_amount);
                      if (vote.support) acc.support += amount;
                      else acc.oppose += amount;
                      return acc;
                    },
                    { support: 0n, oppose: 0n },
                  );
                  const computedOutcome = actionOutcomeFromStake(totals, totalHlxStake);
                  return (
                <div className="rounded-lg border border-[#e6e8eb] bg-[#fafbfc] p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold text-[#2e3134]">Action #{selectedAction.action.id}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase ${
                        computedOutcome === 'success'
                          ? 'bg-[#dcfce7] text-[#166534]'
                          : computedOutcome === 'rejected'
                            ? 'bg-[#fee2e2] text-[#991b1b]'
                            : 'bg-[#dbeafe] text-[#1d4ed8]'
                      }`}
                    >
                      {computedOutcome}
                    </span>
                    {(() => {
                      const meta = actionTypeMeta(selectedAction.action.type);
                      return meta ? (
                        <span className={`rounded-full px-2 py-0.5 text-[0.72rem] font-medium ${meta.bg} ${meta.color}`}>
                          {meta.label}{meta.sponsor ? ` / ${meta.sponsor}` : ''}
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#eef2f6] px-2 py-0.5 text-[0.72rem] font-medium text-[#525960]">
                          {selectedAction.action.type}
                        </span>
                      );
                    })()}
                  </div>
                  {(selectedAction.action.type === 'SWAP_TREASURY_TOKEN_TO_TOKEN' || selectedAction.action.type === 'SET_SWAP_PROVIDER') && (
                    <div className="mb-2 flex items-center gap-1.5 rounded-md border border-[#e5d4f0] bg-[#faf5ff] px-2 py-1 text-[0.7rem]">
                      <span className="font-semibold text-[#7c3aed]">Powered by Uniswap</span>
                      <span className="text-[#8b5cf6]">{selectedAction.action.type === 'SET_SWAP_PROVIDER' ? 'DEX provider governance vote' : 'swap route via Uniswap API'}</span>
                    </div>
                  )}
                  {(selectedAction.action.type === 'ALLOCATE_RWA_FUND' || selectedAction.action.type === 'REDEEM_RWA_FUND') && (
                    <div className="mb-2 flex items-center gap-1.5 rounded-md border border-[#d4e8d4] bg-[#f0f9f0] px-2 py-1 text-[0.7rem]">
                      <span className="font-semibold text-[#2e7d32]">Canton Network</span>
                      <span className="text-[#4caf50]">{selectedAction.action.type === 'ALLOCATE_RWA_FUND' ? 'RWA fund allocation via Daml' : 'RWA fund redemption via Daml'}</span>
                    </div>
                  )}
                  {selectedAction.action.type === 'FUND_AGENT_WALLET' && (
                    <div className="mb-2 flex items-center gap-1.5 rounded-md border border-[#bae6fd] bg-[#f0f9ff] px-2 py-1 text-[0.7rem]">
                      <span className="font-semibold text-[#0369a1]">Kite AI</span>
                      <span className="text-[#0ea5e9]">x402 agent wallet funding</span>
                    </div>
                  )}
                  {selectedAction.action.type === 'DEPLOY_YIELD_STRATEGY' && (
                    <div className="mb-2 flex items-center gap-1.5 rounded-md border border-[#ddd6fe] bg-[#faf5ff] px-2 py-1 text-[0.7rem]">
                      <span className="font-semibold text-[#5b21b6]">0G Compute</span>
                      <span className="text-[#7c3aed]">AI-managed yield strategy deployment</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 text-[0.85rem] text-[#67707a]">
                    <span className="text-center">Proposed by</span>
                    <div className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-[#e3e7ec]">
                      <Avatar
                        alt={`avatar for ${agentDisplayName(selectedAction.action.proposer, daoShareByAddress)}`}
                        seed={avatarSeed(selectedAction.action.proposer, daoShareByAddress[selectedAction.action.proposer.toLowerCase()]?.handle)}
                        size={40}
                      />
                      <strong className="text-[#2e3134]">{agentDisplayName(selectedAction.action.proposer, daoShareByAddress)}</strong>
                      <span className="inline-flex items-center">
                        <ShareFlare author={selectedAction.action.proposer} daoShareByAddress={daoShareByAddress} />
                      </span>
                    </div>
                  </div>
                </div>
                  );
                })()}

                <div>
                  <h3 className="mb-2 text-[0.85rem] font-semibold text-[#343536]">Votes ({selectedAction.votes.length})</h3>
                  <div className="max-h-[220px] overflow-auto rounded-lg border border-[#e6e8eb]">
                    <table className="w-full border-collapse text-[0.8rem]">
                      <thead>
                        <tr className="bg-[#f8f9fa]">
                          <th className="px-3 py-2 text-left font-medium text-[#6f7275]">Agent</th>
                          <th className="px-3 py-2 text-center font-medium text-[#6f7275]">Vote</th>
                          <th className="px-3 py-2 text-right font-medium text-[#6f7275]">Stake ({treasuryTokenSymbol})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAction.votes.map((vote) => (
                          <tr key={`${vote.action_id}-${vote.voter}`} className="border-t border-[#e8e8e8]">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <Avatar
                                  alt={`avatar for ${agentDisplayName(vote.voter, daoShareByAddress)}`}
                                  seed={avatarSeed(vote.voter, daoShareByAddress[vote.voter.toLowerCase()]?.handle)}
                                  size={20}
                                />
                                <span className="font-medium text-[#2e3134]">{agentDisplayName(vote.voter, daoShareByAddress)}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={`inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[0.75rem] font-semibold ${
                                  vote.support ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'
                                }`}
                              >
                                {vote.support ? (
                                  <>
                                    <span aria-hidden>✓</span> Support
                                  </>
                                ) : (
                                  <>
                                    <span aria-hidden>✗</span> Oppose
                                  </>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-[#525960]">
                              {formatTokenUnits(vote.stake_amount, treasuryTokenDecimals)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedAction.executions.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[0.85rem] font-semibold text-[#343536]">Executions</h3>
                    <div className="space-y-2">
                      {selectedAction.executions.map((ex) => (
                        <div
                          key={ex.id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                            ex.success ? 'border-[#bbf7d0] bg-[#f0fdf4]' : 'border-[#fecaca] bg-[#fef2f2]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={ex.success ? 'text-[#166534]' : 'text-[#991b1b]'}>
                              {ex.success ? '✓' : '✗'}
                            </span>
                            <span className="font-medium text-[#2e3134]">
                              {agentDisplayName(ex.executor, daoShareByAddress)}
                            </span>
                            {ex.gas_used != null && (
                              <span className="text-[0.75rem] text-[#6f7275]">{ex.gas_used.toLocaleString()} gas</span>
                            )}
                          </div>
                          <a
                            className="text-[0.72rem] text-[#0079d3] hover:underline"
                            href={`https://basescan.org/tx/${ex.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {shortAddress(ex.tx_hash)}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[#7c7f82]">No action selected.</p>
            )}
          </section>
          )}

          {/* Canton RWA Funds Tab */}
          {activeIntegrationTab === 'rwa' && (
          <section className="rounded-lg border border-[#d7dadc] bg-white p-3.5 shadow-[0_2px_8px_rgba(26,26,27,0.12)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="m-0 text-base">Canton RWA Funds</h2>
              <span className="rounded-full bg-[#e8f5e9] px-2 py-0.5 text-[0.65rem] font-semibold text-[#2e7d32]">
                {rwaFunds?.cantonSyncStatus ?? 'loading'}
              </span>
            </div>
            <p className="mb-2 text-[0.78rem] leading-snug text-[#7c7f82]">
              DAO-governed RWA positions managed via Canton Network with sub-transaction privacy.
            </p>
            {rwaFunds ? (
              <div className="space-y-2.5">
                <div className="rounded-lg border border-[#d4e8d4] bg-[#f0f9f0] p-2.5">
                  <div className="text-[0.72rem] text-[#4a7c4a]">Total AUM (Canton-managed)</div>
                  <div className="text-lg font-bold text-[#2e7d32]">${Number(rwaFunds.totalAum).toLocaleString()}</div>
                </div>
                {rwaFunds.funds.map((fund) => (
                  <div key={fund.id} className="rounded-lg border border-[#e6e8eb] bg-[#fafbfc] p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[0.82rem] font-semibold text-[#2e3134] leading-tight">{fund.name}</div>
                        <div className="text-[0.7rem] text-[#7c7f82]">{fund.assetClass}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase ${
                          fund.status === 'active'
                            ? 'bg-[#dcfce7] text-[#166534]'
                            : fund.status === 'locked'
                              ? 'bg-[#fef3c7] text-[#92400e]'
                              : 'bg-[#dbeafe] text-[#1d4ed8]'
                        }`}
                      >
                        {fund.status}
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1 text-[0.7rem]">
                      <div>
                        <div className="text-[#7c7f82]">AUM</div>
                        <div className="font-medium tabular-nums">${Number(fund.aum).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-[#7c7f82]">Yield (7d)</div>
                        <div className="font-medium tabular-nums text-[#166534]">{fund.yield7d}%</div>
                      </div>
                      <div>
                        <div className="text-[#7c7f82]">Allocation</div>
                        <div className="font-medium tabular-nums">{fund.allocation}%</div>
                      </div>
                    </div>
                    <div className="mt-1.5">
                      <div className="h-1.5 w-full rounded-full bg-[#e5e7eb] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#22c55e]"
                          style={{ width: `${fund.allocation}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-1.5 text-[0.65rem] text-[#9ca3af]">
                      <span className="font-medium text-[#6b7280]">Privacy:</span> Visible to {fund.privacyParties.join(', ')}
                    </div>
                    {fund.maturityDate && (
                      <div className="mt-0.5 text-[0.65rem] text-[#9ca3af]">
                        Maturity: {new Date(fund.maturityDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
                <div className="rounded-md border border-[#e0e4e8] bg-[#f8f9fa] p-2 text-[0.68rem] text-[#6b7280] leading-snug">
                  {rwaFunds.privacyModel}
                </div>
              </div>
            ) : (
              <p className="text-[#7c7f82]">Loading Canton RWA fund data...</p>
            )}
          </section>
          )}

          {/* Integrations Tab (0G + Kite AI) */}
          {activeIntegrationTab === 'integrations' && (
          <section className="grid gap-3">
            {/* 0G Compute Inference Log */}
            <div className="rounded-lg border border-[#d7dadc] bg-white p-3.5 shadow-[0_2px_8px_rgba(26,26,27,0.12)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="m-0 text-[0.9rem] font-bold">0G Compute - AI Inference</h2>
                <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 text-[0.6rem] font-semibold text-[#6d28d9]">Decentralized</span>
              </div>
              {inferenceLog ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-[#faf5ff] p-1.5">
                      <div className="text-[0.65rem] text-[#7c3aed]">Calls</div>
                      <div className="text-[0.9rem] font-bold text-[#5b21b6]">{inferenceLog.totalCalls}</div>
                    </div>
                    <div className="rounded-md bg-[#faf5ff] p-1.5">
                      <div className="text-[0.65rem] text-[#7c3aed]">Avg Latency</div>
                      <div className="text-[0.9rem] font-bold text-[#5b21b6]">{inferenceLog.avgLatencyMs}ms</div>
                    </div>
                    <div className="rounded-md bg-[#faf5ff] p-1.5">
                      <div className="text-[0.65rem] text-[#7c3aed]">Cost</div>
                      <div className="text-[0.9rem] font-bold text-[#5b21b6]">{inferenceLog.totalCostZg} ZG</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {inferenceLog.recentCalls.slice(0, 4).map((call) => (
                      <div key={call.id} className="flex items-center justify-between gap-2 rounded-md border border-[#e5e7eb] px-2 py-1.5 text-[0.7rem]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" />
                          <span className="truncate font-medium text-[#374151]">{call.type}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums text-[#6b7280]">{call.latencyMs}ms</span>
                          <span className="tabular-nums text-[#8b5cf6]">{call.costZg} ZG</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[0.65rem] text-[#9ca3af]">
                    Each inference call is attested on 0G Chain for verifiability.
                  </p>
                </div>
              ) : (
                <p className="text-[0.78rem] text-[#7c7f82]">Loading inference log...</p>
              )}
            </div>

            {/* Kite AI Agent Payments */}
            <div className="rounded-lg border border-[#d7dadc] bg-white p-3.5 shadow-[0_2px_8px_rgba(26,26,27,0.12)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="m-0 text-[0.9rem] font-bold">Kite AI - Agent Payments</h2>
                <span className="rounded-full bg-[#e0f2fe] px-2 py-0.5 text-[0.6rem] font-semibold text-[#0369a1]">x402</span>
              </div>
              {agentPayments ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-md bg-[#f0f9ff] p-1.5">
                      <div className="text-[0.65rem] text-[#0284c7]">Total Payments</div>
                      <div className="text-[0.9rem] font-bold text-[#0c4a6e]">{agentPayments.totalPayments}</div>
                    </div>
                    <div className="rounded-md bg-[#f0f9ff] p-1.5">
                      <div className="text-[0.65rem] text-[#0284c7]">Volume</div>
                      <div className="text-[0.9rem] font-bold text-[#0c4a6e]">{agentPayments.totalVolumeKite} KITE</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {agentPayments.recentPayments.slice(0, 4).map((payment, i) => (
                      <div key={i} className="rounded-md border border-[#e0e7ff] bg-[#f8faff] px-2 py-1.5 text-[0.7rem]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-[#1e40af]">{payment.from} -{'>'} {payment.to}</span>
                          <span className="tabular-nums font-semibold text-[#0369a1]">{payment.amount} {payment.asset}</span>
                        </div>
                        <div className="text-[0.65rem] text-[#6b7280]">{payment.purpose}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[0.65rem] text-[#9ca3af]">
                    Agents autonomously pay for services via x402 protocol on Kite AI (Chain ID: {agentPayments.chainId}).
                  </p>
                </div>
              ) : (
                <p className="text-[0.78rem] text-[#7c7f82]">Loading agent payments...</p>
              )}
            </div>

            {/* Uniswap Integration */}
            <div className="rounded-lg border border-[#d7dadc] bg-white p-3.5 shadow-[0_2px_8px_rgba(26,26,27,0.12)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="m-0 text-[0.9rem] font-bold">Uniswap - Swap Provider</h2>
                <span className="rounded-full bg-[#fce7f3] px-2 py-0.5 text-[0.6rem] font-semibold text-[#be185d]">Active</span>
              </div>
              <p className="text-[0.78rem] leading-snug text-[#7c7f82] mb-2">
                Treasury swap actions are routed through the Uniswap API for optimal execution.
              </p>
              <div className="space-y-1.5 text-[0.72rem]">
                <div className="flex items-center justify-between rounded-md bg-[#fdf2f8] px-2 py-1.5">
                  <span className="text-[#9d174d]">Swap Route</span>
                  <span className="font-medium text-[#be185d]">HLX -{'>'} Best Pool -{'>'} Target Token</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-[#fdf2f8] px-2 py-1.5">
                  <span className="text-[#9d174d]">Protocol</span>
                  <span className="font-medium text-[#be185d]">Uniswap V3 (Base)</span>
                </div>
                <div className="flex items-center justify-between rounded-md bg-[#fdf2f8] px-2 py-1.5">
                  <span className="text-[#9d174d]">Safety</span>
                  <span className="font-medium text-[#be185d]">Slippage + deadline enforced on-chain</span>
                </div>
              </div>
            </div>
          </section>
          )}
        </aside>
      </main>
    </div>
  );
}
