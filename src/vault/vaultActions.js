import { Contract, parseUnits } from 'ethers'
import { VAULT, loadVaultAbis } from './config.js'
import { parseWeb3Error } from '../lib/format.js'

// Real pARBITRAGE V2 transactions. Method names, argument order, gas limits and
// the async request→claim model are ported VERBATIM from legacy app-pmfi/main.js.
// Builder-code attribution is applied at the provider layer (lib/wallet.jsx).
//
// IMPORTANT: this is an asynchronous FIFO request/claim flow. It is NOT an
// instant withdrawal — redemptions become claimable only after the vault's next
// report (and available liquidity). Do not "simplify" into an instant path.

function v2(signer, abi) {
  return new Contract(VAULT.v2Address, abi, signer)
}
function usdc(signer, abi) {
  return new Contract(VAULT.usdc, abi, signer)
}

export async function vaultDeposit({ signer, owner, amountStr, onPhase }) {
  if (!VAULT.v2Address) throw new Error('pARB vault not configured')
  if (Number(amountStr) < VAULT.minDepositUsdc) {
    throw new Error(`Minimum deposit is $${VAULT.minDepositUsdc} USDC`)
  }
  const { v2Abi, usdcAbi } = await loadVaultAbis()
  const amount = parseUnits(String(amountStr), VAULT.usdcDecimals)

  onPhase?.('Checking allowance…')
  const u = usdc(signer, usdcAbi)
  const allowance = await u.allowance(owner, VAULT.v2Address)
  if (allowance < amount) {
    onPhase?.('Approving USDC…')
    const approveTx = await u.approve(VAULT.v2Address, amount, { gasLimit: 100000 })
    onPhase?.('Waiting for approval…')
    await approveTx.wait()
  }

  onPhase?.('Submitting deposit request…')
  const c = v2(signer, v2Abi)
  const tx = await c.requestDeposit(amount, owner, { gasLimit: 250000 })
  onPhase?.('Confirming…')
  const receipt = await tx.wait()

  let requestId = null
  for (const log of receipt.logs) {
    try {
      const parsed = c.interface.parseLog(log)
      if (parsed?.name === 'DepositRequested') requestId = parsed.args.requestId.toString()
    } catch {
      /* not our event */
    }
  }
  return {
    requestId,
    message:
      requestId !== null
        ? `Deposit request #${requestId} submitted for ${amountStr} USDC. Shares are issued after the next report (~1 hour).`
        : `Deposit request submitted for ${amountStr} USDC. Shares are issued after the next report.`,
  }
}

export async function vaultRequestRedeem({ signer, owner, sharesStr, onPhase }) {
  if (!VAULT.v2Address) throw new Error('pARB vault not configured')
  const { v2Abi } = await loadVaultAbis()
  const shareAmount = parseUnits(String(sharesStr), VAULT.shareDecimals)

  onPhase?.('Submitting redeem request…')
  const c = v2(signer, v2Abi)
  const tx = await c.requestRedeem(shareAmount, owner, { gasLimit: 250000 })
  onPhase?.('Confirming…')
  const receipt = await tx.wait()

  let requestId = null
  for (const log of receipt.logs) {
    try {
      const parsed = c.interface.parseLog(log)
      if (parsed?.name === 'RedeemRequested') requestId = parsed.args.requestId.toString()
    } catch {
      /* not our event */
    }
  }
  return {
    requestId,
    message:
      requestId !== null
        ? `Redeem request #${requestId} submitted for ${sharesStr} pARB. USDC claimable after the next report when the vault has liquidity.`
        : `Redeem request submitted. USDC claimable after the next report when the vault has liquidity.`,
  }
}

export async function vaultClaimDeposit({ signer, owner, requestId, onPhase }) {
  const { v2Abi } = await loadVaultAbis()
  onPhase?.('Claiming shares…')
  const tx = await v2(signer, v2Abi).claimDeposit(BigInt(requestId), owner, { gasLimit: 200000 })
  await tx.wait()
  return { message: 'Shares claimed.' }
}

export async function vaultClaimRedeem({ signer, owner, requestId, onPhase }) {
  const { v2Abi } = await loadVaultAbis()
  onPhase?.('Claiming USDC…')
  const tx = await v2(signer, v2Abi).claimRedeem(BigInt(requestId), owner, { gasLimit: 200000 })
  await tx.wait()
  return { message: 'USDC received.' }
}

export { parseWeb3Error }
