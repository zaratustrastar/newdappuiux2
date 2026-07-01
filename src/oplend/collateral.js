import { getAddress } from 'ethers'
import { CONFIG } from './config.js'
import { factoryRead, erc20Read } from './contracts.js'
import {
  discoverCollateralTokens,
  withMetadataFallback,
  normalizeAddress,
} from './collateralDiscovery.js'

// Collateral discovery + allowlist.
// Authoritative allowlist source is on-chain: factory.collateralAllowed(address)
// and CollateralAllowed events from FACTORY_DEPLOYMENT_BLOCK (per legacy).
// The curated collateral-list.json supplies names / symbols / logos only.

let _meta = null
async function loadMeta() {
  if (_meta) return _meta
  const [list, logos] = await Promise.all([
    fetch('/collateral-list.json').then((r) => r.json()).catch(() => ({ tokens: [] })),
    fetch('/token-logo-manifest.json').then((r) => r.json()).catch(() => ({})),
  ])
  const byAddr = {}
  for (const t of list.tokens || []) {
    byAddr[normalizeAddress(t.address)] = {
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      logoURI: t.logoURI || logos[normalizeAddress(t.address)] || null,
    }
  }
  _meta = { byAddr, logos }
  return _meta
}

export function logoFor(address, manifest) {
  return manifest?.logos?.[normalizeAddress(address)] || null
}

// Live allowlist check (authoritative).
export async function isCollateralAllowed(address) {
  try {
    return await factoryRead().collateralAllowed(address)
  } catch {
    return false
  }
}

// Read on-chain ERC20 metadata + the connected wallet's balance.
async function readErc20(address, account) {
  const c = erc20Read(address)
  const [symbol, name, decimals, balance] = await Promise.all([
    c.symbol().catch(() => null),
    c.name().catch(() => null),
    c.decimals().then((d) => Number(d)).catch(() => null),
    account ? c.balanceOf(account).catch(() => 0n) : Promise.resolve(0n),
  ])
  return { symbol, name, decimals, balance }
}

// Discover the full set of allowlisted collateral tokens via factory events,
// confirm each with collateralAllowed(), and enrich with curated metadata/logos.
// Returns honest, on-chain-derived tokens (no invented entries).
export async function discoverAllowedCollateral(account) {
  const meta = await loadMeta()
  const factory = factoryRead()

  let tokens = []
  try {
    tokens = await discoverCollateralTokens({
      fromBlock: CONFIG.FACTORY_DEPLOYMENT_BLOCK,
      toBlock: await factory.runner.provider.getBlockNumber(),
      rangeSize: 50000n,
      getLogs: async (fromBlock, toBlock) =>
        factory.queryFilter(factory.filters.CollateralAllowed(), fromBlock, toBlock),
      parseLog: (log) => ({ collateral: log?.args?.collateral, allowed: log?.args?.allowed }),
      isAllowed: (address) => factory.collateralAllowed(address),
      readMetadata: async (address) => {
        const onchain = await readErc20(address, account)
        const curated = meta.byAddr[normalizeAddress(address)] || {}
        return {
          symbol: onchain.symbol || curated.symbol,
          name: onchain.name || curated.name,
          decimals: Number.isFinite(onchain.decimals) ? onchain.decimals : curated.decimals,
          balance: onchain.balance,
        }
      },
    })
  } catch (e) {
    // Event discovery can fail on rate-limited public RPC. Fall back to the curated
    // list, but STILL verify each entry against the on-chain allowlist (no faking).
    const curated = Object.entries(meta.byAddr)
    const checked = await Promise.all(
      curated.map(async ([addr, m]) => {
        const allowed = await factory.collateralAllowed(addr).catch(() => false)
        if (!allowed) return null
        const onchain = await readErc20(addr, account).catch(() => ({}))
        return withMetadataFallback(getAddress(addr), {
          symbol: onchain.symbol || m.symbol,
          name: onchain.name || m.name,
          decimals: Number.isFinite(onchain.decimals) ? onchain.decimals : m.decimals,
          balance: onchain.balance ?? 0n,
          allowed: true,
        })
      }),
    )
    tokens = checked.filter(Boolean)
  }

  // Attach logos + USDC flag
  return tokens.map((t) => {
    const key = normalizeAddress(t.address)
    return {
      ...t,
      logoURI: meta.byAddr[key]?.logoURI || meta.logos[key] || null,
      isUsdc: key === normalizeAddress(CONFIG.BASE_USDC),
    }
  })
}
