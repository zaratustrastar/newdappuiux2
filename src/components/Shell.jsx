import { Link, useLocation } from 'wouter'
import { useEffect, useState } from 'react'
import { useWallet } from '../lib/wallet.jsx'
import { ConnectButton } from './ConnectButton.jsx'
import { fetchPositions } from '../vault/api.js'

const NAV = [
  { p: 'vault', href: '/', ix: '00', label: 'pARBITRAGE' },
  { p: 'lend', href: '/oplend', ix: '01', label: 'OpLend' },
  { p: 'portfolio', href: '/portfolio', ix: '02', label: 'Portfolio' },
]

export function Header() {
  const [loc] = useLocation()
  const { chainId, connected, isBase } = useWallet()
  // pARBITRAGE is the default: '/' and '/vault' (alias) and any unknown route.
  const activeP = loc.startsWith('/oplend')
    ? 'lend'
    : loc.startsWith('/portfolio')
      ? 'portfolio'
      : 'vault'

  return (
    <header className="header">
      <Link href="/" className="brand">
        <img className="brand-logo" src="/pmfi-logo.png" alt="PMFI logo" />
        <b>PMFI</b>
        <span className="brand-tag">Prediction&nbsp;Market&nbsp;Finance</span>
      </Link>
      <nav className="nav">
        {NAV.map((n) => (
          <Link key={n.p} href={n.href} data-p={n.p} className={activeP === n.p ? 'active' : ''}>
            <span className="ix">{n.ix}</span>
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="header-right">
        <div className={`chain${connected && !isBase ? ' wrong' : ''}`}>
          <span className="dot" />
          <span className="net-label">
            {!connected ? 'Base Mainnet' : isBase ? <b>Base · 8453</b> : `Chain ${chainId ?? '—'}`}
          </span>
        </div>
        <ConnectButton />
      </div>
    </header>
  )
}

// Illustrative spread tape. If the venue-positions API is reachable it shows real
// monitored pairs; otherwise it shows a clearly-labelled illustrative structure.
// It is never presented as live contract data.
const ILLUSTRATIVE_PAIRS = [
  ['POLY', 'KALSHI', 'US ELECTION'],
  ['POLY', 'KALSHI', 'FED RATE'],
  ['POLY', 'OPINION', 'BTC > 100K'],
  ['KALSHI', 'OPINION', 'CPI PRINT'],
  ['POLY', 'KALSHI', 'OSCARS'],
  ['POLY', 'OPINION', 'SUPER BOWL'],
]

export function SpreadTape() {
  const [pairs, setPairs] = useState(null) // null = use illustrative
  useEffect(() => {
    let alive = true
    fetchPositions().then((res) => {
      if (!alive) return
      if (res.available && Array.isArray(res.data?.positions)) {
        setPairs(
          res.data.positions.slice(0, 12).map((p) => [
            (p.venue1_label || p.venue1 || 'V1').toUpperCase(),
            (p.venue2_label || p.venue2 || 'V2').toUpperCase(),
            (p.market || p.label || '').toUpperCase(),
          ]),
        )
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const live = Boolean(pairs)
  const data = pairs || ILLUSTRATIVE_PAIRS
  const track = [...data, ...data]
  return (
    <div className="tape">
      <div className="tape-key">{live ? '◆ Venue spreads · live' : '◆ Spread tape · illustrative'}</div>
      <div className="tape-track">
        {track.map((d, i) => (
          <div className="tape-item" key={i}>
            <span className="mk">
              {d[0]} ↔ {d[1]}
            </span>
            <span className="sp">{d[2]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SystemBar() {
  const { connected, isBase } = useWallet()
  return (
    <div className="sysbar">
      <div className="cell">
        <span className="sdot" />
        <span>
          STATUS <b>{connected ? (isBase ? 'CONNECTED · BASE' : 'WRONG NETWORK') : 'READ-ONLY'}</b>
        </span>
      </div>
      <div className="cell">
        NETWORK <b>BASE · 8453</b>
      </div>
      <div className="cell">
        BUILDER <b>bc_uyxykegl</b>
      </div>
      <div className="cell right">PMFI · capital layer for prediction markets</div>
    </div>
  )
}
