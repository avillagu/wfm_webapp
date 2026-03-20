/**
 * Database Initialization Script
 * Runs init.sql against the configured PostgreSQL database
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function initDatabase() {
  console.log('Starting database initialization...\n');
  let dbPool;

  // Create pool options
  const poolOptions = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
      };

  const pool = new Pool(poolOptions);

  try {
    if (!process.env.DATABASE_URL) {
      // Check if database exists
      const dbCheck = await pool.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [process.env.DB_NAME || 'wfm_db']
      );

      if (dbCheck.rows.length === 0) {
        console.log(`Creating database: ${process.env.DB_NAME || 'wfm_db'}...`);
        await pool.query(`CREATE DATABASE ${process.env.DB_NAME || 'wfm_db'}`);
        console.log('Database created successfully.\n');
      } else {
        console.log(`Database ${process.env.DB_NAME || 'wfm_db'} already exists.\n`);
      }

      await pool.end();

      // Connect to the target database
      dbPool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'wfm_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
      });
    } else {
      console.log('Using managed database from DATABASE_URL. Skipping creation...\n');
      dbPool = pool;
    }

    // Read init.sql
    const initSqlPath = path.join(__dirname, '..', 'database', 'init.sql');
    const initSql = fs.readFileSync(initSqlPath, 'utf8');

    console.log('Executing init.sql...\n');

    // Execute the SQL file
    await dbPool.query(initSql);

    console.log('\n✅ Database initialization completed successfully!\n');
    console.log('Default credentials:');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('\n⚠️  Please change the admin password after first login!\n');

    await dbPool.end();
  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run initialization
initDatabase();
