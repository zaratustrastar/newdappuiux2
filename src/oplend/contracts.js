import { Contract, JsonRpcProvider } from 'ethers'
import { CONFIG } from './config.js'

// Ported from legacy oplend/src/contracts.js. Read provider keeps the batching
// tuning from production. ethers import switched from CDN to the npm package.
const READ_PROVIDER = new JsonRpcProvider(CONFIG.BASE_RPC, CONFIG.BASE_CHAIN_ID, {
  staticNetwork: true,
  batchMaxCount: 40,
  batchStallTime: 10,
  batchMaxSize: 100000,
})

export function fallbackProvider() {
  return READ_PROVIDER
}
export function readContract(address, abi, provider = fallbackProvider()) {
  return new Contract(address, abi, provider)
}
export function writeContract(address, abi, signer) {
  return new Contract(address, abi, signer)
}
export function explorerLink(value, type = 'address') {
  return `${CONFIG.EXPLORER_URL}/${type}/${value}`
}

// Typed factories
export const factoryRead = () =>
  readContract(CONFIG.FACTORY_ADDRESS, CONFIG.ABIS.factory)
export const marketplaceRead = () =>
  readContract(CONFIG.MARKETPLACE_ADDRESS, CONFIG.ABIS.marketplace)
export const vaultRead = (address) => readContract(address, CONFIG.ABIS.vault)
export const erc20Read = (address) => readContract(address, CONFIG.ABIS.erc20)
