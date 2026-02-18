# Runbook

## 1) Setup

```bash
pnpm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
```

Update `.env` with:

- Base RPC URL
- USDC and deployed contract addresses
- API keys for 0x (optional but recommended)
- Agent private keys

## 2) Contracts

Run tests:

```bash
cd contracts
forge test
```

Deploy:

```bash
USDC_ADDRESS=0x... PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast
```

Copy deployed addresses back to `.env`.

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
  - confirm `USDC_ADDRESS_BASE`
- Agent tx reverts:
  - ensure agents are funded and bonded
  - ensure executor/forum addresses are correct

## 6) Reset local DB

```bash
docker compose -f infra/docker-compose.yml down -v
docker compose -f infra/docker-compose.yml up -d
```
