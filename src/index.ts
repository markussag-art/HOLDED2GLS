import express from 'express';
import path from 'path';
import { initDb } from './models/database';
import { config } from './utils/config';
import { logger } from './utils/logger';
import shipmentRoutes from './routes/shipmentRoutes';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', shipmentRoutes);

// Serve frontend
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize database and start server
initDb();

app.listen(config.app.port, () => {
  logger.info(`HOLDED2GLS server running on port ${config.app.port}`);
});

export default app;
