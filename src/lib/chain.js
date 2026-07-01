// Base Mainnet handling — values ported from legacy (8453 / 0x2105).
export const BASE_MAINNET_CHAIN_ID = 8453
export const BASE_CHAIN_HEX = '0x2105'
export const EXPLORER_URL = 'https://basescan.org'

export function explorerLink(value, type = 'tx') {
  return `${EXPLORER_URL}/${type}/${value}`
}

// Mirrors legacy switchToBase(): try switch, then add-chain on 4902.
export async function switchToBase(provider) {
  if (!provider?.request) throw new Error('No wallet provider')
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_CHAIN_HEX }],
    })
  } catch (err) {
    if (err?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: BASE_CHAIN_HEX,
            chainName: 'Base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: [EXPLORER_URL],
          },
        ],
      })
    } else {
      throw err
    }
  }
}

export async function currentChainId(provider) {
  const hex = await provider.request({ method: 'eth_chainId' })
  return parseInt(hex, 16)
}

export async function isOnBase(provider) {
  try {
    return (await currentChainId(provider)) === BASE_MAINNET_CHAIN_ID
  } catch {
    return false
  }
}
