#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage:
  ./scripts/bond.sh [amount_token]

Examples:
  ./scripts/bond.sh 1
  ./scripts/bond.sh '$1'
  BOND_TOKEN=1 ./scripts/bond.sh
EOF
  exit 0
fi

if [[ $# -gt 1 ]]; then
  echo "Usage: ./scripts/bond.sh [amount_token]" >&2
  exit 1
fi

amount_input="${1:-${BOND_TOKEN:-${BOND_USDC:-1}}}"
amount_input="${amount_input#\$}"

if ! [[ "${amount_input}" =~ ^[0-9]+([.][0-9]{1,18})?$ ]]; then
  echo "Invalid amount '${amount_input}'. Use a token value like 3 or 3.5" >&2
  exit 1
fi

if [[ "${amount_input}" == "0" || "${amount_input}" == "0.0" || "${amount_input}" == "0.00" || "${amount_input}" == "0.000000" ]]; then
  echo "Amount must be greater than 0" >&2
  exit 1
fi

cd /home/luka/Desktop/Agentra/services/api
set -a
source ../../.env
set +a

BOND_TOKEN="${amount_input}" node --input-type=module <<'EOF'
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const chainId = Number(process.env.BASE_CHAIN_ID || '8453');
const chain = chainId === 84532 ? baseSepolia : base;
const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL;
const stakeVault = process.env.STAKE_VAULT_ADDRESS;
const daoToken =
  chainId === 84532
    ? process.env.DAO_TOKEN_ADDRESS_BASE_SEPOLIA || process.env.DAO_TOKEN_ADDRESS_BASE || process.env.DAO_TOKEN_ADDRESS || process.env.USDC_ADDRESS_BASE_SEPOLIA || process.env.USDC_ADDRESS_BASE || process.env.USDC_ADDRESS
    : process.env.DAO_TOKEN_ADDRESS_BASE || process.env.DAO_TOKEN_ADDRESS || process.env.USDC_ADDRESS_BASE || process.env.USDC_ADDRESS;
const tokenDecimals = Number(process.env.DAO_TOKEN_DECIMALS || '6');
const tokenSymbol = process.env.DAO_TOKEN_SYMBOL || 'HLX';
const amountInput = process.env.BOND_TOKEN || '1';
const amount = parseUnits(amountInput, tokenDecimals);
if (amount <= 0n) {
  throw new Error('BOND_TOKEN must be greater than 0');
}
console.log(`Bond amount configured: ${amountInput} ${tokenSymbol}`);

if (!rpcUrl) {
  throw new Error('BASE_SEPOLIA_RPC_URL or BASE_RPC_URL must be set');
}
if (!stakeVault) {
  throw new Error('STAKE_VAULT_ADDRESS must be set');
}
if (!daoToken) {
  throw new Error('DAO token address env var is missing');
}

const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
let keys = (process.env.AGENT_PRIVATE_KEYS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

if (keys.length === 0) {
  const { readFileSync } = await import('fs');
  const { resolve } = await import('path');
  const agentsPath = resolve(process.cwd(), '../../agents.txt');
  try {
    const content = readFileSync(agentsPath, 'utf-8');
    keys = content.split('\n').map((k) => k.trim()).filter(Boolean).map((k) => k.startsWith('0x') ? k : '0x' + k);
  } catch {
    /* ignore */
  }
}

if (keys.length === 0) {
  console.log('No AGENT_PRIVATE_KEYS or agents.txt configured; nothing to bond');
  process.exit(0);
}

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
];
const stakeAbi = [
  { type: 'function', name: 'bond', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'bondedBalance', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];

const FEE_BUMPS_BPS = [10000n, 12500n, 15000n, 18000n];

const bumpByBps = (value, bps) => (value * bps + 9999n) / 10000n;

const isNonceConflictError = (error) => {
  const text = `${error?.shortMessage ?? ''} ${error?.details ?? ''} ${error?.message ?? ''} ${
    error?.cause?.shortMessage ?? ''
  } ${error?.cause?.details ?? ''} ${error?.cause?.message ?? ''}`.toLowerCase();
  return (
    text.includes('replacement transaction underpriced') ||
    text.includes('nonce provided for the transaction is lower') ||
    text.includes('nonce too low') ||
    text.includes('already known')
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeWithRetry(walletClient, account, buildRequest) {
  let nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
  for (let i = 0; i < FEE_BUMPS_BPS.length; i += 1) {
    const feeBump = FEE_BUMPS_BPS[i];
    const fees = await publicClient.estimateFeesPerGas();

    const feeOverrides =
      fees.maxFeePerGas !== null &&
      fees.maxFeePerGas !== undefined &&
      fees.maxPriorityFeePerGas !== null &&
      fees.maxPriorityFeePerGas !== undefined
        ? {
            maxFeePerGas: bumpByBps(fees.maxFeePerGas, feeBump),
            maxPriorityFeePerGas: bumpByBps(fees.maxPriorityFeePerGas, feeBump),
          }
        : fees.gasPrice !== null && fees.gasPrice !== undefined
          ? { gasPrice: bumpByBps(fees.gasPrice, feeBump) }
          : {};

    try {
      const txHash = await walletClient.writeContract({
        ...buildRequest,
        account,
        chain,
        nonce,
        ...feeOverrides,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60000 });
      return txHash;
    } catch (error) {
      const exhausted = i === FEE_BUMPS_BPS.length - 1;
      if (!isNonceConflictError(error) || exhausted) {
        throw error;
      }

      const pendingNonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
      if (pendingNonce > nonce) {
        nonce = pendingNonce;
      }
      await sleep(750 * (i + 1));
    }
  }

  throw new Error('write retries exhausted');
}

async function readAllowance(agentAddress) {
  return await publicClient.readContract({
    address: daoToken,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [agentAddress, stakeVault],
  });
}

async function waitForAllowance(agentAddress, requiredAllowance) {
  let current = await readAllowance(agentAddress);
  for (let i = 0; i < 8 && current < requiredAllowance; i += 1) {
    await sleep(750);
    current = await readAllowance(agentAddress);
  }

  return current;
}

for (const raw of keys) {
  const account = privateKeyToAccount(raw.startsWith('0x') ? raw : `0x${raw}`);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const bal = await publicClient.readContract({
    address: daoToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  });

  if (bal < amount) {
    console.log(`skip ${account.address}: ${tokenSymbol} balance ${bal} < ${amount}`);
    continue;
  }

  const allowance = await readAllowance(account.address);

  try {
    if (allowance < amount) {
      const approveTx = await writeWithRetry(walletClient, account, {
        address: daoToken,
        abi: erc20Abi,
        functionName: 'approve',
        args: [stakeVault, amount],
      });
      console.log(`approved ${account.address} tx=${approveTx}`);
      const allowanceAfterApprove = await waitForAllowance(account.address, amount);
      if (allowanceAfterApprove < amount) {
        throw new Error(
          `allowance did not update in time: current=${allowanceAfterApprove.toString()} required=${amount.toString()}`,
        );
      }
    } else {
      console.log(`skip approve ${account.address}: allowance ${allowance} >= ${amount}`);
    }

    const simulation = await publicClient.simulateContract({
      account,
      address: stakeVault,
      abi: stakeAbi,
      functionName: 'bond',
      args: [amount],
    });
    const bondTx = await writeWithRetry(walletClient, account, simulation.request);

    const bonded = await publicClient.readContract({
      address: stakeVault,
      abi: stakeAbi,
      functionName: 'bondedBalance',
      args: [account.address],
    });

    console.log(`bonded ${account.address} amount=${amount} bondedBalance=${bonded} tx=${bondTx}`);
  } catch (error) {
    console.log(`bond failed for ${account.address}: ${error?.shortMessage ?? error?.message ?? String(error)}`);
  }
}
EOF
