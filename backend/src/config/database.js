/**
 * Database Connection Pool Configuration
 * Native PostgreSQL driver (pg) with connection pooling
 */

const { Pool } = require('pg');

// Connection pool configuration
const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'wfm_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

// Create the pool
const pool = new Pool(poolConfig);

// Pool event handlers
pool.on('connect', () => {
  console.log('Database: New client connected');
});

pool.on('remove', () => {
  console.log('Database: Client removed from pool');
});

pool.on('error', (err) => {
  console.error('Database: Unexpected error on idle client', err);
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database: Connection test failed', err);
  } else {
    console.log(`Database: Connected successfully at ${res.rows[0].now}`);
  }
});

// Helper function to execute queries with parameters (SQL injection safe)
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('DB Query executed', { duration, rows: result.rowCount });
    return result;
  } catch (err) {
    console.error('DB Query error', { text, error: err.message });
    throw err;
  }
};

// Helper function to get a client from the pool for transactions
const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query;
  const release = client.release;
  
  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
  }, 5000);
  
  // Monkey patch the release method to clear our timeout
  client.release = () => {
    clearTimeout(timeout);
    return release.call(client);
  };
  
  return client;
};

module.exports = { pool, query, getClient };
