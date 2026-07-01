import React from 'react'
import { createRoot } from 'react-dom/client'
import { WalletProvider } from './lib/wallet.jsx'
import { App } from './App.jsx'
import './styles/app.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </React.StrictMode>,
)
