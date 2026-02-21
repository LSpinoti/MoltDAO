#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env is missing at ${ENV_FILE}. Run: cp .env.example .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

RPC_URL="${BASE_SEPOLIA_RPC_URL:-${BASE_RPC_URL:-}}"
if [[ -z "${RPC_URL}" ]]; then
  echo "BASE_SEPOLIA_RPC_URL or BASE_RPC_URL is required in .env" >&2
  exit 1
fi

CHAIN_ID="${BASE_CHAIN_ID:-84532}"
if ! [[ "${CHAIN_ID}" =~ ^[0-9]+$ ]]; then
  echo "BASE_CHAIN_ID must be a number in .env" >&2
  exit 1
fi

LATEST_BLOCK="$(
  node - "${RPC_URL}" "${CHAIN_ID}" <<'NODE'
const { JsonRpcProvider } = require('ethers');

const rpcUrl = process.argv[2];
const chainIdRaw = process.argv[3];
if (!rpcUrl) {
  throw new Error('missing rpc url');
}
const chainId = Number(chainIdRaw || '84532');
if (!Number.isFinite(chainId)) {
  throw new Error('invalid chain id');
}

function networkForChainId(id) {
  if (id === 84532) return { name: 'base-sepolia', chainId: id };
  if (id === 8453) return { name: 'base', chainId: id };
  return { name: `chain-${id}`, chainId: id };
}

async function main() {
  const provider = new JsonRpcProvider(rpcUrl, networkForChainId(chainId), { staticNetwork: true });
  const block = await provider.getBlockNumber();
  process.stdout.write(String(block));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
NODE
)"

if ! [[ "${LATEST_BLOCK}" =~ ^[0-9]+$ ]]; then
  echo "Failed to fetch latest block number from RPC." >&2
  exit 1
fi

if grep -qE '^INDEXER_START_BLOCK=' "${ENV_FILE}"; then
  sed -i.bak -E "s|^INDEXER_START_BLOCK=.*$|INDEXER_START_BLOCK=${LATEST_BLOCK}|" "${ENV_FILE}"
else
  printf '\nINDEXER_START_BLOCK=%s\n' "${LATEST_BLOCK}" >> "${ENV_FILE}"
fi
rm -f "${ENV_FILE}.bak"

echo "Set INDEXER_START_BLOCK=${LATEST_BLOCK} in ${ENV_FILE}"
