import dotenv from 'dotenv';
import { execSync } from 'node:child_process';
import pg from 'pg';

export default async function setup() {
  // Load .env.test if present locally; otherwise rely on process.env (e.g. in CI)
  dotenv.config({ path: '.env.test' });
  process.env.NODE_ENV = 'test';

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined in environment or .env.test');
  }

  try {
    const url = new URL(databaseUrl);
    const targetDb = url.pathname.replace(/^\//, '');

    // Connect to administrative 'postgres' database to ensure target test database exists
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = '/postgres';

    const client = new pg.Client({ connectionString: adminUrl.toString() });
    await client.connect();

    const checkDb = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [targetDb],
    );

    if (checkDb.rowCount === 0) {
      await client.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`[E2E Setup] Created test database "${targetDb}"`);
    }

    await client.end();
  } catch (err) {
    console.warn(
      `[E2E Setup] Notice: Could not ensure database via admin client: ${(err as Error).message}`,
    );
  }

  // Deploy Prisma migrations to the test database
  console.log('[E2E Setup] Deploying Prisma migrations to test database...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
  console.log('[E2E Setup] Test database ready.');
}
