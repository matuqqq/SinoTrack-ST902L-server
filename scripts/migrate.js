/**
 * Pure Node.js migration runner — no Prisma CLI required.
 * Reads SQL from prisma/migrations/ and applies them in order.
 * Tracks applied migrations in _sinotrack_migrations table.
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');
const TRACKING_TABLE = '_sinotrack_migrations';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${TRACKING_TABLE}" (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Find migration folders (sorted by name = chronological)
    const migrationFolders = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => fs.statSync(path.join(MIGRATIONS_DIR, f)).isDirectory())
      .sort();

    for (const folder of migrationFolders) {
      const sqlFile = path.join(MIGRATIONS_DIR, folder, 'migration.sql');
      if (!fs.existsSync(sqlFile)) continue;

      // Check if already applied
      const { rows } = await client.query(
        `SELECT 1 FROM "${TRACKING_TABLE}" WHERE name = $1`,
        [folder]
      );
      if (rows.length > 0) {
        console.log(`[migrate] ✓ Already applied: ${folder}`);
        continue;
      }

      // Apply migration in transaction
      const sql = fs.readFileSync(sqlFile, 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          `INSERT INTO "${TRACKING_TABLE}" (name) VALUES ($1)`,
          [folder]
        );
        await client.query('COMMIT');
        console.log(`[migrate] 💾 Applied: ${folder}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${folder} failed: ${e.message}`);
      }
    }

    console.log('[migrate] ✅ All migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('[migrate] ❌', e.message);
  process.exit(1);
});
