import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In `npm run dev`, answer /api/rivers with the same Netlify function the
// live site uses, so the river proxy works locally without the Netlify CLI.
const riversApi = {
  name: 'rivers-api',
  configureServer(server) {
    server.middlewares.use('/api/rivers', async (req, res) => {
      try {
        const { default: handler } = await server.ssrLoadModule('/netlify/functions/rivers.mjs');
        const out = await handler(new Request(`http://localhost${req.originalUrl}`));
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await out.text());
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  },
};

export default defineConfig({
  plugins: [react(), riversApi],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          map: ['leaflet', 'react-leaflet'],
          charts: ['recharts'],
        },
      },
    },
  },
});
