import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../env.js';
import * as schema from './schema.js';

let pool: null | mysql.Pool = null;

export const getPool = (): mysql.Pool => pool ??= mysql.createPool({ uri: env.databaseUrl, connectionLimit: 10 });

export const db = drizzle({ client: getPool(), schema, mode: 'default' });

export type Db = typeof db;

export const closeDb = async (): Promise<void> => {
    await pool?.end();
    pool = null;
};
