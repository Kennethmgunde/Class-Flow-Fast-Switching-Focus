import { defineConfig } from 'vite'

// In development, /api goes to the Go server, which forwards CAPT calls.
// The browser can't call CAPT directly: the demo server sends no CORS headers.
export default defineConfig({
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', ws: true },
    },
  },
})
