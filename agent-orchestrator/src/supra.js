/**
 * Minimal Supra adapter used by agent workflows.
 *
 * This MVP keeps the integration interface simple:
 * - try Supra HTTP feed endpoint if configured
 * - otherwise return a deterministic fallback quote
 */

const DEFAULT_PRICE = {
  source: 'fallback',
  symbol: 'ETH-USD',
  price: 2500,
  confidence: 0.5,
  timestamp: Date.now(),
};

export async function getSupraPrice(symbol = 'ETH-USD') {
  const endpoint = process.env.SUPRA_PRICE_API_URL;

  if (!endpoint) {
    return { ...DEFAULT_PRICE, symbol };
  }

  try {
    const url = new URL(endpoint);
    url.searchParams.set('symbol', symbol);

    const response = await fetch(url, {
      headers: process.env.SUPRA_API_KEY ? { Authorization: `Bearer ${process.env.SUPRA_API_KEY}` } : {},
    });

    if (!response.ok) {
      throw new Error(`supra status ${response.status}`);
    }

    const payload = await response.json();
    return {
      source: 'supra',
      symbol,
      price: Number(payload.price),
      confidence: Number(payload.confidence ?? 0.9),
      timestamp: Number(payload.timestamp ?? Date.now()),
    };
  } catch (_error) {
    return { ...DEFAULT_PRICE, symbol };
  }
}

export function withinSlippage(referencePrice, executionPrice, maxSlippageBps) {
  if (!referencePrice || !executionPrice) return false;
  const diff = Math.abs(executionPrice - referencePrice);
  const slippageBps = (diff / referencePrice) * 10_000;
  return slippageBps <= maxSlippageBps;
}
