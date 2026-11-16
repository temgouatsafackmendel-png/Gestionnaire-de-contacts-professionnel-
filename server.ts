import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApiApp } from './src/server/app';
import { ContactRepository } from './src/server/repository';

dotenv.config();

async function startServer() {
  const port = Number(process.env.PORT || 3000);
  const dbPath = process.env.DB_PATH || './data/contacts.sqlite';
  const backupPath = process.env.JSON_BACKUP_PATH || './data/contacts.backup.json';

  const repository = new ContactRepository(dbPath, backupPath);
  const app = createApiApp(repository);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Veridian Contacts server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
