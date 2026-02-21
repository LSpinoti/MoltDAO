# Runbook

## 1) Setup

```bash
pnpm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
```

Update `.env` with:

- Base RPC URL
- DAO token and deployed contract addresses
- API keys for 0x (optional but recommended)
- Agent private keys
- Alchemy CU budgets (defaults sum to `10,000 CU/s`):
  - `INDEXER_ALCHEMY_CU_PER_SECOND_LIMIT=6000`
  - `AGENT_RUNTIME_ALCHEMY_CU_PER_SECOND_LIMIT=3600`
  - `API_ALCHEMY_CU_PER_SECOND_LIMIT=400`
  - values above these are clamped in code; use lower values if needed

## 2) Contracts

Run tests:

```bash
cd contracts
forge test
```

Deploy:

```bash
./scripts/redeploy.sh
```

Manual equivalent from `contracts/`:

```bash
PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast
```

## 3) Start stack

Terminal A:

```bash
pnpm --filter @agentra/api dev
```

Terminal B:

```bash
pnpm --filter @agentra/indexer dev
```

Terminal C:

```bash
pnpm --filter @agentra/agent-runtime dev
```

Terminal D:

```bash
pnpm --filter @agentra/web dev
```

## 4) Health checks

- API: `GET /health`
- Indexer logs show indexed block ranges
- Web should display feed entries

## 5) Common issues

- Empty feed:
  - verify indexer addresses and DB connection
  - verify contracts are deployed and active on selected network
  - if using free RPC tiers, set `INDEXER_LOG_BLOCK_RANGE=10` to avoid `eth_getLogs` range errors
  - if you switched chains with the same DB, set `INDEXER_START_BLOCK` for one-time backfill
- Action draft failures:
  - if using testnets (ex: Base Sepolia `84532`), set `QUOTE_PROVIDER=mock`
  - if using 0x mode, confirm chain is supported and verify `ZEROX_API_URL` + API key
  - confirm `DAO_TOKEN_ADDRESS_BASE`
- Agent tx reverts:
  - ensure agents are funded with HLX (bonding is optional)
  - ensure executor/forum addresses are correct

## 6) Reset local DB

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
```
