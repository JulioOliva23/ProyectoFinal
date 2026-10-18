import 'dotenv/config';
import { execSync } from 'node:child_process';

// Apply committed migrations to the e2e database before any suite runs.
export default function globalSetup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for e2e tests');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
