require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for seed script');
  const sql = fs.readFileSync(path.resolve(process.cwd(), 'db/seeds/001_demo.sql'), 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(sql);
  await pool.end();
  console.log('Seed complete');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
