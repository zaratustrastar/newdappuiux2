import { useCallback, useEffect, useState } from 'react'
import { formatUnits } from 'ethers'
import { CONFIG } from './config.js'
import { factoryRead, marketplaceRead, vaultRead, erc20Read } from './contracts.js'
import { sanitizeError, nowSec } from '../lib/format.js'

const MAX_VAULT_READS = 4 // legacy concurrency

// Ported helpers (verbatim semantics).
export function saleTuple(s) {
  return {
    vault: s.vault ?? s[0],
    seller: s.seller ?? s[1],
    pToken: s.pToken ?? s[2],
    amountInitial: s.amountInitial ?? s[3],
    amountRemaining: s.amountRemaining ?? s[4],
    usdcTotal: s.usdcTotal ?? s[5],
    usdcRemaining: s.usdcRemaining ?? s[6],
    usdcRaisedToSeller: s.usdcRaisedToSeller ?? s[7],
    feeAccrued: s.feeAccrued ?? s[8],
    expiry: s.expiry ?? s[9],
    active: s.active ?? s[10],
  }
}
export function apr(investment, payoff, start, end) {
  return investment > 0 && payoff > investment && end > start
    ? ((payoff - investment) / investment) * (31536000 / (end - start)) * 100
    : 0
}
export function fillPct(m) {
  return m.initialCollateralAmount
    ? Number((m.funded * 10000n) / m.initialCollateralAmount) / 100
    : 0
}
export function estimatedApr(m) {
  return apr(
    Number(formatUnits(m.targetRaiseUsdc, 6)),
    Number(formatUnits(m.totalRepaymentUsdc, 6)),
    Number(m.fundingDeadline),
    Number(m.repaymentDeadline),
  )
}

async function mapLimit(items, limit, fn) {
  const out = []
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

async function loadVault(vaultAddress, account) {
  const f = factoryRead()
  if (!(await f.isVault(vaultAddress))) throw new Error('Unregistered vault')
  const v = vaultRead(vaultAddress)
  const [
    borrower, collateral, usdc, pToken, nToken, cDec, uDec,
    initialCollateralAmount, targetRaiseUsdc, totalRepaymentUsdc,
    fundingDeadline, repaymentDeadline, initialized, fundingClosed, settled,
    closedWithoutOutstandingP, pairedN, exercisedN, usdcPaid, accountedCollateral,
    collateralRefundClaim, repaymentRequiredUsdc, repaymentRemainingUsdc, canSettleEarly,
  ] = await Promise.all([
    v.borrower(), v.collateral(), v.usdc(), v.P(), v.N(), v.collateralDecimals(), v.usdcDecimals(),
    v.initialCollateralAmount(), v.targetRaiseUsdc(), v.totalRepaymentUsdc(),
    v.fundingDeadline(), v.repaymentDeadline(), v.initialized(), v.fundingClosed(), v.settled(),
    v.closedWithoutOutstandingP(), v.pairedN(), v.exercisedN(), v.usdcPaid(), v.accountedCollateral(),
    v.collateralRefundClaim(), v.repaymentRequiredUsdc(), v.repaymentRemainingUsdc(),
    v.canSettleEarly().catch(() => false),
  ])
  const c = erc20Read(collateral), p = erc20Read(pToken), n = erc20Read(nToken)
  const [symbol, name, pSupply, pBalance, nBalance] = await Promise.all([
    c.symbol().catch(() => 'TOKEN'),
    c.name().catch(() => 'Custom token'),
    p.totalSupply().catch(() => 0n),
    account ? p.balanceOf(account).catch(() => 0n) : Promise.resolve(0n),
    account ? n.balanceOf(account).catch(() => 0n) : Promise.resolve(0n),
  ])
  const saleIdPlusOne = await marketplaceRead().saleIdPlusOneByVault(vaultAddress).catch(() => 0n)
  const saleId = saleIdPlusOne > 0n ? saleIdPlusOne - 1n : null
  const sale = saleId !== null ? saleTuple(await marketplaceRead().sales(saleId)) : null
  let preview = { collateralOut: 0n, usdcOut: 0n }
  if (settled && pBalance > 0n) {
    try {
      const r = await v.previewRedeemP(pBalance)
      preview = { collateralOut: r[0], usdcOut: r[1] }
    } catch {
      /* ignore */
    }
  }
  const funded =
    initialCollateralAmount > 0n ? initialCollateralAmount - (sale?.amountRemaining || 0n) : 0n
  return {
    id: vaultAddress, vault: vaultAddress, borrower, collateral, usdc, pToken, nToken,
    token: symbol, name, decimals: Number(cDec), usdcDecimals: Number(uDec),
    initialCollateralAmount, targetRaiseUsdc, totalRepaymentUsdc, fundingDeadline, repaymentDeadline,
    initialized, fundingClosed, settled, closedWithoutOutstandingP, pairedN, exercisedN, usdcPaid,
    accountedCollateral, collateralRefundClaim, repaymentRequiredUsdc, repaymentRemainingUsdc,
    canSettleEarly, pSupply, pBalance, nBalance, saleId, sale, preview, funded,
  }
}

export function liveOpenMarkets(markets) {
  const t = BigInt(nowSec())
  return markets.filter(
    (m) => m.sale && m.sale.active && m.sale.amountRemaining > 0n && m.fundingDeadline > t && !m.fundingClosed && !m.settled,
  )
}

// Hook: load factory state + all positions. Real on-chain reads only.
export function useOplend(account) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    partialWarning: '',
    factoryState: null,
    markets: [],
  })

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null, partialWarning: '' }))
    try {
      const f = factoryRead()
      const [creationPaused, purchasesPaused, creationFee, minFunding, maxFunding, maxRepayment] =
        await Promise.all([
          f.creationPaused(), f.purchasesPaused(), f.CREATION_FEE(),
          f.MIN_FUNDING_PERIOD(), f.MAX_FUNDING_PERIOD(), f.MAX_REPAYMENT_PERIOD(),
        ])
      const factoryState = { creationPaused, purchasesPaused, creationFee, minFunding, maxFunding, maxRepayment }

      const len = Number(await f.allVaultsLength())
      const vaults = await Promise.all(Array.from({ length: len }, (_, i) => f.allVaults(i)))
      const settled = await mapLimit(vaults, MAX_VAULT_READS, async (addr) =>
        loadVault(addr, account).catch((error) => ({ error, vaultAddress: addr })),
      )
      const failures = settled.filter((x) => x?.error)
      const markets = settled.filter((x) => !x?.error)
      setState({
        loading: false,
        error: null,
        partialWarning: failures.length
          ? `${failures.length} position${failures.length === 1 ? '' : 's'} could not be loaded from the RPC.`
          : '',
        factoryState,
        markets,
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: sanitizeError(e), markets: [] }))
    }
  }, [account])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...state, refresh }
}
