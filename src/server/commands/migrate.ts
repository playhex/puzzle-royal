import { migrate } from 'drizzle-orm/mysql2/migrator';
import { closeDb, db } from '../db/index.js';

await migrate(db, { migrationsFolder: new URL('../db/migrations', import.meta.url).pathname });
console.log('Migrations applied');
await closeDb();
