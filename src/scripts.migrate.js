require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for migrate script');
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'db/migrations/001_init.sql'), 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(sql);
  await pool.end();
  console.log('Migration complete');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
