import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite server forwards /api to the Express API (npm start in api/).
// In production the API serves web/dist itself, so the browser talks to one origin and no CORS is needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': process.env.API_URL || 'http://localhost:3000' } },
  build: { chunkSizeWarningLimit: 1000 },
});
