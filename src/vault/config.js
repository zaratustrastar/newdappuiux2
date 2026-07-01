import { ENV } from '../lib/env.js'

// pARBITRAGE vault configuration. Addresses ported from legacy app-pmfi/main.js.
export const VAULT = {
  // V1 (sign-NAV) vault — known, pinned in production default.
  v1Address: '0x17C27001929E75D1eBd5FdeE6E986EA5a91de0D1',
  // V2 async request/claim vault — injected via window.PSNIPER_CONFIG in prod.
  // Not in the repo; read from env. Empty → on-chain panels show "not configured".
  v2Address: ENV.arbVaultV2Address,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // canonical Base USDC
  usdcDecimals: 6,
  shareDecimals: 18,
  rpcUrl: ENV.baseRpcUrl,
  minDepositUsdc: 10, // legacy: "Minimum deposit is $10 USDC"
}

// Request status enum — matches contract (0=PENDING,1=CLAIMABLE,2=CLAIMED,3=CANCELLED).
export const ARB_REQ_STATUS = { 0: 'Pending', 1: 'Claimable', 2: 'Claimed', 3: 'Cancelled' }

let _v2Abi = null
let _usdcAbi = null
export async function loadVaultAbis() {
  if (!_v2Abi) {
    const [v2, usdc] = await Promise.all([
      fetch('/abis/parb-vault-v2.json').then((r) => r.json()),
      fetch('/abis/usdc.json').then((r) => r.json()),
    ])
    _v2Abi = v2
    _usdcAbi = usdc
  }
  return { v2Abi: _v2Abi, usdcAbi: _usdcAbi }
}
