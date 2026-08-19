require('dotenv').config();
const { pool } = require('../src/config/db');

async function viewDatabaseData() {
  const client = await pool.connect();
  try {
    console.log('Fetching database tables...\n');

    // 1. Fetch Blogs
    console.log('--- BLOGS ---');
    const blogsRes = await client.query('SELECT id, title, category, author, status, created_at FROM blogs ORDER BY created_at DESC LIMIT 10;');
    if (blogsRes.rows.length === 0) {
      console.log('No blogs found.');
    } else {
      console.table(blogsRes.rows);
    }
    console.log('\n');

    // 2. Fetch Contact Queries
    console.log('--- CONTACT QUERIES ---');
    const queriesRes = await client.query('SELECT id, name, email, company_name, status, created_at FROM contact_queries ORDER BY created_at DESC LIMIT 10;');
    if (queriesRes.rows.length === 0) {
      console.log('No contact queries found.');
    } else {
      console.table(queriesRes.rows);
    }

  } catch (error) {
    console.error('Error fetching data from database:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

viewDatabaseData();
