// =====================================================================
// EventOps: Safe Database Migration Runner
// File    : app/database/scripts/migrate.mjs
// Usage   : node database/scripts/migrate.mjs [--seed] [--dry-run] [--status] [--skip-mongo]
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { setupMongo } from '../mongo/setup.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.resolve(__dirname, '../sql');

// Unique 64-bit integer lock key for EventOps migration locking
const MIGRATION_LOCK_ID = 849204829;

// Ordered list of production migrations (NEVER includes seed or reset)
const PRODUCTION_MIGRATIONS = [
  '01_schema.sql',
  '02_pgvector.sql',
  '03_views.sql',
  '04_triggers.sql',
  '05_procedures.sql',
];

const DEV_SEED_MIGRATION = '06_seed_dev.sql';

// Prohibited destructive patterns in production migrations
const DESTRUCTIVE_PATTERNS = [
  /\bDROP\s+SCHEMA\b/i,
  /\bTRUNCATE\b/i,
  /\bDROP\s+DATABASE\b/i,
];

export function maskUri(uri) {
  if (!uri) return '(none)';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');
}

export function sanitizeSql(sql) {
  return sql
    .replace(/^\s*BEGIN\s*;/im, '')
    .replace(/^\s*COMMIT\s*;/im, '')
    .trim();
}

export function auditScriptContent(filename, sqlContent) {
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(sqlContent)) {
      throw new Error(
        `Safety violation in migration "${filename}": detected prohibited pattern ${pattern}`
      );
    }
  }
}

function validateEnvironment(isSkipMongo) {
  const isProd = process.env.NODE_ENV === 'production';
  const dbUrl = process.env.DATABASE_URL;
  const mongoUri = process.env.MONGODB_URI;

  if (isProd) {
    if (!dbUrl) {
      throw new Error(
        'Production validation failed: DATABASE_URL environment variable is required when NODE_ENV=production.'
      );
    }
    if (!isSkipMongo && !mongoUri) {
      throw new Error(
        'Production validation failed: MONGODB_URI environment variable is required when NODE_ENV=production (or pass --skip-mongo).'
      );
    }
  }

  const resolvedDbUrl = dbUrl || 'postgresql://localhost:5432/eventops';
  const resolvedMongoUri = mongoUri || 'mongodb://127.0.0.1:27017/eventops';

  return { isProd, resolvedDbUrl, resolvedMongoUri };
}

function getPool(connectionString) {
  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1') ||
    connectionString.includes('/tmp');

  return new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
}

async function checkMigrationTableExists(client) {
  const res = await client.query(
    "SELECT to_regclass('public.schema_migrations') AS tbl_name"
  );
  return Boolean(res.rows[0]?.tbl_name);
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      migration_name VARCHAR(120) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      batch INT NOT NULL,
      execution_time_ms INT NOT NULL
    );
  `);
}

async function getAppliedMigrations(client) {
  const exists = await checkMigrationTableExists(client);
  if (!exists) {
    return new Set();
  }
  const res = await client.query(
    'SELECT migration_name FROM schema_migrations ORDER BY migration_id ASC'
  );
  return new Set(res.rows.map((r) => r.migration_name));
}

async function getNextBatchNumber(client) {
  const res = await client.query(
    'SELECT COALESCE(MAX(batch), 0) + 1 AS next_batch FROM schema_migrations'
  );
  return res.rows[0].next_batch;
}

async function acquireAdvisoryLock(client) {
  const res = await client.query(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [MIGRATION_LOCK_ID]
  );
  if (!res.rows[0]?.locked) {
    throw new Error(
      `Migration lock conflict: Another migration process is currently running on this database (advisory lock ID: ${MIGRATION_LOCK_ID}). Aborting.`
    );
  }
}

async function releaseAdvisoryLock(client) {
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
  } catch (err) {
    console.error('Warning: Failed to release advisory lock:', err.message);
  }
}

export async function run() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isStatus = args.includes('--status');
  const isDevSeed = args.includes('--seed');
  const isSkipMongo = args.includes('--skip-mongo');

  // 1. Production environment validation
  const { isProd, resolvedDbUrl, resolvedMongoUri } = validateEnvironment(isSkipMongo);

  console.log('=====================================================================');
  console.log('EventOps Database Migration Runner');
  console.log(`Mode:            ${isDryRun ? 'DRY-RUN (read-only)' : isStatus ? 'STATUS (read-only)' : 'EXECUTE'}`);
  console.log(`Environment:     ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`Database URL:    ${maskUri(resolvedDbUrl)}`);
  console.log(`MongoDB URI:     ${isSkipMongo ? '(SKIPPED via --skip-mongo)' : maskUri(resolvedMongoUri)}`);
  console.log('=====================================================================\n');

  const pool = getPool(resolvedDbUrl);
  let client;
  let lockAcquired = false;

  try {
    client = await pool.connect();

    // Query and log target PostgreSQL instance identity
    const identRes = await client.query(
      'SELECT current_database() AS db, current_user AS usr, inet_server_addr() AS host, version() AS ver'
    );
    const ident = identRes.rows[0];
    console.log(`Connected to PostgreSQL: Database="${ident.db}", User="${ident.usr}", Host="${ident.host || 'local'}"\n`);

    // 2. Read-Only Modes: --status and --dry-run do NOT create tables or acquire write locks
    if (isStatus || isDryRun) {
      const tableExists = await checkMigrationTableExists(client);
      const appliedSet = tableExists ? await getAppliedMigrations(client) : new Set();

      console.log('--- Migration Status Report ---');
      if (!tableExists) {
        console.log('Tracking table "schema_migrations" does not exist yet (0 migrations applied).\n');
      }

      for (const m of PRODUCTION_MIGRATIONS) {
        const status = appliedSet.has(m) ? 'APPLIED' : 'PENDING';
        console.log(`  [${status}] ${m}`);
      }
      if (appliedSet.has(DEV_SEED_MIGRATION)) {
        console.log(`  [APPLIED] ${DEV_SEED_MIGRATION} (Development Fixtures)`);
      }

      const pendingCount = PRODUCTION_MIGRATIONS.filter((m) => !appliedSet.has(m)).length;
      console.log(`\nSummary: ${PRODUCTION_MIGRATIONS.length - pendingCount} applied, ${pendingCount} pending.`);

      if (isDryRun) {
        console.log('\n[DRY-RUN] Verification complete. Genuinely 0 database modifications were performed.');
      }
      return;
    }

    // 3. Execution Mode: Acquire PostgreSQL advisory lock
    await acquireAdvisoryLock(client);
    lockAcquired = true;
    console.log(`✓ Acquired PostgreSQL migration advisory lock (${MIGRATION_LOCK_ID})`);

    // Ensure migration history table exists (execution mode only)
    await ensureMigrationTable(client);

    const appliedSet = await getAppliedMigrations(client);
    const pendingMigrations = PRODUCTION_MIGRATIONS.filter((m) => !appliedSet.has(m));

    if (pendingMigrations.length === 0) {
      console.log('✓ PostgreSQL schema is up to date. No pending production migrations.\n');
    } else {
      console.log(`Found ${pendingMigrations.length} pending migration(s):`);
      pendingMigrations.forEach((m) => console.log(`  - ${m}`));
      console.log('');

      const batch = await getNextBatchNumber(client);

      for (const migrationName of pendingMigrations) {
        const filePath = path.join(SQL_DIR, migrationName);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Migration file missing: ${filePath}`);
        }

        const rawSql = fs.readFileSync(filePath, 'utf-8');
        auditScriptContent(migrationName, rawSql);

        // Sanitize outer transaction boundaries so the runner controls atomicity
        const cleanSql = sanitizeSql(rawSql);

        console.log(`Applying migration: ${migrationName}...`);
        const startTime = Date.now();

        await client.query('BEGIN');
        try {
          await client.query(cleanSql);
          const elapsedMs = Date.now() - startTime;

          // Record history only after SQL succeeds, inside the same transaction
          await client.query(
            `INSERT INTO schema_migrations (migration_name, batch, execution_time_ms)
             VALUES ($1, $2, $3)`,
            [migrationName, batch, elapsedMs]
          );

          await client.query('COMMIT');
          console.log(`  ✓ Applied ${migrationName} successfully in ${elapsedMs}ms`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`\n✗ FAILED migration: ${migrationName}`);
          console.error(`Transaction rolled back. No history recorded for this migration.`);
          console.error(`Details: ${err.message}`);
          throw err;
        }
      }
    }

    // 4. Optional development seeding
    if (isDevSeed) {
      console.log('\n--- Development Seeding Flag Detected (--seed) ---');
      if (isProd) {
        throw new Error('Safety block: Refusing to execute development seeding in NODE_ENV=production!');
      }

      const seedPath = path.join(SQL_DIR, DEV_SEED_MIGRATION);
      if (!fs.existsSync(seedPath)) {
        throw new Error(`Seed file missing: ${seedPath}`);
      }

      console.log(`Executing development seed file: ${DEV_SEED_MIGRATION}...`);
      const seedSql = fs.readFileSync(seedPath, 'utf-8');
      await client.query(seedSql);
      console.log(`✓ Development seed data applied successfully.`);
    }

    // 5. MongoDB setup & verification
    console.log('\n--- MongoDB Setup ---');
    if (isSkipMongo) {
      console.log('⚠ Notice: MongoDB initialization was explicitly SKIPPED via --skip-mongo.');
    } else {
      try {
        await setupMongo({ seed: isDevSeed, uri: resolvedMongoUri });
        console.log('✓ MongoDB collections, validators, and indexes verified successfully.');
      } catch (mongoErr) {
        console.error(`\n✗ FAILED MongoDB initialization: ${mongoErr.message}`);
        console.error('PostgreSQL migrations completed, but MongoDB setup was incomplete.');
        console.error('The database is NOT fully initialized. Aborting with exit code 1.');
        throw mongoErr;
      }
    }

    console.log('\n=====================================================================');
    if (isSkipMongo) {
      console.log('✓ PostgreSQL migration finished. MongoDB setup was SKIPPED.');
    } else {
      console.log('✓ Database initialization finished successfully (PostgreSQL + MongoDB).');
    }
    console.log('=====================================================================');
  } finally {
    if (client) {
      if (lockAcquired) {
        await releaseAdvisoryLock(client);
        console.log(`✓ Released PostgreSQL migration advisory lock (${MIGRATION_LOCK_ID})`);
      }
      client.release();
    }
    await pool.end();
  }
}

// CLI entrypoint
if (process.argv[1]?.endsWith('migrate.mjs')) {
  run().catch((err) => {
    console.error('\nMigration runner terminated with error:', err.message);
    process.exit(1);
  });
}
