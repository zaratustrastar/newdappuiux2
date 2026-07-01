import { Interface } from 'ethers'
import { CONFIG } from './config.js'
import { writeContract } from './contracts.js'
import { pAmountForBudget } from './quotes.js'
import { sanitizeError, nowSec, secondsFromDays } from '../lib/format.js'

// Real OpLend V2.2 transactions. Method names, argument order, the ETH creation
// fee, approve→action sequencing and the param struct are ported VERBATIM from
// legacy oplend/src/main.js. Builder-code is applied at the provider layer.

const factoryWrite = (signer) => writeContract(CONFIG.FACTORY_ADDRESS, CONFIG.ABIS.factory, signer)
const marketplaceWrite = (signer) =>
  writeContract(CONFIG.MARKETPLACE_ADDRESS, CONFIG.ABIS.marketplace, signer)
const vaultWrite = (address, signer) => writeContract(address, CONFIG.ABIS.vault, signer)
const erc20Write = (address, signer) => writeContract(address, CONFIG.ABIS.erc20, signer)

async function send(label, txFn, onPhase) {
  onPhase?.(`${label} — confirm in your wallet…`)
  const tx = await txFn()
  onPhase?.(`${label} — submitted ${tx.hash}. Awaiting confirmation…`)
  const receipt = await tx.wait()
  return { tx, receipt }
}

const FACTORY_IFACE = new Interface(CONFIG.ABIS.factory)
function parsePositionCreated(receipt) {
  for (const log of receipt.logs) {
    try {
      const parsed = FACTORY_IFACE.parseLog(log)
      if (parsed?.name === 'PositionCreated') {
        return {
          vault: parsed.args.vault,
          pToken: parsed.args.pToken,
          nToken: parsed.args.nToken,
          saleId: parsed.args.saleId,
        }
      }
    } catch {
      /* not our event */
    }
  }
  return null
}

// --- BORROW: approve collateral → createPosition (with ETH creation fee) ------
export async function createPosition({
  signer,
  account,
  token, // { address, decimals, balance, isUsdc, allowed }
  collateralAmount, // bigint, token.decimals
  targetRaiseUsdc, // bigint, 6dp
  totalRepaymentUsdc, // bigint, 6dp
  fundingHours,
  repaymentDays,
  namePrefix,
  symbolPrefix,
  onPhase,
}) {
  // Re-check the live on-chain allowlist before sending (legacy behavior).
  const liveAllowed = await factoryWrite(signer).collateralAllowed(token.address).catch(() => false)
  if (!liveAllowed) throw new Error('That collateral is no longer enabled by the onchain factory allowlist.')

  const collateral = erc20Write(token.address, signer)
  const allowance = await collateral.allowance(account, CONFIG.FACTORY_ADDRESS)
  if (allowance < collateralAmount) {
    await send('Approve collateral', () => collateral.approve(CONFIG.FACTORY_ADDRESS, collateralAmount), onPhase)
    const reread = await collateral.allowance(account, CONFIG.FACTORY_ADDRESS)
    if (reread < collateralAmount) throw new Error('Approval was not sufficient after confirmation.')
  }

  const fundingSeconds = Math.round(Number(fundingHours || 24) * 3600)
  const repaymentSeconds = secondsFromDays(repaymentDays || 180)
  const fundingDeadline = BigInt(nowSec() + fundingSeconds)
  const repaymentDeadline = fundingDeadline + BigInt(repaymentSeconds)

  const params = {
    collateral: token.address,
    collateralAmount,
    targetRaiseUsdc,
    totalRepaymentUsdc,
    fundingDeadline,
    repaymentDeadline,
    namePrefix,
    symbolPrefix,
  }
  const { tx, receipt } = await send(
    'Create position',
    () => factoryWrite(signer).createPosition(params, { value: CONFIG.CREATION_FEE_WEI }),
    onPhase,
  )
  return { tx, receipt, event: parsePositionCreated(receipt) }
}

// --- LEND: size pAmount to budget → approve USDC → buy --------------------------
export async function fundPosition({ signer, account, saleId, sale, budgetUsdc, onPhase }) {
  const mp = marketplaceWrite(signer)
  // Binary-search the P amount affordable for the USDC budget (ported quotes.js).
  const pAmount = await pAmountForBudget({
    high: sale.amountRemaining,
    budget: budgetUsdc,
    quoteTotalPayment: async (p) => (await mp.quoteTotalPayment(saleId, p))[2],
  })
  if (pAmount <= 0n) throw new Error('Budget too small to buy any P at the current price.')

  let quote = await mp.quoteTotalPayment(saleId, pAmount)
  const usdc = erc20Write(CONFIG.BASE_USDC, signer)
  const allowance = await usdc.allowance(account, CONFIG.MARKETPLACE_ADDRESS)
  if (allowance < quote[2]) {
    await send('Approve USDC', () => usdc.approve(CONFIG.MARKETPLACE_ADDRESS, quote[2]), onPhase)
  }
  quote = await mp.quoteTotalPayment(saleId, pAmount) // re-quote after approval (legacy)
  const res = await send('Fund position', () => mp.buy(saleId, pAmount, quote[2]), onPhase)
  return { ...res, pAmount, totalPaid: quote[2] }
}

// --- MANAGE: exact actions from legacy actOnPosition() -------------------------
export async function managePosition({ signer, account, action, vaultAddress, m, onPhase }) {
  const v = vaultWrite(vaultAddress, signer)
  if (action === 'cancel') return send('Cancel sale', () => marketplaceWrite(signer).cancel(m.saleId), onPhase)
  if (action === 'closeExpired')
    return send('Close expired sale', () => marketplaceWrite(signer).closeExpired(m.saleId), onPhase)
  if (action === 'claimRefund')
    return send('Claim collateral refund', () => v.claimCollateralRefund(account), onPhase)
  if (action === 'repay') {
    const needed = m.repaymentRequiredUsdc
    const usdc = erc20Write(CONFIG.BASE_USDC, signer)
    if ((await usdc.allowance(account, vaultAddress)) < needed) {
      await send('Approve repayment USDC', () => usdc.approve(vaultAddress, needed), onPhase)
    }
    return send('Repay in full', () => v.repayInFull(), onPhase)
  }
  if (action === 'settle') return send('Settle position', () => v.settle(), onPhase)
  if (action === 'redeemPair')
    return send('Redeem matching P and N', () => v.redeemPair(m.pBalance < m.nBalance ? m.pBalance : m.nBalance), onPhase)
  if (action === 'redeemP') return send('Redeem P', () => v.redeemP(m.pBalance), onPhase)
  if (action === 'settleRedeem') return send('Settle and redeem P', () => v.settleAndRedeemP(m.pBalance), onPhase)
  throw new Error(`Unknown action: ${action}`)
}

export { sanitizeError }
