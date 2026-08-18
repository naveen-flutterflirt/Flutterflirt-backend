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

    // Indexes for fast lookup
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs(slug);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blog_sections_blog_id ON blog_sections(blog_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blog_sections_position ON blog_sections(blog_id, position);`);

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
