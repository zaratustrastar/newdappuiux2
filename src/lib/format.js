// Formatting helpers — ported from legacy oplend/src/format.js and vault main.js.
import { formatUnits } from 'ethers'

export function shortAddress(a) {
  return a ? `${String(a).slice(0, 6)}…${String(a).slice(-4)}` : '—'
}

export function formatDate(timestamp) {
  return new Date(Number(timestamp) * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function money(n) {
  const value = Number(n || 0)
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
    : '0.00'
}

export function usd(n) {
  return '$' + money(n)
}

// USDC has 6 decimals throughout PMFI.
export function fromUSDC(bn, dp = 2) {
  return Number(formatUnits(bn ?? 0n, 6)).toFixed(dp)
}

export function fromShares(bn, dp = 4) {
  return Number(formatUnits(bn ?? 0n, 18)).toFixed(dp)
}

export function fromUnits(bn, decimals, dp = 4) {
  return Number(formatUnits(bn ?? 0n, decimals)).toFixed(dp)
}

export function sanitizeError(error) {
  const msg =
    error?.shortMessage || error?.reason || error?.message || String(error || 'Unknown error')
  return String(msg).slice(0, 320)
}

// Shared Web3 error parser — ported from vault main.js _parseWeb3Error().
export function parseWeb3Error(e) {
  const msg = e?.message || ''
  const code = e?.code ?? e?.info?.error?.code
  if (code === -32603 || msg.includes('Failed to fetch') || msg.includes('could not coalesce')) {
    return 'Network error — wallet could not reach Base. Try again or switch RPC in wallet settings.'
  }
  if (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    msg.toLowerCase().includes('user rejected') ||
    msg.toLowerCase().includes('user denied')
  ) {
    return 'Transaction cancelled.'
  }
  if (e?.reason) return e.reason
  if (e?.shortMessage) return e.shortMessage
  return msg || 'Transaction failed'
}

export function secondsFromDays(days) {
  return Math.max(0, Math.round(Number(days || 0) * 86400))
}

export function nowSec() {
  return Math.floor(Date.now() / 1000)
}
