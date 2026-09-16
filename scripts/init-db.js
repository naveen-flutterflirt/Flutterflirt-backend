require('dotenv').config();
const { pool } = require('../src/config/db');

async function initDatabase() {
  const client = await pool.connect();
  try {
    console.log('Initializing database schema...');
    await client.query('BEGIN');

    // Enable pgcrypto for UUID generation
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // Check if blogs table exists with SERIAL vs UUID
    const checkTable = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'blogs' AND column_name = 'id';
    `);

    if (checkTable.rows.length > 0 && checkTable.rows[0].data_type === 'integer') {
      console.log('Legacy blogs table with INTEGER id detected. Re-creating table for UUIDs and JSONB sections...');
      await client.query(`DROP TABLE IF EXISTS blog_sections CASCADE;`);
      await client.query(`DROP TABLE IF EXISTS blogs CASCADE;`);
    }

    // Create blogs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blogs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        excerpt TEXT,
        cover_image TEXT,
        category VARCHAR(100) DEFAULT 'General',
        author VARCHAR(255) DEFAULT 'FlutterFlirt Team',
        featured BOOLEAN DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ
      );
    `);

    // Create blog_sections table
    await client.query(`
      CREATE TABLE IF NOT EXISTS blog_sections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        blog_id UUID NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
        heading VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL,
        content JSONB NOT NULL DEFAULT '{}',
        position INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(blog_id, slug),
        UNIQUE(blog_id, position)
      );
    `);

    // Create contact_queries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_queries (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        company_name VARCHAR(255),
        message TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create iot_lectures table
    await client.query(`
      CREATE TABLE IF NOT EXISTS iot_lectures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        description TEXT,
        s3_key TEXT NOT NULL,
        video_url TEXT NOT NULL,
        duration VARCHAR(50) DEFAULT '10:00',
        sequence_order INTEGER NOT NULL DEFAULT 1,
        is_preview BOOLEAN DEFAULT false,
        thumbnail_url TEXT,
        resources JSONB DEFAULT '[]',
        status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create iot_access_codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS iot_access_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(100) NOT NULL UNIQUE,
        description VARCHAR(255),
        max_uses INTEGER NOT NULL DEFAULT 1,
        times_used INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        redeemed_at TIMESTAMPTZ,
        redeemed_by VARCHAR(255)
      );
    `);

    // Create iot_users table for student authentication
    await client.query(`
      CREATE TABLE IF NOT EXISTS iot_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        is_kit_unlocked BOOLEAN NOT NULL DEFAULT false,
        kit_code VARCHAR(100),
        unlocked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create iot_courses table for dynamic masterclasses
    await client.query(`
      CREATE TABLE IF NOT EXISTS iot_courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        badge VARCHAR(100) DEFAULT 'Physical Computing',
        level VARCHAR(50) DEFAULT 'Beginner',
        duration VARCHAR(100) DEFAULT '4 Lessons • 1h 42m',
        thumbnail_url TEXT,
        description TEXT,
        overview TEXT,
        hardware_used JSONB DEFAULT '[]',
        learning_outcomes JSONB DEFAULT '[]',
        lessons JSONB DEFAULT '[]',
        resources JSONB DEFAULT '[]',
        sequence_order INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Indexes for fast lookup
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blog_sections_blog_id ON blog_sections(blog_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blog_sections_position ON blog_sections(blog_id, position);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_lectures_sequence ON iot_lectures(sequence_order);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_lectures_status ON iot_lectures(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_access_codes_code ON iot_access_codes(code);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_users_email ON iot_users(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_courses_slug ON iot_courses(slug);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_courses_sequence ON iot_courses(sequence_order);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_iot_courses_status ON iot_courses(status);`);

    await client.query('COMMIT');
    console.log('Database tables and extensions initialized successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

initDatabase();
