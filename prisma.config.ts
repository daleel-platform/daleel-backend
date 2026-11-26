import { defineConfig } from '@prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
