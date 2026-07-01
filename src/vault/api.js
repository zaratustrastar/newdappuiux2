import { ENV, MISSING } from '../lib/env.js'

// pARBITRAGE price / NAV / venue-positions API.
// In production these are same-origin VPS routes (/api/arb-vault/nav,
// /api/arb-vault/positions, /price). They do not exist in a local build, so
// every function returns { available:false } unless VITE_PARB_API_BASE is set.
// The UI uses `available` to show "Unavailable" instead of inventing numbers.

const base = ENV.parbApiBase // '' when not configured

async function getJson(path) {
  if (!base) return { available: false, reason: 'API base not configured' }
  try {
    const res = await fetch(`${base}${path}`)
    if (!res.ok) return { available: false, reason: `HTTP ${res.status}` }
    return { available: true, data: await res.json() }
  } catch (e) {
    return { available: false, reason: e?.message || 'fetch failed' }
  }
}

// Trailing APR is an off-chain performance figure (not derivable on-chain).
export async function fetchNav() {
  return getJson('/api/arb-vault/nav')
}

// Venue spread pairs the strategy monitors (illustrative in the UI).
export async function fetchPositions() {
  return getJson('/api/arb-vault/positions')
}

export const parbApiMissing = MISSING.parbApi
