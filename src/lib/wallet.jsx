import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { BrowserProvider } from 'ethers'
import { withBuilderCode } from './builderCode.js'
import { BASE_MAINNET_CHAIN_ID, isOnBase, switchToBase, currentChainId } from './chain.js'

// One wallet layer for both products.
// - Production: window.pmfiPrivy bridge (connect()/logout() → { ethereumProvider, address }).
// - Local dev: injected EIP-1193 wallet (window.ethereum).
// Builder-code attribution is applied ONCE here, on the raw provider, via the
// ERC-8021 proxy — covering every tx from both modules. (Identical calldata to
// the legacy per-module wrappers; applying once avoids double-append.)

const WalletCtx = createContext(null)

function getInjected() {
  return typeof window !== 'undefined' ? window.ethereum : null
}
function getPrivyBridge() {
  return typeof window !== 'undefined' ? window.pmfiPrivy : null
}

export function WalletProvider({ children }) {
  const [rawProvider, setRawProvider] = useState(null)
  const [address, setAddress] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  const apply = useCallback(async (eip1193, addr) => {
    const provider = withBuilderCode(eip1193)
    const bp = new BrowserProvider(provider)
    const account = addr || (await provider.request({ method: 'eth_requestAccounts' }))?.[0]
    setRawProvider(provider)
    setAddress(account ? account.toLowerCase() : null)
    try {
      setChainId(await currentChainId(provider))
    } catch {
      setChainId(null)
    }
    return { provider, bp, account }
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    try {
      const bridge = getPrivyBridge()
      if (bridge && typeof bridge.connect === 'function') {
        const result = await bridge.connect()
        if (!result?.ethereumProvider) throw new Error('Privy did not return an Ethereum provider.')
        await apply(result.ethereumProvider, result.address)
      } else {
        const injected = getInjected()
        if (!injected) {
          throw new Error('No wallet found. Install a Base-compatible wallet (e.g. Coinbase Wallet / MetaMask), or configure VITE_PRIVY_APP_ID.')
        }
        await apply(injected)
      }
    } catch (e) {
      setError(e?.message || 'Wallet connection failed')
      throw e
    } finally {
      setConnecting(false)
    }
  }, [apply])

  const disconnect = useCallback(async () => {
    const bridge = getPrivyBridge()
    try {
      if (bridge && typeof bridge.logout === 'function') await bridge.logout()
    } catch {
      /* ignore */
    }
    setRawProvider(null)
    setAddress(null)
    setChainId(null)
  }, [])

  const switchNetwork = useCallback(async () => {
    if (!rawProvider) return
    await switchToBase(rawProvider)
    setChainId(await currentChainId(rawProvider))
  }, [rawProvider])

  // Track chain/account changes from injected wallets.
  useEffect(() => {
    const injected = getInjected()
    if (!injected?.on) return
    const onChain = (hex) => setChainId(parseInt(hex, 16))
    const onAccts = (accts) => setAddress(accts?.[0] ? accts[0].toLowerCase() : null)
    injected.on('chainChanged', onChain)
    injected.on('accountsChanged', onAccts)
    return () => {
      injected.removeListener?.('chainChanged', onChain)
      injected.removeListener?.('accountsChanged', onAccts)
    }
  }, [])

  // Privy logout event (production bridge).
  useEffect(() => {
    const handler = () => {
      setRawProvider(null)
      setAddress(null)
      setChainId(null)
    }
    window.addEventListener('pmfiPrivyLoggedOut', handler)
    return () => window.removeEventListener('pmfiPrivyLoggedOut', handler)
  }, [])

  const value = useMemo(() => {
    const browserProvider = rawProvider ? new BrowserProvider(rawProvider) : null
    return {
      address,
      chainId,
      connecting,
      error,
      connected: Boolean(address),
      isBase: chainId === BASE_MAINNET_CHAIN_ID,
      rawProvider,
      browserProvider,
      async getSigner() {
        if (!browserProvider || !address) return null
        return browserProvider.getSigner(address)
      },
      connect,
      disconnect,
      switchNetwork,
    }
  }, [address, chainId, connecting, error, rawProvider, connect, disconnect, switchNetwork])

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletCtx)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}

export { isOnBase }
