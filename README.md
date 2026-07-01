# PMFI unified-app

One PMFI dApp unifying **pARBITRAGE** (strategy vault) and **OpLend** (V2.2 option
lending) behind a single shell, built from the approved prototype's visual spec.
React 18 + Vite 5 + ethers 6.13.5 + wouter. All contract logic is wired to the
existing production addresses, ABIs and flows — no mock buttons.

## Run locally

```bash
cd unified-app
npm install
cp .env.example .env   # optional — fill in to enable env-gated features
npm run dev            # http://localhost:5173
```

The app runs with **zero env**: OpLend is fully functional on Base mainnet (reads +
real transaction submission), and the vault shows honest empty states until you
supply the V2 address. Connect any Base-compatible injected wallet (Coinbase
Wallet / MetaMask). With `VITE_PRIVY_APP_ID` and the Privy bridge it uses the
production wallet path.

## What's real vs. honest-empty

**Real on-chain (no API needed):**
- OpLend: collateral allowlist + discovery, open markets, positions, funding
  progress, repayment amounts, deadlines, P/N balances — and all writes (borrow,
  fund, repay, settle, redeem, claims).
- Vault (when `VITE_ARB_VAULT_V2_ADDRESS` set): TVL, share price, your position,
  pending requests — and all writes (async deposit/redeem request, claim).

**Honest "Unavailable" until a source is configured** (see `ARCHITECTURE.md §7`):
- V2 vault address (`VITE_ARB_VAULT_V2_ADDRESS`)
- Vault trailing APR + venue spread data (`VITE_PARB_API_BASE` — same-origin VPS API)
- Privy wallet path (`VITE_PRIVY_APP_ID`)

Nothing fabricated is ever shown as live. Illustrative elements (the spread tape)
are labelled **Illustrative**; contract-derived data is never labelled illustrative.

## Builder Code

ERC-8021 attribution (`bc_uyxykegl`) is preserved and applied to every transaction
from both products at the provider layer. See `src/lib/builderCode.js`.

## Layout

```
src/
  lib/        wallet (Privy + injected), builderCode, chain, format, env
  vault/      pARBITRAGE: config, useVault (reads), vaultActions (txs), api
  oplend/     OpLend V2.2: config, abis, contracts, collateral, quotes,
              validation, useOplend (reads), oplendActions (txs)
  components/ Shell (header/tape/sysbar), Rail, ConnectButton, ui primitives
  routes/     Portfolio, Vault, OpLend (Borrow / Lend / Positions)
public/       abis/, token-logos/, collateral-list.json, farcaster.json
```

See **`ARCHITECTURE.md`** for the full screen/contract/flow/API mapping and the
list of missing-source values.

## Constraints honored

No invented contract methods or ABIs · transaction order unchanged · async FIFO
redemption preserved (not converted to instant) · no credentials committed (the
legacy Alchemy key is replaced by `VITE_BASE_RPC_URL`) · legacy/ left untouched ·
nothing deployed.
