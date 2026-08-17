require('dotenv').config();
const slugify = require('slugify');
const { pool } = require('../src/config/db');

async function seedDatabase() {
  try {
    const blogSeed = [
      {
        title: 'Why Flutter is the right choice for growth-focused brands',
        excerpt: 'A brief look at why fast-moving businesses choose Flutter for product design and launch speed.',
        content: 'Flutter helps teams build polished digital products quickly with a single codebase and a high-quality UI system that feels premium on every screen.',
        category: 'Product',
        image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3',
        featured: true,
        author: 'FlutterFlirt Team',
        status: 'published',
      },
      {
        title: 'How to turn a landing page into a conversion engine',
        excerpt: 'Small improvements to messaging and layout can create a big lift in lead quality and user trust.',
        content: 'Landing pages work best when they tell a clear story, reduce friction, and direct attention toward the next action. Conversion is not just design—it is clarity.',
        category: 'Marketing',
        image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f',
        featured: false,
        author: 'FlutterFlirt Team',
        status: 'published',
      },
    ];

    for (const blog of blogSeed) {
      const slug = slugify(blog.title, { lower: true, strict: true });
      await pool.query(
        `INSERT INTO blogs (title, slug, excerpt, content, category, image, featured, author, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (slug) DO NOTHING`,
        [blog.title, slug, blog.excerpt, blog.content, blog.category, blog.image, blog.featured, blog.author, blog.status]
      );
    }

    const contactSeed = [
      {
        name: 'Ava Patel',
        email: 'ava@example.com',
        phone: '+1 555 010 2345',
        company_name: 'Northstar Labs',
        message: 'We need a new marketing website and would like pricing details.',
        status: 'pending',
      },
      {
        name: 'Daniel Ross',
        email: 'daniel@example.com',
        phone: '+1 555 010 7788',
        company_name: 'Streamline Studio',
        message: 'Can we discuss our brand refresh and landing page optimization?',
        status: 'replied',
      },
    ];

    for (const row of contactSeed) {
      await pool.query(
        `INSERT INTO contact_queries (name, email, phone, company_name, message, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [row.name, row.email, row.phone, row.company_name, row.message, row.status]
      );
    }

    console.log('Seed data inserted successfully');
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedDatabase();
