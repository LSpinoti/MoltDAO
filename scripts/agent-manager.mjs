#!/usr/bin/env node
/**
 * Agent Manager - manage agents from agents.txt
 * Uses ethers.js. Operations: fund each agent with Helix Council token (HLX by default).
 *
 * Usage:
 *   node scripts/agent-manager.mjs fund <amount_token>             # Send each agent X DAO tokens from PRIVATE_KEY wallet
 *   node scripts/agent-manager.mjs fund-varied [start] [step]      # Send varying DAO token amounts per agent
 *   node scripts/agent-manager.mjs fund-random [min] [max]         # Send each agent a random DAO token amount
 *   node scripts/agent-manager.mjs balances                        # Print DAO token balance for each agent
 *   node scripts/agent-manager.mjs fund-eth <amount>               # Send each agent X Base Sepolia ETH
 *   node scripts/agent-manager.mjs env                             # Print AGENT_PRIVATE_KEYS for .env
 *   node scripts/agent-manager.mjs sync                            # Replace AGENT_PRIVATE_KEYS in .env with agents.txt
 *
 * Requires: .env with PRIVATE_KEY, RPC; agents.txt with private keys (one per line)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { ethers } from 'ethers';
import { randomInt } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
config({ path: resolve(root, '.env') });

const AGENTS_FILE = resolve(root, 'agents.txt');
const ENV_FILE = resolve(root, '.env');

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

function loadAgentKeys() {
  let content;
  try {
    content = readFileSync(AGENTS_FILE, 'utf-8');
  } catch (e) {
    throw new Error(`Cannot read ${AGENTS_FILE}: ${e.message}`);
  }

  const keys = content
    .split('\n')
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => (k.startsWith('0x') ? k : `0x${k}`));

  if (keys.length === 0) {
    throw new Error(`No private keys found in ${AGENTS_FILE}`);
  }
  return keys;
}

function resolveTokenAddress(chainId) {
  if (chainId === 84532) {
    return (
      process.env.DAO_TOKEN_ADDRESS_BASE_SEPOLIA ||
      process.env.DAO_TOKEN_ADDRESS_BASE ||
      process.env.DAO_TOKEN_ADDRESS ||
      process.env.USDC_ADDRESS_BASE_SEPOLIA ||
      process.env.USDC_ADDRESS_BASE ||
      process.env.USDC_ADDRESS
    );
  }

  return process.env.DAO_TOKEN_ADDRESS_BASE || process.env.DAO_TOKEN_ADDRESS || process.env.USDC_ADDRESS_BASE || process.env.USDC_ADDRESS;
}

function getRpcAndToken() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL;
  const chainId = Number(process.env.BASE_CHAIN_ID || '84532');
  const tokenAddress = resolveTokenAddress(chainId);
  if (!rpcUrl) throw new Error('BASE_SEPOLIA_RPC_URL or BASE_RPC_URL required');
  if (!tokenAddress) throw new Error('DAO token address env var required (DAO_TOKEN_ADDRESS* or fallback USDC_ADDRESS*)');
  return { rpcUrl, tokenAddress, chainId };
}

function networkForChainId(chainId) {
  if (chainId === 84532) return { name: 'base-sepolia', chainId };
  if (chainId === 8453) return { name: 'base', chainId };
  return { name: `chain-${chainId}`, chainId };
}

function createProvider(rpcUrl, chainId) {
  return new ethers.JsonRpcProvider(rpcUrl, networkForChainId(chainId), { staticNetwork: true });
}

function getEnvConfig() {
  const { rpcUrl, tokenAddress, chainId } = getRpcAndToken();
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY required for fund operation');
  return { rpcUrl, tokenAddress, privateKey, chainId };
}

function loadAgentAddresses() {
  return loadAgentKeys().map((k) => {
    try {
      return new ethers.Wallet(k).address;
    } catch {
      throw new Error('Invalid private key in agents.txt');
    }
  });
}

async function getTokenMetadata(contract) {
  let decimals = Number(process.env.DAO_TOKEN_DECIMALS || '6');
  let symbol = process.env.DAO_TOKEN_SYMBOL || 'HLX';

  try {
    const [onchainDecimals, onchainSymbol] = await Promise.all([contract.decimals(), contract.symbol()]);
    decimals = Number(onchainDecimals);
    symbol = String(onchainSymbol);
  } catch {
    // fall back to env defaults
  }

  return { decimals, symbol };
}

function cmdEnv() {
  const keys = loadAgentKeys();
  const csv = keys.join(',');
  console.log(`AGENT_PRIVATE_KEYS=${csv}`);
}

function cmdSync() {
  const keys = loadAgentKeys();
  const csv = keys.join(',');
  let content;
  try {
    content = readFileSync(ENV_FILE, 'utf-8');
  } catch (e) {
    throw new Error(`Cannot read ${ENV_FILE}: ${e.message}`);
  }

  const newLine = `AGENT_PRIVATE_KEYS=${csv}`;
  if (/^AGENT_PRIVATE_KEYS=/m.test(content)) {
    content = content.replace(/^AGENT_PRIVATE_KEYS=.*$/m, newLine);
  } else {
    content = content.replace(/\n(PRIVATE_KEY=.*)/, `\n$1\n${newLine}`);
  }

  writeFileSync(ENV_FILE, content);
  console.log(`Updated AGENT_PRIVATE_KEYS in .env (${keys.length} keys)`);
}

async function cmdBalances() {
  const addresses = loadAgentAddresses();
  const { rpcUrl, tokenAddress, chainId } = getRpcAndToken();

  const provider = createProvider(rpcUrl, chainId);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const { decimals, symbol } = await getTokenMetadata(token);

  let total = 0n;
  for (const address of addresses) {
    const bal = await token.balanceOf(address);
    total += bal;
    console.log(`${address}  ${ethers.formatUnits(bal, decimals)} ${symbol}`);
  }

  console.log('---');
  console.log(`Total: ${ethers.formatUnits(total, decimals)} ${symbol} (${addresses.length} agents)`);
}

async function cmdFundUniform(amountToken) {
  const { rpcUrl, tokenAddress, privateKey, chainId } = getEnvConfig();
  const addresses = loadAgentAddresses();

  const provider = createProvider(rpcUrl, chainId);
  const signer = new ethers.Wallet(privateKey, provider);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const { decimals, symbol } = await getTokenMetadata(token);

  const amount = ethers.parseUnits(String(amountToken), decimals);
  const totalNeeded = amount * BigInt(addresses.length);
  const signerBalance = await token.balanceOf(signer.address);

  if (signerBalance < totalNeeded) {
    throw new Error(
      `Insufficient ${symbol}: wallet has ${ethers.formatUnits(signerBalance, decimals)}, ` +
        `need ${ethers.formatUnits(totalNeeded, decimals)} for ${addresses.length} agents`,
    );
  }

  for (const address of addresses) {
    const tx = await token.transfer(address, amount);
    console.log(`Sent ${amountToken} ${symbol} to ${address} tx=${tx.hash}`);
    await tx.wait();
  }

  console.log(`Funded ${addresses.length} agents with ${amountToken} ${symbol} each.`);
}

async function cmdFundVaried(startAmountInput, stepAmountInput) {
  const { rpcUrl, tokenAddress, privateKey, chainId } = getEnvConfig();
  const addresses = loadAgentAddresses();

  const provider = createProvider(rpcUrl, chainId);
  const signer = new ethers.Wallet(privateKey, provider);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const { decimals, symbol } = await getTokenMetadata(token);

  const startAmount = Number(startAmountInput ?? process.env.AGENTS_FUND_START ?? 10);
  const stepAmount = Number(stepAmountInput ?? process.env.AGENTS_FUND_STEP ?? 5);
  if (!Number.isFinite(startAmount) || startAmount <= 0) {
    throw new Error('fund-varied start amount must be a positive number');
  }
  if (!Number.isFinite(stepAmount) || stepAmount < 0) {
    throw new Error('fund-varied step amount must be a non-negative number');
  }

  const transfers = addresses.map((address, i) => {
    const amountFloat = startAmount + stepAmount * i;
    const amountStr = amountFloat.toString();
    return {
      address,
      amountStr,
      amountWei: ethers.parseUnits(amountStr, decimals),
    };
  });

  const totalNeeded = transfers.reduce((acc, item) => acc + item.amountWei, 0n);
  const signerBalance = await token.balanceOf(signer.address);
  if (signerBalance < totalNeeded) {
    throw new Error(
      `Insufficient ${symbol}: wallet has ${ethers.formatUnits(signerBalance, decimals)}, ` +
        `need ${ethers.formatUnits(totalNeeded, decimals)} for ${addresses.length} agents`,
    );
  }

  for (const transfer of transfers) {
    const tx = await token.transfer(transfer.address, transfer.amountWei);
    console.log(`Sent ${transfer.amountStr} ${symbol} to ${transfer.address} tx=${tx.hash}`);
    await tx.wait();
  }

  console.log(`Funded ${addresses.length} agents with varied ${symbol} amounts starting at ${startAmount}, step ${stepAmount}.`);
}

async function cmdFundRandom(minAmountInput, maxAmountInput) {
  const { rpcUrl, tokenAddress, privateKey, chainId } = getEnvConfig();
  const addresses = loadAgentAddresses();

  const provider = createProvider(rpcUrl, chainId);
  const signer = new ethers.Wallet(privateKey, provider);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const { decimals, symbol } = await getTokenMetadata(token);

  const minAmount = Number(minAmountInput ?? process.env.AGENTS_FUND_MIN ?? 50);
  const maxAmount = Number(maxAmountInput ?? process.env.AGENTS_FUND_MAX ?? 200);
  if (!Number.isFinite(minAmount) || minAmount <= 0) {
    throw new Error('fund-random min amount must be a positive number');
  }
  if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
    throw new Error('fund-random max amount must be a positive number');
  }
  if (maxAmount < minAmount) {
    throw new Error('fund-random max amount must be >= min amount');
  }

  const minInt = Math.floor(minAmount);
  const maxInt = Math.floor(maxAmount);
  if (minInt <= 0) {
    throw new Error('fund-random min amount must be >= 1');
  }
  if (maxInt < minInt) {
    throw new Error('fund-random max amount must be >= min amount (after rounding)');
  }

  const transfers = addresses.map((address) => {
    const amountInt = randomInt(minInt, maxInt + 1);
    const amountStr = String(amountInt);
    return {
      address,
      amountStr,
      amountWei: ethers.parseUnits(amountStr, decimals),
    };
  });

  const totalNeeded = transfers.reduce((acc, item) => acc + item.amountWei, 0n);
  const signerBalance = await token.balanceOf(signer.address);
  if (signerBalance < totalNeeded) {
    throw new Error(
      `Insufficient ${symbol}: wallet has ${ethers.formatUnits(signerBalance, decimals)}, ` +
        `need ${ethers.formatUnits(totalNeeded, decimals)} for ${addresses.length} agents`,
    );
  }

  for (const transfer of transfers) {
    const tx = await token.transfer(transfer.address, transfer.amountWei);
    console.log(`Sent ${transfer.amountStr} ${symbol} to ${transfer.address} tx=${tx.hash}`);
    await tx.wait();
  }

  console.log(`Funded ${addresses.length} agents with random ${symbol} amounts between ${minInt} and ${maxInt}.`);
}

async function cmdFundEth(amountEth) {
  const amount = ethers.parseEther(String(amountEth));
  const keys = loadAgentKeys();
  const { rpcUrl, privateKey, chainId } = getEnvConfig();

  const provider = createProvider(rpcUrl, chainId);
  const signer = new ethers.Wallet(privateKey, provider);

  const addresses = keys.map((k) => {
    try {
      return new ethers.Wallet(k).address;
    } catch {
      throw new Error('Invalid private key in agents.txt');
    }
  });

  const bal = await provider.getBalance(signer.address);
  const gasPrice = (await provider.getFeeData()).gasPrice ?? 0n;
  const gasPerTx = 21000n;
  const totalEthNeeded = amount * BigInt(addresses.length);
  const totalGasNeeded = gasPrice * gasPerTx * BigInt(addresses.length);
  const totalNeeded = totalEthNeeded + totalGasNeeded;

  if (bal < totalNeeded) {
    throw new Error(
      `Insufficient ETH: wallet has ${ethers.formatEther(bal)} ETH, ` +
        `need ${ethers.formatEther(totalNeeded)} ETH for ${addresses.length} agents + gas`,
    );
  }

  for (const address of addresses) {
    const tx = await signer.sendTransaction({ to: address, value: amount });
    console.log(`Sent ${amountEth} ETH to ${address} tx=${tx.hash}`);
    await tx.wait();
  }

  console.log(`Funded ${addresses.length} agents with ${amountEth} ETH each.`);
}

async function main() {
  const [op, arg1, arg2] = process.argv.slice(2);

  if (!op) {
    console.log(`
Agent Manager

  node scripts/agent-manager.mjs fund <amount_token>            Send each agent X DAO tokens
  node scripts/agent-manager.mjs fund-varied [start] [step]     Send varying DAO token amounts per agent
  node scripts/agent-manager.mjs fund-random [min] [max]        Send each agent a random DAO token amount
  node scripts/agent-manager.mjs balances                        Print DAO token balance for each agent
  node scripts/agent-manager.mjs fund-eth <amount>              Send each agent X Base Sepolia ETH
  node scripts/agent-manager.mjs env                             Print AGENT_PRIVATE_KEYS for .env
  node scripts/agent-manager.mjs sync                            Update AGENT_PRIVATE_KEYS in .env from agents.txt

Reads agents from agents.txt (one private key per line).
Uses BASE_SEPOLIA_RPC_URL/BASE_RPC_URL, DAO_TOKEN_ADDRESS* (fallback USDC_ADDRESS*), PRIVATE_KEY from .env.
`);
    process.exit(1);
  }

  if (op === 'env') {
    cmdEnv();
    return;
  }

  if (op === 'sync') {
    cmdSync();
    return;
  }

  if (op === 'balances') {
    await cmdBalances();
    return;
  }

  if (op === 'fund') {
    const amountToken = arg1 ?? process.env.AGENTS_FUND_TOKEN ?? process.env.AGENTS_FUND_USDC ?? 0;
    if (!amountToken || Number.isNaN(Number(amountToken))) {
      console.error('Usage: node scripts/agent-manager.mjs fund <amount_token>');
      console.error('   or: AGENTS_FUND_TOKEN=10 node scripts/agent-manager.mjs fund');
      process.exit(1);
    }
    await cmdFundUniform(amountToken);
    return;
  }

  if (op === 'fund-varied') {
    await cmdFundVaried(arg1, arg2);
    return;
  }

  if (op === 'fund-random') {
    await cmdFundRandom(arg1, arg2);
    return;
  }

  if (op === 'fund-eth') {
    const amountEth = arg1 ?? process.env.AGENTS_FUND_ETH ?? 0;
    if (!amountEth || Number.isNaN(Number(amountEth))) {
      console.error('Usage: node scripts/agent-manager.mjs fund-eth <amount_eth>');
      console.error('   or: AGENTS_FUND_ETH=0.01 node scripts/agent-manager.mjs fund-eth');
      process.exit(1);
    }
    await cmdFundEth(amountEth);
    return;
  }

  console.error(`Unknown command: ${op}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
