import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'mysql',
    schema: './src/server/db/schema.ts',
    out: './src/server/db/migrations',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'mysql://root:root@127.0.0.1:13306/hexfall',
    },
});
