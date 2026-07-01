import { useCallback, useEffect, useState } from 'react'
import { Contract, JsonRpcProvider } from 'ethers'
import { VAULT, loadVaultAbis, ARB_REQ_STATUS } from './config.js'
import { MISSING } from '../lib/env.js'

// Real on-chain reads for the V2 async vault. No mock values.
// Requires VAULT.v2Address (env). Without it, returns { configured:false } so the
// UI can render an honest "pARB vault address not configured" state.

function readProvider() {
  return new JsonRpcProvider(VAULT.rpcUrl, 8453, { staticNetwork: true })
}

export function useVaultStats(address) {
  const [state, setState] = useState({
    loading: true,
    configured: Boolean(VAULT.v2Address),
    error: null,
    sharePrice: null, // USDC per pARB
    tvl: null, // USDC
    paused: null,
    shutdown: null,
    userShares: null, // bigint
    userValueUsdc: null, // number
    requests: [], // active deposit/redeem requests
  })

  const refresh = useCallback(async () => {
    if (!VAULT.v2Address) {
      setState((s) => ({ ...s, loading: false, configured: false }))
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { v2Abi } = await loadVaultAbis()
      const c = new Contract(VAULT.v2Address, v2Abi, readProvider())
      const vs = await c.getVaultState()
      const officialPPS = vs[0] // USDC(1e6) per 1e18 shares
      const circulating = vs[1] // shares (1e18)
      const paused = vs[10]
      const shutdown = vs[11]

      const sharePrice = Number(officialPPS) / 1e6
      const tvl = (Number(circulating) / 1e18) * sharePrice

      let userShares = null
      let userValueUsdc = null
      let requests = []
      if (address) {
        userShares = await c.balanceOf(address)
        userValueUsdc = (Number(userShares) / 1e18) * sharePrice
        requests = await loadRequests(c, address)
      }

      setState({
        loading: false,
        configured: true,
        error: null,
        sharePrice,
        tvl,
        paused,
        shutdown,
        userShares,
        userValueUsdc,
        requests,
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.message || 'read failed' }))
    }
  }, [address])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30000) // legacy REFRESH_INTERVAL
    return () => clearInterval(t)
  }, [refresh])

  return { ...state, refresh }
}

async function loadRequests(c, address) {
  const [depIds, rdmIds] = await Promise.all([
    c.getUserDepositRequests(address),
    c.getUserRedeemRequests(address),
  ])
  const [deps, rdms] = await Promise.all([
    Promise.all(depIds.map((id) => c.getDepositRequest(id))),
    Promise.all(rdmIds.map((id) => c.getRedeemRequest(id))),
  ])
  const out = []
  deps.forEach((r, i) => {
    // only PENDING(0) / CLAIMABLE(1)
    if (r.status === 0n || r.status === 1n) {
      out.push({
        kind: 'deposit',
        id: depIds[i].toString(),
        status: Number(r.status),
        statusLabel: ARB_REQ_STATUS[Number(r.status)],
        primary: (Number(r.assets) / 1e6).toFixed(2), // USDC in
        secondary: (Number(r.estimatedShares) / 1e18).toFixed(4), // est pARB
        claimable: r.status === 1n,
      })
    }
  })
  rdms.forEach((r, i) => {
    if (r.status === 0n || r.status === 1n) {
      out.push({
        kind: 'redeem',
        id: rdmIds[i].toString(),
        status: Number(r.status),
        statusLabel: ARB_REQ_STATUS[Number(r.status)],
        primary: (Number(r.shares) / 1e18).toFixed(4), // pARB in
        secondary: (Number(r.estimatedAssets) / 1e6).toFixed(2), // est USDC
        claimable: r.status === 1n,
      })
    }
  })
  return out
}

export const vaultMissing = MISSING
