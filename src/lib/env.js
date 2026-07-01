// Central env access + honest "missing source" flags.
// Every getter documents the legacy production source it replaces.

const env = import.meta.env

export const ENV = {
  // Wallet
  privyAppId: env.VITE_PRIVY_APP_ID || '',

  // RPC
  baseRpcUrl: env.VITE_BASE_RPC_URL || 'https://mainnet.base.org', // public fallback
  oplendRpcUrl: env.VITE_OPLEND_RPC_URL || 'https://oplend.pmfi.cc/rpc',

  // pARBITRAGE vault
  arbVaultV2Address: env.VITE_ARB_VAULT_V2_ADDRESS || '', // injected via PSNIPER_CONFIG in prod
  parbApiBase: env.VITE_PARB_API_BASE || '', // same-origin VPS API in prod
}

// Flags used by the UI to render honest "Unavailable" / "not configured" states
// instead of inventing data. Each maps to a real, documented missing source.
export const MISSING = {
  arbV2Address: !ENV.arbVaultV2Address,   // V2 async vault address not provided
  parbApi: !ENV.parbApiBase,              // price/NAV/positions API not reachable
  privy: !ENV.privyAppId,                 // Privy bridge not configured (injected-wallet fallback)
}
