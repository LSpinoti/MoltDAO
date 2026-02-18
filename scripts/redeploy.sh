#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/redeploy.sh [--usdc-address <address>] [--no-env-write]

Description:
  Redeploys contracts using contracts/script/Deploy.s.sol and BASE_RPC_URL from .env.
  By default, writes deployed addresses back into .env:
    AGENT_REGISTRY_ADDRESS
    STAKE_VAULT_ADDRESS
    REPUTATION_ADDRESS
    ACTION_EXECUTOR_ADDRESS
    FORUM_ADDRESS

Options:
  --usdc-address <address>  Override USDC_ADDRESS used during deployment.
  --no-env-write            Do not write addresses into .env.
  -h, --help                Show this help message.
EOF
}

USDC_OVERRIDE=""
WRITE_ENV=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --usdc-address)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Missing value for --usdc-address" >&2
        exit 1
      fi
      USDC_OVERRIDE="$1"
      ;;
    --no-env-write)
      WRITE_ENV=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env is missing at ${ENV_FILE}. Run: cp .env.example .env" >&2
  exit 1
fi

if ! command -v forge >/dev/null 2>&1; then
  echo "forge not found. Install Foundry first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${BASE_RPC_URL:?BASE_RPC_URL is required in .env}"
: "${PRIVATE_KEY:?PRIVATE_KEY is required in .env}"

BASE_CHAIN_ID="${BASE_CHAIN_ID:-8453}"

resolve_usdc_address() {
  if [[ -n "${USDC_OVERRIDE}" ]]; then
    printf '%s\n' "${USDC_OVERRIDE}"
    return
  fi

  if [[ -n "${USDC_ADDRESS:-}" ]]; then
    printf '%s\n' "${USDC_ADDRESS}"
    return
  fi

  if [[ "${BASE_CHAIN_ID}" == "84532" && -n "${USDC_ADDRESS_BASE_SEPOLIA:-}" ]]; then
    printf '%s\n' "${USDC_ADDRESS_BASE_SEPOLIA}"
    return
  fi

  if [[ -n "${USDC_ADDRESS_BASE:-}" ]]; then
    printf '%s\n' "${USDC_ADDRESS_BASE}"
    return
  fi

  echo "Unable to resolve USDC address. Set USDC_ADDRESS or pass --usdc-address." >&2
  exit 1
}

validate_address() {
  [[ "$1" =~ ^0x[a-fA-F0-9]{40}$ ]]
}

USDC_ADDRESS_RESOLVED="$(resolve_usdc_address)"
if ! validate_address "${USDC_ADDRESS_RESOLVED}"; then
  echo "Invalid USDC address: ${USDC_ADDRESS_RESOLVED}" >&2
  exit 1
fi

echo "Deploying with:"
echo "  BASE_CHAIN_ID=${BASE_CHAIN_ID}"
echo "  BASE_RPC_URL=${BASE_RPC_URL}"
echo "  USDC_ADDRESS=${USDC_ADDRESS_RESOLVED}"

pushd "${ROOT_DIR}/contracts" >/dev/null
USDC_ADDRESS="${USDC_ADDRESS_RESOLVED}" PRIVATE_KEY="${PRIVATE_KEY}" \
  forge script script/Deploy.s.sol --rpc-url "${BASE_RPC_URL}" --broadcast
popd >/dev/null

BROADCAST_FILE="${ROOT_DIR}/contracts/broadcast/Deploy.s.sol/${BASE_CHAIN_ID}/run-latest.json"
if [[ ! -f "${BROADCAST_FILE}" ]]; then
  echo "Expected broadcast output not found: ${BROADCAST_FILE}" >&2
  exit 1
fi

ADDRESSES="$(
  node - "${BROADCAST_FILE}" <<'EOF'
const fs = require('fs');

const file = process.argv[2];
const expected = ['AgentRegistry', 'StakeVault', 'Reputation', 'ActionExecutor', 'Forum'];
const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
const out = new Map();

for (const tx of parsed.transactions || []) {
  if (tx?.transactionType !== 'CREATE') continue;
  if (!expected.includes(tx.contractName)) continue;
  if (typeof tx.contractAddress !== 'string') continue;
  out.set(tx.contractName, tx.contractAddress);
}

for (const key of expected) {
  const value = out.get(key);
  if (!value) {
    console.error(`Missing ${key} in ${file}`);
    process.exit(1);
  }
  console.log(`${key}=${value}`);
}
EOF
)"

AGENT_REGISTRY_ADDRESS_NEW=""
STAKE_VAULT_ADDRESS_NEW=""
REPUTATION_ADDRESS_NEW=""
ACTION_EXECUTOR_ADDRESS_NEW=""
FORUM_ADDRESS_NEW=""

while IFS='=' read -r key value; do
  case "${key}" in
    AgentRegistry) AGENT_REGISTRY_ADDRESS_NEW="${value}" ;;
    StakeVault) STAKE_VAULT_ADDRESS_NEW="${value}" ;;
    Reputation) REPUTATION_ADDRESS_NEW="${value}" ;;
    ActionExecutor) ACTION_EXECUTOR_ADDRESS_NEW="${value}" ;;
    Forum) FORUM_ADDRESS_NEW="${value}" ;;
  esac
done <<< "${ADDRESSES}"

for addr in \
  "${AGENT_REGISTRY_ADDRESS_NEW}" \
  "${STAKE_VAULT_ADDRESS_NEW}" \
  "${REPUTATION_ADDRESS_NEW}" \
  "${ACTION_EXECUTOR_ADDRESS_NEW}" \
  "${FORUM_ADDRESS_NEW}"; do
  if ! validate_address "${addr}"; then
    echo "Failed to parse deployed contract addresses from forge output." >&2
    exit 1
  fi
done

echo
echo "Deployed addresses:"
echo "  AGENT_REGISTRY_ADDRESS=${AGENT_REGISTRY_ADDRESS_NEW}"
echo "  STAKE_VAULT_ADDRESS=${STAKE_VAULT_ADDRESS_NEW}"
echo "  REPUTATION_ADDRESS=${REPUTATION_ADDRESS_NEW}"
echo "  ACTION_EXECUTOR_ADDRESS=${ACTION_EXECUTOR_ADDRESS_NEW}"
echo "  FORUM_ADDRESS=${FORUM_ADDRESS_NEW}"

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" "${ENV_FILE}"; then
    sed -i.bak -E "s|^${key}=.*$|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

if [[ "${WRITE_ENV}" -eq 1 ]]; then
  upsert_env "USDC_ADDRESS" "${USDC_ADDRESS_RESOLVED}"
  upsert_env "AGENT_REGISTRY_ADDRESS" "${AGENT_REGISTRY_ADDRESS_NEW}"
  upsert_env "STAKE_VAULT_ADDRESS" "${STAKE_VAULT_ADDRESS_NEW}"
  upsert_env "REPUTATION_ADDRESS" "${REPUTATION_ADDRESS_NEW}"
  upsert_env "ACTION_EXECUTOR_ADDRESS" "${ACTION_EXECUTOR_ADDRESS_NEW}"
  upsert_env "FORUM_ADDRESS" "${FORUM_ADDRESS_NEW}"
  rm -f "${ENV_FILE}.bak"
  echo
  echo "Updated ${ENV_FILE} with deployed addresses."
else
  echo
  echo "--no-env-write set; .env was not modified."
fi
