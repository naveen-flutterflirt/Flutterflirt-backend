const { pool } = require('../src/config/db');

async function initCollegeInquiriesDb() {
  const client = await pool.connect();
  try {
    console.log('--- Initializing iot_college_inquiries & Student Login Tracking ---');

    // 1. Create iot_college_inquiries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS iot_college_inquiries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        college_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        batch_size VARCHAR(100) DEFAULT '60-120 Students',
        notes TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'in_discussion', 'partnered', 'archived')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_college_inquiries_status ON iot_college_inquiries(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_college_inquiries_created ON iot_college_inquiries(created_at DESC);`);

    // 2. Add last_login_at column to iot_users if it doesn't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'iot_users' AND column_name = 'last_login_at'
        ) THEN
          ALTER TABLE iot_users ADD COLUMN last_login_at TIMESTAMPTZ;
        END IF;
      END $$;
    `);

    console.log('Successfully initialized iot_college_inquiries schema and student login tracking.');
  } catch (error) {
    console.error('Error in initCollegeInquiriesDb:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  initCollegeInquiriesDb()
    .then(() => {
      console.log('College inquiries database initialization completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Database migration failed:', err);
      process.exit(1);
    });
}

module.exports = { initCollegeInquiriesDb };
