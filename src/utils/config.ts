import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  holded: {
    apiKey: process.env.HOLDED_API_KEY || '',
    baseUrl: process.env.HOLDED_BASE_URL || 'https://api.holded.com',
  },
  gls: {
    wsdlUrl: process.env.GLS_WSDL_URL || '',
    uid: process.env.GLS_UID || '',
    clientCode: process.env.GLS_CLIENT_CODE || '',
  },
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },
  db: {
    path: process.env.DB_PATH || path.resolve(__dirname, '../../data/holded2gls.db'),
  },
  labels: {
    dir: process.env.LABELS_DIR || path.resolve(__dirname, '../../data/labels'),
  },
  /** Holded pipeline stage for "Sent by GLS API" */
  holdedSentStageId: '698cbc438d534d720403ffa3',
} as const;
