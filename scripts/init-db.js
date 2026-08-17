require('dotenv').config();
const { pool } = require('../src/config/db');

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blogs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        excerpt TEXT,
        content TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'General',
        image TEXT,
        featured BOOLEAN DEFAULT false,
        published_at TIMESTAMP DEFAULT NOW(),
        author VARCHAR(255) DEFAULT 'FlutterFlirt Team',
        status VARCHAR(30) DEFAULT 'draft'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_queries (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        company_name VARCHAR(255),
        message TEXT NOT NULL,
        status VARCHAR(30) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
