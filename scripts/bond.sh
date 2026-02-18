cd /home/luka/Desktop/Agentra/services/api
set -a; source ../../.env; set +a
BOND_USDC=16 node --input-type=module <<'EOF'
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const chainId = Number(process.env.BASE_CHAIN_ID || '8453');
const chain = chainId === 84532 ? baseSepolia : base;

const publicClient = createPublicClient({ chain, transport: http(process.env.BASE_RPC_URL) });
const stakeVault = process.env.STAKE_VAULT_ADDRESS;
const usdc = process.env.USDC_ADDRESS_BASE;
const amount = parseUnits(process.env.BOND_USDC || '5', 6); // USDC has 6 decimals

const keys = (process.env.AGENT_PRIVATE_KEYS || '')
  .split(',')
  .map((k) => k.trim())
  .filter(Boolean);

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const stakeAbi = [
  { type: 'function', name: 'bond', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
];

for (const raw of keys) {
  const account = privateKeyToAccount(raw.startsWith('0x') ? raw : `0x${raw}`);
  const walletClient = createWalletClient({ account, chain, transport: http(process.env.BASE_RPC_URL) });

  const bal = await publicClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account.address],
  });

  if (bal < amount) {
    console.log(`skip ${account.address}: USDC balance ${bal} < ${amount}`);
    continue;
  }

  const approveTx = await walletClient.writeContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'approve',
    args: [stakeVault, amount],
    account,
    chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });

  const bondTx = await walletClient.writeContract({
    address: stakeVault,
    abi: stakeAbi,
    functionName: 'bond',
    args: [amount],
    account,
    chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: bondTx });

  console.log(`bonded ${account.address} amount=${amount}`);
}
EOF

