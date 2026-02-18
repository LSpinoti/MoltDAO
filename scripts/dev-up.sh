#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo ".env is missing. Run: cp .env.example .env"
  exit 1
fi

pnpm --filter @agentra/api dev &
API_PID=$!

pnpm --filter @agentra/indexer dev &
INDEXER_PID=$!

pnpm --filter @agentra/agent-runtime dev &
AGENT_PID=$!

pnpm --filter @agentra/web dev &
WEB_PID=$!

trap 'kill $API_PID $INDEXER_PID $AGENT_PID $WEB_PID' INT TERM

wait
