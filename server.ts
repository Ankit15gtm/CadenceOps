import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './src/server/routes/authRoutes.ts';
import { dashboardRouter } from './src/server/routes/dashboardRoutes.ts';
import { dataRouter } from './src/server/routes/dataRoutes.ts';
import { operationsRouter } from './src/server/routes/operationsRoutes.ts';
import { adminHrRouter } from './src/server/routes/adminHrRoutes.ts';
import { enterpriseRouter } from './src/server/routes/enterpriseRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'cadenceops' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api', dashboardRouter); // Exposes /api/reports/overview and /api/reports/export
  app.use('/api', dataRouter);
  app.use('/api', operationsRouter);
  app.use('/api', adminHrRouter);
  app.use('/api', enterpriseRouter);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CadenceOps server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
