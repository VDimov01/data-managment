import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    historyApiFallback: true, // ✅ allows React Router to handle all routes
    host: true,      // or '0.0.0.0'
    port: 5173,      // change if you like
    strictPort: true // optional: fail if port busy
  }
})
