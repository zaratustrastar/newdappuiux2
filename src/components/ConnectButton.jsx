import { useWallet } from '../lib/wallet.jsx'
import { shortAddress } from '../lib/format.js'
import { Spinner } from './ui.jsx'

export function ConnectButton() {
  const { connected, connecting, address, isBase, connect, disconnect, switchNetwork } = useWallet()

  if (!connected) {
    return (
      <button className="btn btn-primary" onClick={() => connect().catch(() => {})} disabled={connecting}>
        {connecting ? <Spinner /> : null}
        {connecting ? 'Connecting' : 'Connect Wallet'}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {!isBase && (
        <button className="btn btn-amber btn-sm" onClick={() => switchNetwork().catch(() => {})}>
          Switch to Base
        </button>
      )}
      <button className="btn btn-sm" onClick={() => disconnect()} title={address}>
        {shortAddress(address)}
      </button>
    </div>
  )
}
