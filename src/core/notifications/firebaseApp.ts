import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { config } from '../../config';
import { logger } from '../utils/logger';

let initialized = false;

export function getFirebaseApp(): admin.app.App | null {
  if (process.env.VITEST === 'true' || config.NODE_ENV === 'test') {
    return null;
  }

  if (!config.NOTIFICATIONS_PUSH_ENABLED) {
    return null;
  }

  if (!config.FIREBASE_SERVICE_ACCOUNT_PATH) {
    logger.warn('NOTIFICATIONS_PUSH_ENABLED but FIREBASE_SERVICE_ACCOUNT_PATH is not set');
    return null;
  }

  if (!initialized) {
    const accountPath = path.resolve(config.FIREBASE_SERVICE_ACCOUNT_PATH);
    const raw = fs.readFileSync(accountPath, 'utf8');
    const serviceAccount = JSON.parse(raw) as admin.ServiceAccount;

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: config.FIREBASE_PROJECT_ID ?? undefined,
    });
    initialized = true;
  }

  return admin.app();
}
