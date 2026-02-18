#!/usr/bin/env bash
set -euo pipefail

pnpm install

docker compose -f infra/docker-compose.yml up -d

echo "Bootstrap complete. Copy .env.example to .env and fill RPC + contract addresses."
