import { useLocation } from 'wouter'
import { useWallet } from '../lib/wallet.jsx'
import { usd, fromShares, fromUnits, shortAddress } from '../lib/format.js'
import { liveOpenMarkets } from '../oplend/useOplend.js'
import { Panel, Stat, Tag, Unavailable, Empty, Coin } from '../components/ui.jsx'

export function Portfolio({ vault, oplend }) {
  const { connected, address } = useWallet()
  const [, navigate] = useLocation()

  const mine = (oplend?.markets || []).filter(
    (m) => (address && m.borrower?.toLowerCase() === address) || m.pBalance > 0n || m.nBalance > 0n,
  )
  const open = liveOpenMarkets(oplend?.markets || [])

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="eyebrow c-brand">02 / Overview</div>
          <h1>Portfolio</h1>
          <p className="lede">
            The capital layer for prediction markets. Your positions across the pARBITRAGE vault and
            OpLend, derived from your connected wallet's real on-chain state.
          </p>
        </div>
        <div className="head-aside">
          {connected ? (
            <Tag kind="ok">{shortAddress(address)}</Tag>
          ) : (
            <Tag>Wallet not connected</Tag>
          )}
        </div>
      </div>

      <div className="grid g-3" style={{ marginBottom: 24 }}>
        <Stat k="pARBITRAGE position" accent="cyan">
          {!connected ? (
            <Unavailable label="—" />
          ) : vault?.configured && vault?.userValueUsdc != null ? (
            usd(vault.userValueUsdc)
          ) : (
            <Unavailable label="—" />
          )}
        </Stat>
        <Stat k="OpLend positions" accent="violet">
          {!connected ? <Unavailable label="—" /> : oplend?.loading ? '…' : mine.length}
        </Stat>
        <Stat k="Net portfolio value" accent="brand" tag={<Tag>partial</Tag>}>
          <Unavailable />
        </Stat>
      </div>

      {!connected && (
        <div className="note" style={{ marginBottom: 24 }}>
          <span>
            <b>No net value is shown without a full valuation source.</b> The vault position is valued
            on-chain (shares × official PPS). OpLend P/N legs have no fiat oracle wired here, so a
            single combined net value is intentionally not fabricated. Connect a wallet to see the
            components you can value.
          </span>
        </div>
      )}

      {connected && (
        <div className="grid g-2" style={{ marginBottom: 24 }}>
          <Panel title="pARBITRAGE" aside={<Tag kind="ok">on-chain</Tag>}>
            {!vault?.configured ? (
              <Empty>pARB vault address not configured</Empty>
            ) : vault.userShares != null && vault.userShares > 0n ? (
              <div className="preview">
                <div className="prow">
                  <span className="pk">Shares</span>
                  <span className="pv">{fromShares(vault.userShares)} pARB</span>
                </div>
                <div className="prow">
                  <span className="pk">Value</span>
                  <span className="pv">{usd(vault.userValueUsdc)}</span>
                </div>
                <div className="prow">
                  <span className="pk">Open requests</span>
                  <span className="pv">{vault.requests.length}</span>
                </div>
              </div>
            ) : (
              <Empty>No vault position</Empty>
            )}
          </Panel>

          <Panel title="OpLend" aside={<Tag>{mine.length}</Tag>}>
            {oplend?.loading ? (
              <Empty><span className="spin" /> Loading…</Empty>
            ) : mine.length === 0 ? (
              <Empty>No OpLend positions</Empty>
            ) : (
              <table className="tbl">
                <tbody>
                  {mine.slice(0, 6).map((m) => (
                    <tr key={m.id}>
                      <td>
                        <span className="ticker">
                          <Coin sym={m.token} /> {m.token}
                        </span>
                      </td>
                      <td className="r">P {fromUnits(m.pBalance, 18)}</td>
                      <td className="r">N {fromUnits(m.nBalance, 18)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}

      <div className="qa">
        <button className="qa-card" data-p="vault" onClick={() => navigate('/vault')}>
          <span className="bgnum">01</span>
          <div className="qn">// CAPITAL</div>
          <h4>pARBITRAGE</h4>
          <p>Deposit USDC into the strategy vault. Async request / claim around the reporting cycle.</p>
          <div className="arrow">Enter vault →</div>
        </button>
        <button className="qa-card" data-p="borrow" onClick={() => navigate('/oplend')}>
          <span className="bgnum">02</span>
          <div className="qn">// CREDIT</div>
          <h4>Borrow</h4>
          <p>Lock allowlisted collateral and mint paired P/N legs to raise USDC on Base.</p>
          <div className="arrow">Open OpLend →</div>
        </button>
        <button className="qa-card" data-p="lend" onClick={() => navigate('/oplend')}>
          <span className="bgnum">03</span>
          <div className="qn">// YIELD</div>
          <h4>Lend</h4>
          <p>
            Fund open positions as a lender. {open.length} market{open.length === 1 ? '' : 's'} open
            now.
          </p>
          <div className="arrow">Fund a position →</div>
        </button>
      </div>
    </div>
  )
}
