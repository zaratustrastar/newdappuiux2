import { useWallet } from '../lib/wallet.jsx'
import { usd, fromShares } from '../lib/format.js'
import { Unavailable } from './ui.jsx'
import { liveOpenMarkets } from '../oplend/useOplend.js'

// The rail derives everything from the connected wallet's real state.
// It never shows a fabricated net value. The vault position value is real
// (on-chain shares × official PPS). OpLend P/N holdings are token positions
// without a clean USD oracle here, so they are summarised by count, not USD.
export function Rail({ vault, oplend }) {
  const { connected } = useWallet()

  const vaultValue = vault?.configured && vault?.userValueUsdc != null ? vault.userValueUsdc : null
  const myOplend = (oplend?.markets || []).filter((m) => m.pBalance > 0n || m.nBalance > 0n)
  const open = liveOpenMarkets(oplend?.markets || [])

  return (
    <aside className="rail">
      <div className="rail-sec">
        <h4>Portfolio</h4>
        {!connected ? (
          <>
            <div className="rail-net">
              <Unavailable label="—" />
            </div>
            <div className="rail-sub">Connect a wallet to view your positions</div>
          </>
        ) : (
          <>
            <div className="rail-net tnum">
              {vaultValue != null ? (
                <>
                  {usd(vaultValue)} <small>pARB</small>
                </>
              ) : (
                <Unavailable label="—" />
              )}
            </div>
            <div className="rail-sub">
              {vault?.configured
                ? 'pARBITRAGE position value (on-chain)'
                : 'pARB vault address not configured'}
            </div>
            <div className="split-row">
              <span className="swatch" style={{ background: 'var(--accent)' }} />
              <span className="nm">pARBITRAGE</span>
              <span className="vl tnum">
                {vault?.configured && vault?.userShares != null ? `${fromShares(vault.userShares)} pARB` : '—'}
              </span>
            </div>
            <div className="split-row">
              <span className="swatch" style={{ background: 'var(--muted)' }} />
              <span className="nm">OpLend</span>
              <span className="vl tnum">
                {myOplend.length} position{myOplend.length === 1 ? '' : 's'}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="rail-sec">
        <h4>pARBITRAGE</h4>
        <div className="rail-stat">
          <span className="k">TVL</span>
          <span className="v tnum">
            {vault?.configured && vault?.tvl != null ? usd(vault.tvl) : <Unavailable />}
          </span>
        </div>
        <div className="rail-stat">
          <span className="k">Share price</span>
          <span className="v tnum">
            {vault?.configured && vault?.sharePrice != null ? usd(vault.sharePrice) : <Unavailable />}
          </span>
        </div>
        <div className="rail-stat">
          <span className="k">Trailing APR</span>
          <span className="v tnum">
            <Unavailable />
          </span>
        </div>
      </div>

      <div className="rail-sec">
        <h4>OpLend</h4>
        <div className="rail-stat">
          <span className="k">Open markets</span>
          <span className="v tnum">{oplend?.loading ? '…' : open.length}</span>
        </div>
        <div className="rail-stat">
          <span className="k">Total positions</span>
          <span className="v tnum">{oplend?.loading ? '…' : (oplend?.markets || []).length}</span>
        </div>
        <div className="rail-stat">
          <span className="k">Creation fee</span>
          <span className="v tnum">0.0001 ETH</span>
        </div>
      </div>
    </aside>
  )
}
