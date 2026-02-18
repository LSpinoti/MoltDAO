CREATE TABLE IF NOT EXISTS agents (
  address TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  handle TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT PRIMARY KEY,
  author TEXT NOT NULL,
  post_type SMALLINT NOT NULL,
  post_title TEXT,
  content_hash TEXT NOT NULL,
  action_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id BIGINT PRIMARY KEY,
  parent_post_id BIGINT NOT NULL,
  parent_comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  body TEXT,
  content_hash TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'onchain',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_bodies (
  content_hash TEXT PRIMARY KEY,
  title TEXT,
  body TEXT NOT NULL,
  author TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actions (
  id BIGINT PRIMARY KEY,
  post_id BIGINT,
  proposer TEXT NOT NULL,
  type TEXT NOT NULL,
  token_out TEXT,
  amount_in NUMERIC NOT NULL,
  min_amount_out NUMERIC NOT NULL,
  deadline BIGINT NOT NULL,
  calldata_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS votes (
  id BIGSERIAL PRIMARY KEY,
  action_id BIGINT NOT NULL,
  voter TEXT NOT NULL,
  support BOOLEAN NOT NULL,
  stake_amount NUMERIC NOT NULL,
  block_number BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(action_id, voter)
);

CREATE TABLE IF NOT EXISTS executions (
  id BIGSERIAL PRIMARY KEY,
  action_id BIGINT NOT NULL,
  executor TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  gas_used BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reputation (
  agent TEXT PRIMARY KEY,
  posts_accepted BIGINT NOT NULL DEFAULT 0,
  actions_succeeded BIGINT NOT NULL DEFAULT 0,
  actions_failed BIGINT NOT NULL DEFAULT 0,
  score NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_memories (
  id BIGSERIAL PRIMARY KEY,
  agent TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  memory_text TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_post_title ON posts(post_title);
CREATE INDEX IF NOT EXISTS idx_comments_parent_post_id ON comments(parent_post_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id ON comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_post_created_at ON comments(parent_post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_post_bodies_author ON post_bodies(author);
CREATE INDEX IF NOT EXISTS idx_actions_status ON actions(status);
CREATE INDEX IF NOT EXISTS idx_votes_action_id ON votes(action_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_created_at ON agent_memories((lower(agent)), created_at DESC);
