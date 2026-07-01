import { ENV } from '../lib/env.js'
import {
  ERC20_ABI,
  PMFI_FACTORY_V22_ABI,
  PMFI_MARKETPLACE_V22_ABI,
  PMFI_VAULT_V22_ABI,
} from './abis.js'

// OpLend V2.2 config — ported from legacy oplend/src/config.js.
// Contract addresses and parameters are EXACT production values. The only change
// is BASE_RPC, which now reads from env (defaults to the OpLend production proxy).
export const CONFIG = Object.freeze({
  BASE_CHAIN_ID: 8453,
  BASE_CHAIN_HEX: '0x2105',
  FACTORY_DEPLOYMENT_BLOCK: 47499768,
  FACTORY_ADDRESS: '0xb2458426F7263B3Aec44ba6E3466bB4B5A175ccf',
  MARKETPLACE_ADDRESS: '0xcC3E1C18b58eE8Ec6550C60b75d820E4b45e2D2F',
  BASE_USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  CREATION_FEE_WEI: 100000000000000n,
  CREATION_FEE_ETH: '0.0001',
  SALE_FEE_BPS: 10n,
  EXPLORER_URL: 'https://basescan.org',
  BASE_RPC: ENV.oplendRpcUrl, // legacy default: https://oplend.pmfi.cc/rpc
  CONTRACTS: Object.freeze({
    factory: 'PMFIPositionFactoryV22',
    marketplace: 'PMFIPrimaryMarketplaceV22',
    vault: 'PMFIPositionVaultV22',
    legToken: 'PMFILegTokenV22',
  }),
  ABIS: Object.freeze({
    erc20: ERC20_ABI,
    factory: PMFI_FACTORY_V22_ABI,
    marketplace: PMFI_MARKETPLACE_V22_ABI,
    vault: PMFI_VAULT_V22_ABI,
  }),
})
