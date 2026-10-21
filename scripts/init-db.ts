import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured in the Render environment.');
  }

  // Render starts this command from the repository root.
  // Avoid top-level await and import.meta.url, which may fail under CJS output.
  const schemaPath = resolve(process.cwd(), 'scripts', 'schema.sql');
  const schema = await readFile(schemaPath, 'utf8');
  const pool = new pg.Pool({ connectionString });

  try {
    await pool.query(schema);
    console.log('Database schema initialized');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Database initialization failed:', error);
  process.exitCode = 1;
});
