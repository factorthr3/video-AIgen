// Creates a local demo login for development: `npm run seed`.
// Refuses to run in production.
import { db } from './db.js';
import { createUser, hashPassword } from './auth.js';

export const DEMO_EMAIL = 'demo@nrrtv.local';
export const DEMO_PASSWORD = 'nrrtv-demo-2026';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed a demo account in production.');
  process.exit(1);
}

if (db.get('SELECT id FROM users WHERE email = ?', DEMO_EMAIL)) {
  console.log(`Demo account already exists: ${DEMO_EMAIL}`);
} else {
  createUser({ email: DEMO_EMAIL, name: 'Demo Creator', passwordHash: await hashPassword(DEMO_PASSWORD) });
  console.log(`Created demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}
