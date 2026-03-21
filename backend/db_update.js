const { query } = require('./src/config/database');
async function run() {
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS current_activity VARCHAR(50) DEFAULT 'Fuera de turno'");
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP");
  console.log('done');
  process.exit(0);
}
run();
