const path = require('path');
const { MemoryStore } = require('./memoryStore');
const { PostgresStore } = require('./postgresStore');

function createStore() {
  const databaseUrl = process.env.DATABASE_URL;
  const storageAdapter = process.env.STORAGE_ADAPTER || (databaseUrl ? 'postgres' : 'memory');

  if (storageAdapter === 'postgres') {
    return new PostgresStore({
      connectionString: databaseUrl,
      runMigrations: process.env.AUTO_MIGRATE === 'true',
      migrationFile: path.resolve(process.cwd(), 'db/migrations/001_init.sql'),
    });
  }

  return new MemoryStore({
    persistPath: path.resolve(process.cwd(), process.env.LOCAL_DATA_FILE || 'data/local-data.json'),
  });
}

module.exports = { createStore };
