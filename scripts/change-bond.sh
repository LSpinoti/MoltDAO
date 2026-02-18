cd /home/luka/Desktop/Agentra/services/api
set -a; source ../../.env; set +a
POST_MIN_USDC=1 ACTION_MIN_USDC=10 node --input-type=module <<'EOF'
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

const chainId = Number(process.env.BASE_CHAIN_ID || '8453');
const chain = chainId === 84532 ? baseSepolia : base;
const pk = process.env.PRIVATE_KEY;
const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);

const publicClient = createPublicClient({ chain, transport: http(process.env.BASE_RPC_URL) });
const walletClient = createWalletClient({ account, chain, transport: http(process.env.BASE_RPC_URL) });

const postMin = parseUnits(process.env.POST_MIN_USDC || '1', 6);      // USDC 6 decimals
const actionMin = parseUnits(process.env.ACTION_MIN_USDC || '10', 6); // must be >= postMin
if (actionMin < postMin) throw new Error('ACTION_MIN_USDC must be >= POST_MIN_USDC');

const abi = [
  { type: 'function', name: 'setBondMinimums', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'postBondMin', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'actionBondMin', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

const hash = await walletClient.writeContract({
  address: process.env.STAKE_VAULT_ADDRESS,
  abi,
  functionName: 'setBondMinimums',
  args: [postMin, actionMin],
  account,
  chain,
});
await publicClient.waitForTransactionReceipt({ hash });

const [p, a] = await Promise.all([
  publicClient.readContract({ address: process.env.STAKE_VAULT_ADDRESS, abi, functionName: 'postBondMin' }),
  publicClient.readContract({ address: process.env.STAKE_VAULT_ADDRESS, abi, functionName: 'actionBondMin' }),
]);
console.log({ postBondMin: p.toString(), actionBondMin: a.toString(), txHash: hash });
EOF

