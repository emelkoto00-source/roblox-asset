import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf-8');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try { await pool.query(sql); console.log('Database schema initialized'); }
finally { await pool.end(); }
