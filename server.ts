import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndValidateEnv } from './src/server/config/env.ts';
import { createCorsMiddleware, securityHeadersMiddleware } from './src/server/middleware/security.ts';
import { createApiRouter } from './src/server/routes.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const env = loadAndValidateEnv();

  if (!env.supabaseConfigured) {
    console.warn(
      '[EL MATBA5] SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is missing. API data routes will return 503 without falling back to SQLite.'
    );
  }

  const app = express();
  app.set('trust proxy', 1);

  app.use(securityHeadersMiddleware);
  app.use(createCorsMiddleware(env));
  app.use(express.json({ limit: '1mb' }));

  // Mount server-side API routes
  app.use('/api', createApiRouter(env));

  if (!env.isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(`EL MATBA5 server listening on http://localhost:${env.port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start EL MATBA5 server:', err);
  process.exit(1);
});
