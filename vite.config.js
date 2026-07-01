import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Local dev proxy: the production app serves the pARBITRAGE price/NAV API from the
// same origin (window.location.origin) on the VPS. Those routes do not exist in a
// local build, so the vault's API-derived metrics (TVL / APR / venue positions)
// honestly report "Unavailable" unless VITE_PARB_API_BASE points at a reachable API.
// See src/vault/api.js and ARCHITECTURE.md.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: { target: 'es2022' },
})
