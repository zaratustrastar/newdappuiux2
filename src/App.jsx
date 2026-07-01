import { Route, Switch } from 'wouter'
import { useWallet } from './lib/wallet.jsx'
import { useVaultStats } from './vault/useVault.js'
import { useOplend } from './oplend/useOplend.js'
import { Header, SpreadTape, SystemBar } from './components/Shell.jsx'
import { Rail } from './components/Rail.jsx'
import { Portfolio } from './routes/Portfolio.jsx'
import { Vault } from './routes/Vault.jsx'
import { OpLend } from './routes/OpLend.jsx'

export function App() {
  const { address } = useWallet()
  // Shared read state for the rail + portfolio summary (real on-chain reads).
  const vault = useVaultStats(address)
  const oplend = useOplend(address)

  return (
    <div className="pmfi-app">
      <div className="grid-bg" />
      <Header />
      <SpreadTape />
      <div className="body">
        <Rail vault={vault} oplend={oplend} />
        <main className="main">
          <Switch>
            {/* pARBITRAGE is the landing route: '/' plus '/vault' alias */}
            <Route path="/" component={Vault} />
            <Route path="/vault" component={Vault} />
            <Route path="/oplend" component={OpLend} />
            <Route path="/portfolio">{() => <Portfolio vault={vault} oplend={oplend} />}</Route>
            {/* Unknown routes fall back to pARBITRAGE */}
            <Route component={Vault} />
          </Switch>
        </main>
      </div>
      <SystemBar />
    </div>
  )
}
