import { execSync } from 'child_process';

export default async function globalSetup(): Promise<void> {
  execSync('npm run db:seed', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
}
