// =============================================================================
// PMFI Builder Code attribution (ERC-8021) — ported VERBATIM from production.
//
// Two legacy mechanisms, both preserved exactly:
//   1) app-pmfi/builder-attribution.js  → wrapSigner(): patches signer.sendTransaction
//   2) oplend/src/main.js withBuilderCode() → Proxy over the EIP-1193 provider
//
// The data suffix is IDENTICAL in both (builder code "bc_uyxykegl"). Do not edit.
// =============================================================================

export const BUILDER_CODE = 'bc_uyxykegl'

// ERC-8021 Schema 0: code bytes + code length + schema ID + repeated 8021 marker
export const DATA_SUFFIX =
  '0x62635f757978796b65676c0b0080218021802180218021802180218021'

function appendSuffix(existingData, suffix = DATA_SUFFIX) {
  const base =
    typeof existingData === 'string' && existingData.startsWith('0x')
      ? existingData.slice(2)
      : ''
  const suffixHex = suffix.startsWith('0x') ? suffix.slice(2) : suffix
  if (base.toLowerCase().endsWith(suffixHex.toLowerCase())) return '0x' + base
  return '0x' + base + suffixHex
}

// --- Mechanism 1: signer wrapper (used by the vault module) ------------------
const wrappedSigners = new WeakSet()
export function wrapSigner(signer) {
  if (!signer || typeof signer.sendTransaction !== 'function') return signer
  if (wrappedSigners.has(signer)) return signer
  const originalSend = signer.sendTransaction.bind(signer)
  signer.sendTransaction = async function (transaction) {
    const patched = Object.assign({}, transaction || {})
    patched.data = appendSuffix(patched.data || '0x')
    return originalSend(patched)
  }
  wrappedSigners.add(signer)
  return signer
}

// --- Mechanism 2: EIP-1193 provider proxy (used by OpLend module) ------------
const attributedProviders = new WeakMap()
export function withBuilderCode(provider) {
  if (!provider || typeof provider.request !== 'function') return provider
  const existing = attributedProviders.get(provider)
  if (existing) return existing

  const wrapped = new Proxy(provider, {
    get(target, property) {
      if (property === 'request') {
        return async (request) => {
          const method = request?.method
          if (
            method === 'eth_sendTransaction' ||
            method === 'eth_estimateGas' ||
            method === 'eth_signTransaction'
          ) {
            const params = Array.isArray(request.params) ? [...request.params] : []
            if (params[0] && typeof params[0] === 'object') {
              const transaction = { ...params[0] }
              const attributedData = appendSuffix(
                transaction.data ?? transaction.input ?? '0x',
              )
              transaction.data = attributedData
              if ('input' in transaction) transaction.input = attributedData
              params[0] = transaction
            }
            return target.request({ ...request, params })
          }
          if (method === 'wallet_sendCalls') {
            const params = Array.isArray(request.params) ? [...request.params] : []
            if (params[0] && typeof params[0] === 'object') {
              params[0] = {
                ...params[0],
                capabilities: {
                  ...(params[0].capabilities || {}),
                  dataSuffix: { value: DATA_SUFFIX, optional: true },
                },
              }
            }
            return target.request({ ...request, params })
          }
          return target.request(request)
        }
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  attributedProviders.set(provider, wrapped)
  return wrapped
}
