import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Pool } from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://hizmet:hizmet_dev_password@localhost:55432/hizmet';
const migrationDirectory = resolve(process.cwd(), 'migrations');
const migrationLockId = 2_026_082_001;

async function migrate() {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migration (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const filenames = (await readdir(migrationDirectory))
      .filter((filename) => filename.endsWith('.sql'))
      .sort();

    for (const filename of filenames) {
      const alreadyApplied = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM public.schema_migration WHERE filename = $1) AS exists',
        [filename],
      );

      if (alreadyApplied.rows[0]?.exists) {
        console.log(`Atlandı: ${filename}`);
        continue;
      }

      const sql = await readFile(resolve(migrationDirectory, filename), 'utf8');
      await client.query('BEGIN');

      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO public.schema_migration (filename) VALUES ($1)',
          [filename],
        );
        await client.query('COMMIT');
        console.log(`Uygulandı: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
    client.release();
    await pool.end();
  }
}

void migrate().catch((error: unknown) => {
  console.error('Veritabanı göçü başarısız oldu.', error);
  process.exitCode = 1;
});
