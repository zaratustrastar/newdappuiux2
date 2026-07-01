# PMFI unified-app — architecture & integration map

This document is the mapping deliverable required by `CLAUDE.md` before code: every
screen and action, contract/ABI usage, transaction flow, API path, shared
functionality, and the proposed route/component architecture — plus an explicit
list of values that have **no confirmed live source** and are therefore rendered
as honest empty states rather than invented data.

The app is a real React 18 + Vite 5 build using **ethers v6.13.5** (matching the
legacy frontends) and **wouter** for routing. It is locally runnable
(`npm install && npm run dev`). The approved prototype is the visual spec; this is
the functional implementation.

---

## 1. Screens & actions

| Route | Screen | Real actions |
|-------|--------|--------------|
| `/` | **Portfolio** | Read-only overview derived from the connected wallet. Quick-links to vault / OpLend. No net value is fabricated. |
| `/vault` | **pARBITRAGE** | Deposit USDC (async request), Request redeem (async FIFO), Claim shares, Claim USDC. |
| `/oplend` → Borrow | **OpLend / Borrow** | Select allowlisted collateral, approve collateral, create position (mint P/N legs). |
| `/oplend` → Lend | **OpLend / Lend** | Select open market, approve USDC, fund (buy P sized to budget). |
| `/oplend` → Positions | **OpLend / Positions** | Repay in full, settle, redeem P, redeem P+N pair, settle & redeem P, claim collateral refund, cancel / close-expired sale. |

Shared shell on every screen: header (brand, nav, Base chain indicator, connect),
spread tape (illustrative), left position rail, system bar.

---

## 2. Contract & ABI map

### pARBITRAGE (`src/vault/`)
| Item | Value | Source |
|------|-------|--------|
| V1 vault (sign-NAV) | `0x17C27001929E75D1eBd5FdeE6E986EA5a91de0D1` | legacy `app-pmfi/main.js` (pinned default) |
| V2 vault (async) | **env `VITE_ARB_VAULT_V2_ADDRESS`** | injected via `window.PSNIPER_CONFIG` in prod — *not in repo* |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6dp) | legacy |
| V2 ABI | `public/abis/parb-vault-v2.json` | copied from `legacy/app-pmfi/abis/arb-vault-v2.json` |
| USDC ABI | `public/abis/usdc.json` | copied |

V2 methods used (verified present in the ABI — **no invented methods**):
`getVaultState()`, `balanceOf`, `requestDeposit(amount,receiver)`,
`requestRedeem(shares,receiver)`, `claimDeposit(id,receiver)`,
`claimRedeem(id,receiver)`, `getUserDepositRequests`, `getUserRedeemRequests`,
`getDepositRequest(id)`, `getRedeemRequest(id)`; events `DepositRequested`,
`RedeemRequested`. Status enum 0=Pending,1=Claimable,2=Claimed,3=Cancelled
(only 0/1 shown).

### OpLend V2.2 (`src/oplend/`)
| Contract | Address | Const |
|----------|---------|-------|
| PMFIPositionFactoryV22 | `0xb2458426F7263B3Aec44ba6E3466bB4B5A175ccf` | `CONFIG.FACTORY_ADDRESS` |
| PMFIPrimaryMarketplaceV22 | `0xcC3E1C18b58eE8Ec6550C60b75d820E4b45e2D2F` | `CONFIG.MARKETPLACE_ADDRESS` |
| PMFIPositionVaultV22 | per-position (from factory) | `CONFIG.ABIS.vault` |
| PMFILegTokenV22 | per-position P/N (ERC20) | `CONFIG.ABIS.erc20` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `CONFIG.BASE_USDC` |

ABIs: inline human-readable in `src/oplend/abis.js` (ported verbatim from legacy);
canonical JSON also vendored under `public/abis/PMFI*V22.abi.json`. Other params
ported exactly: `FACTORY_DEPLOYMENT_BLOCK 47499768`, `CREATION_FEE_WEI 1e14`
(0.0001 ETH), `SALE_FEE_BPS 10`.

---

## 3. Transaction flows (order preserved exactly)

**Vault deposit (async):** check allowance → approve USDC→V2 (gas 100k) →
`requestDeposit(amount,receiver)` (gas 250k) → parse `DepositRequested.requestId`
→ later `claimDeposit(id,receiver)` (gas 200k) once `CLAIMABLE`.

**Vault redeem (async FIFO):** `requestRedeem(shares18dp,receiver)` (gas 250k) →
parse `RedeemRequested.requestId` → later `claimRedeem(id,receiver)` (gas 200k)
once `CLAIMABLE` and the vault has liquidity. **Never instant.**

**OpLend borrow:** re-check `collateralAllowed(token)` → approve collateral→FACTORY
(if needed) → `createPosition(params, { value: CREATION_FEE_WEI })` →
parse `PositionCreated` → vault / pToken / nToken / saleId.
`params = {collateral, collateralAmount, targetRaiseUsdc, totalRepaymentUsdc,
fundingDeadline, repaymentDeadline, namePrefix, symbolPrefix}` with
`fundingDeadline = now + fundingSeconds`, `repaymentDeadline = fundingDeadline + repaymentSeconds`.

**OpLend lend:** binary-search P for USDC budget (`pAmountForBudget`) →
`quoteTotalPayment` → approve USDC→MARKETPLACE → re-quote →
`buy(saleId, pAmount, maxTotalPayment=quote[2])`.

**OpLend manage:** `cancel`, `closeExpired`, `claimCollateralRefund(account)`,
approve USDC→vault then `repayInFull`, `settle`, `redeemPair(min(p,n))`,
`redeemP(pBal)`, `settleAndRedeemP(pBal)`.

---

## 4. Backend / API paths

All pARBITRAGE price/NAV/positions endpoints are **same-origin on the VPS** in
production (`window.location.origin`). They don't exist in a local build:

| Path | Use | Local behavior |
|------|-----|----------------|
| `/api/arb-vault/nav` | trailing APR | `Unavailable` unless `VITE_PARB_API_BASE` set |
| `/api/arb-vault/positions` | venue spread pairs | spread tape falls back to **Illustrative** |

OpLend has no off-chain API: everything is read from chain via the OpLend RPC
proxy (`VITE_OPLEND_RPC_URL`, default `https://oplend.pmfi.cc/rpc`) or a public
Base RPC.

---

## 5. Shared functionality (`src/lib/`)

- **wallet.jsx** — one wallet layer: production Privy bridge (`window.pmfiPrivy`)
  when present, injected EIP-1193 fallback for local dev. Exposes address, chainId,
  signer, connect/disconnect/switch.
- **builderCode.js** — ERC-8021 attribution ported verbatim. `BUILDER_CODE
  "bc_uyxykegl"`, identical `DATA_SUFFIX` from both legacy mechanisms. Applied
  **once** at the provider via the EIP-1193 proxy (covers both modules; identical
  calldata to the per-module legacy wrappers, no double-append).
- **chain.js** — Base 8453 / `0x2105`, switch/add chain, explorer links.
- **format.js** — money / USDC / shares formatting, shared Web3 error parser.
- **env.js** — env access + `MISSING` flags driving honest empty states.

---

## 6. Route & component architecture

```
WalletProvider
└─ App  (.pmfi-app shell)
   ├─ Header / SpreadTape / SystemBar          (components/Shell.jsx)
   ├─ Rail                                       (components/Rail.jsx)
   └─ Switch
      ├─ /        Portfolio   (routes/Portfolio.jsx)
      ├─ /vault   Vault        (routes/Vault.jsx + vault/useVault, vaultActions, api)
      └─ /oplend  OpLend       (routes/OpLend.jsx → Borrow / Lend / Positions
                                + oplend/useOplend, collateral, oplendActions)
```

Product logic is isolated: `src/vault/*` (pARBITRAGE), `src/oplend/*` (OpLend).
Shared UI primitives in `src/components/ui.jsx`. All CSS scoped under `.pmfi-app`.

---

## 7. Values without a confirmed live source (honest empty states)

Per the brief, these are **never faked**. Each renders `Unavailable` / an empty
state and is documented here:

| Value | Why missing | How to enable |
|-------|-------------|---------------|
| V2 vault address | injected via `window.PSNIPER_CONFIG`, not in repo | set `VITE_ARB_VAULT_V2_ADDRESS` |
| Vault TVL / share price / position / requests | on-chain, but require the V2 address | set V2 address → become **real on-chain reads** |
| Vault trailing APR | off-chain figure from VPS NAV API | set `VITE_PARB_API_BASE` |
| Venue spread pairs | VPS positions API | set `VITE_PARB_API_BASE`; otherwise tape stays **Illustrative** |
| Privy wallet | bridge built separately in prod | set `VITE_PRIVY_APP_ID` + bundle bridge; else injected-wallet fallback |
| Net portfolio value | OpLend P/N legs have no fiat oracle wired here | intentionally not summed into one number |

OpLend (collateral allowlist, discovery, positions, funding progress, repayment
amounts, deadlines, claimable collateral) is **fully on-chain** and works locally
against Base mainnet with no API.

---

## 8. Deliberate deviations from legacy

- **Alchemy RPC key** in `legacy/app-pmfi/main.js` is a credential and is **not**
  re-committed. RPC reads use `VITE_BASE_RPC_URL` (public Base fallback).
- Builder code applied once at the provider layer instead of twice (per-module),
  producing identical on-chain calldata.
- ethers imports switched from CDN ESM to the npm package; addresses, ABIs,
  method names, argument order and gas limits are unchanged.
