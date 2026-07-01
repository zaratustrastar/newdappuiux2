import { useEffect, useState } from 'react'
import { Contract, JsonRpcProvider } from 'ethers'
import { useWallet } from '../lib/wallet.jsx'
import { useVaultStats } from '../vault/useVault.js'
import { VAULT, loadVaultAbis } from '../vault/config.js'
import {
  vaultDeposit,
  vaultRequestRedeem,
  vaultClaimDeposit,
  vaultClaimRedeem,
  parseWeb3Error,
} from '../vault/vaultActions.js'
import { fetchNav } from '../vault/api.js'
import { usd, fromUSDC, fromShares } from '../lib/format.js'
import { Panel, Stat, Tag, Unavailable, TxStatus, Empty, Coin } from '../components/ui.jsx'

function useUsdcBalance(address) {
  const [bal, setBal] = useState(null)
  useEffect(() => {
    if (!address) {
      setBal(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { usdcAbi } = await loadVaultAbis()
        const p = new JsonRpcProvider(VAULT.rpcUrl, 8453, { staticNetwork: true })
        const c = new Contract(VAULT.usdc, usdcAbi, p)
        const b = await c.balanceOf(address)
        if (alive) setBal(b)
      } catch {
        if (alive) setBal(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [address])
  return bal
}

export function Vault() {
  const { connected, isBase, address, getSigner, switchNetwork } = useWallet()
  const stats = useVaultStats(address)
  const usdcBal = useUsdcBalance(address)
  const [side, setSide] = useState('in') // in = deposit, out = redeem
  const [amount, setAmount] = useState('')
  const [tx, setTx] = useState(null)
  const [apr, setApr] = useState(undefined) // undefined=loading, null=unavailable

  useEffect(() => {
    fetchNav().then((res) => {
      if (res.available && res.data?.apr != null) setApr(Number(res.data.apr))
      else setApr(null)
    })
  }, [])

  async function ensureReady() {
    if (!connected) throw new Error('Connect your wallet first')
    if (!isBase) {
      await switchNetwork()
      throw new Error('Switched to Base — confirm and retry')
    }
    const signer = await getSigner()
    if (!signer) throw new Error('No signer available')
    return signer
  }

  async function runDeposit() {
    setTx({ kind: 'info', message: 'Preparing…' })
    try {
      const signer = await ensureReady()
      const res = await vaultDeposit({
        signer,
        owner: address,
        amountStr: amount,
        onPhase: (m) => setTx({ kind: 'info', message: m }),
      })
      setTx({ kind: 'success', message: res.message })
      setAmount('')
      stats.refresh()
    } catch (e) {
      setTx({ kind: 'error', message: parseWeb3Error(e) })
    }
  }

  async function runRedeem() {
    setTx({ kind: 'info', message: 'Preparing…' })
    try {
      const signer = await ensureReady()
      const res = await vaultRequestRedeem({
        signer,
        owner: address,
        sharesStr: amount,
        onPhase: (m) => setTx({ kind: 'info', message: m }),
      })
      setTx({ kind: 'success', message: res.message })
      setAmount('')
      stats.refresh()
    } catch (e) {
      setTx({ kind: 'error', message: parseWeb3Error(e) })
    }
  }

  async function claim(req) {
    setTx({ kind: 'info', message: 'Preparing…' })
    try {
      const signer = await ensureReady()
      const fn = req.kind === 'deposit' ? vaultClaimDeposit : vaultClaimRedeem
      const res = await fn({
        signer,
        owner: address,
        requestId: req.id,
        onPhase: (m) => setTx({ kind: 'info', message: m }),
      })
      setTx({ kind: 'success', message: res.message })
      stats.refresh()
    } catch (e) {
      setTx({ kind: 'error', message: parseWeb3Error(e) })
    }
  }

  const notConfigured = !stats.configured

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="eyebrow c-cyan">00 / Capital</div>
          <h1>pARBITRAGE Vault</h1>
          <p className="lede">
            A strategy vault that runs conservative, NAV-priced positions across prediction-market
            venues. Deposits and redemptions settle asynchronously around the vault's reporting cycle.
          </p>
        </div>
        <div className="head-aside">
          <Tag kind="illus">Spreads illustrative</Tag>
          {stats.paused ? <Tag>Paused</Tag> : null}
        </div>
      </div>

      {notConfigured && (
        <div className="note risk" style={{ marginBottom: 16 }}>
          <span>
            <b>pARB vault address not configured.</b> Set{' '}
            <code>VITE_ARB_VAULT_V2_ADDRESS</code> to enable on-chain reads and transactions; panels
            show honest empty states until then.
          </span>
        </div>
      )}

      <div className="grid g-32">
        <Panel
          title="Async request / claim"
          aside={<Tag kind="ok">FIFO redemption</Tag>}
          className="action"
        >
          <div className="action-tabs">
            <button data-side="in" className={side === 'in' ? 'on' : ''} onClick={() => setSide('in')}>
              Deposit USDC
            </button>
            <button data-side="out" className={side === 'out' ? 'on' : ''} onClick={() => setSide('out')}>
              Request redeem
            </button>
          </div>
          <div className="action-b">
            <div className="field">
              <div className="frow">
                <span className="flabel">{side === 'in' ? 'Deposit amount' : 'Redeem shares'}</span>
                <span className="asset">
                  {side === 'in' ? (
                    <>
                      <Coin kind="usdc" sym="U" /> USDC
                    </>
                  ) : (
                    <>
                      <Coin kind="parb" sym="p" /> pARB
                    </>
                  )}
                </span>
              </div>
              <input
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              />
              <div className="bal">
                {side === 'in' ? (
                  <>
                    Wallet:{' '}
                    {usdcBal != null ? (
                      <b onClick={() => setAmount(fromUSDC(usdcBal))}>{fromUSDC(usdcBal)} USDC</b>
                    ) : connected ? (
                      <Unavailable label="—" />
                    ) : (
                      '—'
                    )}{' '}
                    · min ${VAULT.minDepositUsdc}
                  </>
                ) : (
                  <>
                    Holdings:{' '}
                    {stats.userShares != null ? (
                      <b onClick={() => setAmount(fromShares(stats.userShares, 6))}>
                        {fromShares(stats.userShares)} pARB
                      </b>
                    ) : (
                      '—'
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="note">
              <span>
                {side === 'in' ? (
                  <>
                    <b>Deposits are asynchronous.</b> You submit a request now; shares are issued after
                    the vault's next report (~1 hour), then claimed below.
                  </>
                ) : (
                  <>
                    <b>Redemptions are asynchronous (FIFO).</b> You submit a redeem request; USDC
                    becomes claimable after the next report when the vault has liquidity. This is not an
                    instant withdrawal.
                  </>
                )}
              </span>
            </div>

            <button
              className={`btn btn-block ${side === 'in' ? 'btn-cyan' : 'btn-amber'}`}
              style={{ marginTop: 14 }}
              disabled={notConfigured || !amount || Number(amount) <= 0}
              onClick={side === 'in' ? runDeposit : runRedeem}
            >
              {side === 'in' ? 'Submit deposit request' : 'Submit redeem request'}
            </button>
            <TxStatus status={tx} />
          </div>
        </Panel>

        <Panel title="Active requests" aside={<Tag>{stats.requests.length}</Tag>}>
          {!connected ? (
            <Empty>Connect a wallet to view pending requests</Empty>
          ) : notConfigured ? (
            <Empty>Vault not configured</Empty>
          ) : stats.requests.length === 0 ? (
            <Empty>No active deposit or redeem requests</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Status</th>
                  <th className="r">Detail</th>
                  <th className="r">Action</th>
                </tr>
              </thead>
              <tbody>
                {stats.requests.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>{r.kind === 'deposit' ? `Deposit #${r.id}` : `Redeem #${r.id}`}</td>
                    <td>
                      <span className={`st-dot ${r.claimable ? 'active' : 'pending'}`}>{r.statusLabel}</span>
                    </td>
                    <td className="r">
                      {r.kind === 'deposit'
                        ? `$${r.primary} → ~${r.secondary} pARB`
                        : `${r.primary} pARB → ~$${r.secondary}`}
                    </td>
                    <td className="r">
                      {r.claimable ? (
                        <button className="btn btn-sm btn-primary" onClick={() => claim(r)}>
                          {r.kind === 'deposit' ? 'Claim shares' : 'Claim USDC'}
                        </button>
                      ) : (
                        <span className="skeleton">awaiting report</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="grid g-4" style={{ marginTop: 16 }}>
        <Stat k="TVL" accent="cyan">
          {stats.loading ? '…' : stats.tvl != null ? usd(stats.tvl) : <Unavailable />}
        </Stat>
        <Stat k="Share price" accent="cyan">
          {stats.loading ? '…' : stats.sharePrice != null ? usd(stats.sharePrice) : <Unavailable />}
        </Stat>
        <Stat k="Trailing APR" tag={<Tag>off-chain</Tag>}>
          {apr === undefined ? '…' : apr != null ? `${apr.toFixed(1)}%` : <Unavailable />}
        </Stat>
        <Stat k="Your position" accent="brand">
          {!connected ? (
            <Unavailable label="—" />
          ) : stats.userValueUsdc != null ? (
            usd(stats.userValueUsdc)
          ) : (
            <Unavailable label="—" />
          )}
        </Stat>
      </div>
    </div>
  )
}
