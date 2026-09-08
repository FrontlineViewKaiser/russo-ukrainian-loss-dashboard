import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project from /<repo>/, not from the domain root, so built asset
// URLs need that prefix. src/data/load.js already builds its fetch URLs from
// import.meta.env.BASE_URL, so the datasets follow automatically.
//
// `vite preview` reports command === 'serve', the same as the dev server, so it must be
// matched on isPreview as well - otherwise preview serves at / while the built HTML asks
// for /<repo>/, and every asset 404s.
const REPO = '/russo-ukrainian-loss-dashboard/'

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? REPO : '/',
  plugins: [react()],
  server: { open: true },
}))
