import { useEffect, useMemo, useState } from 'react'
import { parseUnits, formatUnits } from 'ethers'
import { useWallet } from '../lib/wallet.jsx'
import { useOplend, liveOpenMarkets, fillPct, estimatedApr } from '../oplend/useOplend.js'
import { discoverAllowedCollateral } from '../oplend/collateral.js'
import { createPosition, fundPosition, managePosition } from '../oplend/oplendActions.js'
import { validateBorrowForm } from '../oplend/validation.js'
import { CONFIG } from '../oplend/config.js'
import { usd, fromUSDC, fromUnits, shortAddress, sanitizeError, formatDate } from '../lib/format.js'
import { explorerLink } from '../lib/chain.js'
import { Panel, Stat, Tag, Unavailable, TxStatus, Empty, Coin } from '../components/ui.jsx'

const SUBTABS = [
  { k: 'borrow', label: 'Borrow' },
  { k: 'lend', label: 'Lend' },
  { k: 'positions', label: 'Positions' },
]

export function OpLend() {
  const wallet = useWallet()
  const { address, connected } = wallet
  const oplend = useOplend(address)
  const [sub, setSub] = useState('lend')

  const open = liveOpenMarkets(oplend.markets)
  const mine = useMemo(
    () =>
      (oplend.markets || []).filter(
        (m) =>
          (address && m.borrower?.toLowerCase() === address) || m.pBalance > 0n || m.nBalance > 0n,
      ),
    [oplend.markets, address],
  )

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <div className="eyebrow c-violet">01 / Credit</div>
          <h1>OpLend</h1>
          <p className="lede">
            Borrow USDC against allowlisted collateral by minting paired P/N option legs, or fund open
            positions as a lender. All flows are on-chain on Base via the audited V2.2 contracts.
          </p>
        </div>
        <div className="head-aside">
          <Tag kind={oplend.factoryState?.creationPaused ? '' : 'ok'}>
            {oplend.factoryState?.creationPaused ? 'Creation paused' : 'Creation live'}
          </Tag>
        </div>
      </div>

      <div className="subtabs">
        {SUBTABS.map((t) => (
          <button key={t.k} className={sub === t.k ? 'on' : ''} onClick={() => setSub(t.k)}>
            {t.label}
            {t.k === 'lend' && <span className="ct">{open.length}</span>}
            {t.k === 'positions' && connected && <span className="ct">{mine.length}</span>}
          </button>
        ))}
      </div>

      {oplend.partialWarning && (
        <div className="note risk" style={{ marginBottom: 16 }}>
          <span>{oplend.partialWarning}</span>
        </div>
      )}
      {oplend.error && (
        <div className="note risk" style={{ marginBottom: 16 }}>
          <span>Read error: {oplend.error}</span>
        </div>
      )}

      {sub === 'borrow' && <Borrow wallet={wallet} oplend={oplend} />}
      {sub === 'lend' && <Lend wallet={wallet} oplend={oplend} open={open} />}
      {sub === 'positions' && <Positions wallet={wallet} oplend={oplend} mine={mine} />}
    </div>
  )
}

// ── BORROW ────────────────────────────────────────────────────────────────────
function Borrow({ wallet, oplend }) {
  const { connected, isBase, address, getSigner, switchNetwork } = wallet
  const [tokens, setTokens] = useState(null) // null=loading
  const [sel, setSel] = useState(null)
  const [form, setForm] = useState({
    lock: '',
    raise: '',
    repay: '',
    fundingHours: 24,
    repaymentDays: 180,
    name: 'PMFI Position',
    symbol: 'PMFI',
  })
  const [tx, setTx] = useState(null)
  const [errors, setErrors] = useState([])

  useEffect(() => {
    let alive = true
    setTokens(null)
    discoverAllowedCollateral(address)
      .then((t) => alive && setTokens(t))
      .catch(() => alive && setTokens([]))
    return () => {
      alive = false
    }
  }, [address])

  const token = sel
  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit() {
    setTx({ kind: 'info', message: 'Validating…' })
    try {
      if (!connected) throw new Error('Connect your wallet first')
      if (!token) throw new Error('Select an enabled collateral token')
      if (!isBase) {
        await switchNetwork()
        throw new Error('Switched to Base — confirm and retry')
      }
      const collateralAmount = parseUnits(String(form.lock || '0'), token.decimals)
      const targetRaise = parseUnits(String(form.raise || '0'), 6)
      const totalRepayment = parseUnits(String(form.repay || '0'), 6)
      const fundingSeconds = Math.round(Number(form.fundingHours || 24) * 3600)
      const repaymentSeconds = Math.round(Number(form.repaymentDays || 180) * 86400)
      const signer = await getSigner()
      const ethBalance = await wallet.browserProvider.getBalance(address).catch(() => 0n)

      const errs = validateBorrowForm({
        connected: true,
        wrongNetwork: !isBase,
        creationPaused: oplend.factoryState?.creationPaused,
        collateralAllowed: token.allowed,
        collateralIsUsdc: token.isUsdc,
        collateralAmount,
        targetRaise,
        totalRepayment,
        fundingSeconds,
        repaymentSeconds,
        namePrefix: form.name,
        symbolPrefix: form.symbol,
        decimals: token.decimals,
        balance: token.balance ?? 0n,
        ethBalance,
      })
      setErrors(errs)
      if (errs.length) {
        setTx(null)
        return
      }

      const res = await createPosition({
        signer,
        account: address,
        token,
        collateralAmount,
        targetRaiseUsdc: targetRaise,
        totalRepaymentUsdc: totalRepayment,
        fundingHours: form.fundingHours,
        repaymentDays: form.repaymentDays,
        namePrefix: form.name,
        symbolPrefix: form.symbol,
        onPhase: (m) => setTx({ kind: 'info', message: m }),
      })
      setTx({
        kind: 'success',
        message: `Position created — sale #${res.event?.saleId?.toString() ?? '?'}.`,
        hash: res.tx.hash,
      })
      oplend.refresh()
    } catch (e) {
      setTx({ kind: 'error', message: sanitizeError(e) })
    }
  }

  return (
    <div className="grid g-23">
      <Panel title="Collateral" aside={<Tag>on-chain allowlist</Tag>}>
        {tokens === null ? (
          <Empty>
            <span className="spin" /> Discovering allowlisted collateral…
          </Empty>
        ) : tokens.length === 0 ? (
          <Empty>No allowlisted collateral found on-chain</Empty>
        ) : (
          <div className="choice-grid">
            {tokens.map((t) => (
              <button
                key={t.address}
                className={`choice${sel?.address === t.address ? ' sel' : ''}`}
                onClick={() => setSel(t)}
              >
                <Coin src={t.logoURI} sym={t.symbol} />
                <span>
                  <span className="sym">{t.symbol}</span>
                  <span className="meta">
                    {t.balance > 0n ? `${fromUnits(t.balance, t.decimals)} held` : 'allowed'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Create position" className="action">
        <div className="action-b">
          <Field label="Lock collateral" suffix={token?.symbol || '—'}>
            <input value={form.lock} onChange={(e) => set('lock', clean(e))} placeholder="0.00" />
          </Field>
          <div className="grid g-2" style={{ marginTop: 12 }}>
            <Field label="Target raise" suffix="USDC">
              <input value={form.raise} onChange={(e) => set('raise', clean(e))} placeholder="0.00" />
            </Field>
            <Field label="Total repayment" suffix="USDC">
              <input value={form.repay} onChange={(e) => set('repay', clean(e))} placeholder="0.00" />
            </Field>
          </div>
          <div className="term-row" style={{ marginTop: 12 }}>
            <Field label="Funding window (hours)" small>
              <input
                value={form.fundingHours}
                onChange={(e) => set('fundingHours', e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </Field>
            <Field label="Repayment window (days)" small>
              <input
                value={form.repaymentDays}
                onChange={(e) => set('repaymentDays', e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </Field>
          </div>

          <div className="note risk" style={{ marginTop: 14 }}>
            <span>
              <b>Creation fee {CONFIG.CREATION_FEE_ETH} ETH.</b> Funding window 1h–30d, repayment
              1d–365d. Total repayment must exceed the target raise. Collateral must be enabled by the
              on-chain factory allowlist.
            </span>
          </div>

          {errors.length > 0 && (
            <div className="txstatus error" style={{ marginTop: 12 }}>
              {errors.join(' · ')}
            </div>
          )}

          <button
            className="btn btn-violet btn-block"
            style={{ marginTop: 14 }}
            disabled={!token}
            onClick={submit}
          >
            Approve & create position
          </button>
          <TxStatus status={tx} />
        </div>
      </Panel>
    </div>
  )
}

// ── LEND ────────────────────────────────────────────────────────────────────
function Lend({ wallet, oplend, open }) {
  const { connected, isBase, address, getSigner, switchNetwork } = wallet
  const [selId, setSelId] = useState(null)
  const [budget, setBudget] = useState('')
  const [tx, setTx] = useState(null)

  const market = open.find((m) => m.id === selId) || open[0]

  async function fund() {
    setTx({ kind: 'info', message: 'Preparing…' })
    try {
      if (!connected) throw new Error('Connect your wallet first')
      if (!market) throw new Error('No open market selected')
      if (!isBase) {
        await switchNetwork()
        throw new Error('Switched to Base — confirm and retry')
      }
      const signer = await getSigner()
      const budgetUsdc = parseUnits(String(budget || '0'), 6)
      const res = await fundPosition({
        signer,
        account: address,
        saleId: market.saleId,
        sale: market.sale,
        budgetUsdc,
        onPhase: (m) => setTx({ kind: 'info', message: m }),
      })
      setTx({
        kind: 'success',
        message: `Funded — bought ${fromUnits(res.pAmount, 18)} P for ${fromUSDC(res.totalPaid)} USDC.`,
        hash: res.tx.hash,
      })
      setBudget('')
      oplend.refresh()
    } catch (e) {
      setTx({ kind: 'error', message: sanitizeError(e) })
    }
  }

  if (oplend.loading) return <Empty><span className="spin" /> Loading open markets…</Empty>

  return (
    <div className="grid g-32">
      <Panel title="Open markets" aside={<Tag>{open.length} live</Tag>}>
        {open.length === 0 ? (
          <Empty>No open funding markets right now</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Collateral</th>
                <th className="r">Est. APR</th>
                <th className="r">Filled</th>
                <th className="r">Closes</th>
              </tr>
            </thead>
            <tbody>
              {open.map((m) => (
                <tr
                  key={m.id}
                  className={`click${(market?.id === m.id) ? ' sel' : ''}`}
                  onClick={() => setSelId(m.id)}
                >
                  <td>
                    <span className="ticker">
                      <Coin sym={m.token} /> {m.token}
                    </span>
                  </td>
                  <td className="r pos">{estimatedApr(m).toFixed(1)}%</td>
                  <td className="r">
                    <span className="fillbar">
                      <i style={{ width: `${Math.min(100, fillPct(m))}%` }} />
                    </span>{' '}
                    {fillPct(m).toFixed(0)}%
                  </td>
                  <td className="r">{formatDate(m.fundingDeadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Fund position" className="action">
        <div className="action-b">
          {!market ? (
            <Empty>Select a market</Empty>
          ) : (
            <>
              <div className="preview">
                <div className="prow">
                  <span className="pk">Collateral</span>
                  <span className="pv">{market.token}</span>
                </div>
                <div className="prow">
                  <span className="pk">Target raise</span>
                  <span className="pv">{usd(formatUnits(market.targetRaiseUsdc, 6))}</span>
                </div>
                <div className="prow">
                  <span className="pk">Total repayment</span>
                  <span className="pv">{usd(formatUnits(market.totalRepaymentUsdc, 6))}</span>
                </div>
                <div className="prow">
                  <span className="pk">Est. APR</span>
                  <span className="pv pos">{estimatedApr(market).toFixed(1)}%</span>
                </div>
                <div className="prow">
                  <span className="pk">P remaining</span>
                  <span className="pv">{fromUnits(market.sale.amountRemaining, 18)}</span>
                </div>
              </div>

              <div className="field" style={{ marginTop: 14 }}>
                <div className="frow">
                  <span className="flabel">Budget</span>
                  <span className="asset">
                    <Coin kind="usdc" sym="U" /> USDC
                  </span>
                </div>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ''))}
                />
              </div>
              <div className="note">
                <span>
                  Your budget is sized to the largest P amount it can buy at the current marketplace
                  price ({Number(CONFIG.SALE_FEE_BPS) / 100}% fee). You'll approve USDC, then buy.
                </span>
              </div>
              <button
                className="btn btn-green btn-block"
                style={{ marginTop: 14 }}
                disabled={!budget || Number(budget) <= 0}
                onClick={fund}
              >
                Approve & fund
              </button>
              <TxStatus status={tx} />
            </>
          )}
        </div>
      </Panel>
    </div>
  )
}

// ── POSITIONS ────────────────────────────────────────────────────────────────
function Positions({ wallet, oplend, mine }) {
  const { connected, isBase, address, getSigner, switchNetwork } = wallet
  const [tx, setTx] = useState({})

  async function act(m, action) {
    setTx((s) => ({ ...s, [m.id]: { kind: 'info', message: 'Preparing…' } }))
    try {
      if (!isBase) {
        await switchNetwork()
        throw new Error('Switched to Base — confirm and retry')
      }
      const signer = await getSigner()
      await managePosition({
        signer,
        account: address,
        action,
        vaultAddress: m.vault,
        m,
        onPhase: (msg) => setTx((s) => ({ ...s, [m.id]: { kind: 'info', message: msg } })),
      })
      setTx((s) => ({ ...s, [m.id]: { kind: 'success', message: 'Done.' } }))
      oplend.refresh()
    } catch (e) {
      setTx((s) => ({ ...s, [m.id]: { kind: 'error', message: sanitizeError(e) } }))
    }
  }

  if (!connected) return <Empty>Connect a wallet to view your OpLend positions</Empty>
  if (oplend.loading) return <Empty><span className="spin" /> Loading positions…</Empty>
  if (mine.length === 0) return <Empty>You have no OpLend positions (as borrower or P/N holder)</Empty>

  return (
    <div className="grid" style={{ gap: 16 }}>
      {mine.map((m) => {
        const isBorrower = address && m.borrower?.toLowerCase() === address
        const actions = availableActions(m, isBorrower)
        return (
          <Panel
            key={m.id}
            title={
              <span className="ticker">
                <Coin sym={m.token} /> {m.token} ·{' '}
                <a href={explorerLink(m.vault, 'address')} target="_blank" rel="noreferrer">
                  {shortAddress(m.vault)}
                </a>
              </span>
            }
            aside={<Tag kind={m.settled ? 'ok' : m.fundingClosed ? '' : 'live'}>{statusOf(m)}</Tag>}
          >
            <div className="grid g-4" style={{ marginBottom: 14 }}>
              <Stat k="Target raise">{usd(formatUnits(m.targetRaiseUsdc, 6))}</Stat>
              <Stat k="Repayment required">{usd(formatUnits(m.repaymentRequiredUsdc, 6))}</Stat>
              <Stat k="Your P">{fromUnits(m.pBalance, 18)}</Stat>
              <Stat k="Your N">{fromUnits(m.nBalance, 18)}</Stat>
            </div>
            <div className="preview" style={{ marginBottom: 12 }}>
              <div className="prow">
                <span className="pk">Funding deadline</span>
                <span className="pv">{formatDate(m.fundingDeadline)}</span>
              </div>
              <div className="prow">
                <span className="pk">Repayment deadline</span>
                <span className="pv">{formatDate(m.repaymentDeadline)}</span>
              </div>
              <div className="prow">
                <span className="pk">Collateral refund claimable</span>
                <span className="pv">
                  {m.collateralRefundClaim > 0n
                    ? fromUnits(m.collateralRefundClaim, m.decimals)
                    : '—'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actions.length === 0 ? (
                <span className="skeleton">No actions available in current state</span>
              ) : (
                actions.map((a) => (
                  <button key={a.action} className="btn btn-sm" onClick={() => act(m, a.action)}>
                    {a.label}
                  </button>
                ))
              )}
            </div>
            <TxStatus status={tx[m.id]} />
          </Panel>
        )
      })}
    </div>
  )
}

// Derive which real contract actions are applicable from on-chain flags.
function availableActions(m, isBorrower) {
  const a = []
  if (m.settled) {
    if (m.pBalance > 0n) a.push({ action: 'redeemP', label: 'Redeem P' })
  } else {
    if (m.pBalance > 0n && m.nBalance > 0n) a.push({ action: 'redeemPair', label: 'Redeem P+N pair' })
    if (isBorrower && m.fundingClosed && m.repaymentRequiredUsdc > 0n)
      a.push({ action: 'repay', label: 'Repay in full' })
    if (isBorrower && m.canSettleEarly) a.push({ action: 'settle', label: 'Settle' })
    if (m.pBalance > 0n && m.canSettleEarly) a.push({ action: 'settleRedeem', label: 'Settle & redeem P' })
  }
  if (isBorrower && m.collateralRefundClaim > 0n)
    a.push({ action: 'claimRefund', label: 'Claim collateral refund' })
  return a
}
function statusOf(m) {
  if (m.settled) return 'Settled'
  if (m.fundingClosed) return 'Funding closed'
  return 'Funding'
}

function clean(e) {
  return e.target.value.replace(/[^0-9.]/g, '')
}
function Field({ label, suffix, small, children }) {
  return (
    <div className="field">
      <div className="frow">
        <span className="flabel">{label}</span>
        {suffix && <span className="asset">{suffix}</span>}
      </div>
      <div style={small ? { fontSize: 16 } : undefined}>{children}</div>
    </div>
  )
}
