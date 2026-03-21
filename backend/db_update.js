const { query } = require('./src/config/database');
async function run() {
  try {
    console.log('Starting migration...');
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS current_activity VARCHAR(50) DEFAULT 'Fuera de turno'");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
    await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
    console.log('Migration successful');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}
run();
