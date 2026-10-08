import { defineConfig } from 'vite'

// In development, /api goes to the Go server, which forwards CAPT calls.
// The browser can't call CAPT directly: the demo server sends no CORS headers.
export default defineConfig({
  server: {
    // Listen on all addresses: under WSL, Windows can't always reach a
    // server bound only to localhost inside Linux.
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:8080', ws: true },
    },
  },
})
