const slugify = require('slugify');
const { query } = require('../config/db');

const normalizeBlog = (row) => ({
  id: row.id,
  title: row.title,
  slug: row.slug,
  excerpt: row.excerpt,
  content: row.content,
  category: row.category,
  image: row.image,
  featured: row.featured,
  publishedAt: row.published_at,
  author: row.author,
  status: row.status,
});

const ensureBlogTable = async () => {
  await query(`
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
};

const getAllBlogs = async (req, res) => {
  try {
    await ensureBlogTable();
    const result = await query(
      `SELECT * FROM blogs WHERE status = 'published' ORDER BY published_at DESC`
    );

    return res.status(200).json({ blogs: result.rows.map(normalizeBlog) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch blogs', error: error.message });
  }
};

const getBlogBySlug = async (req, res) => {
  try {
    await ensureBlogTable();
    const { slug } = req.params;
    const result = await query('SELECT * FROM blogs WHERE slug = $1', [slug]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ blog: normalizeBlog(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch blog', error: error.message });
  }
};

const getAdminBlogs = async (req, res) => {
  try {
    await ensureBlogTable();
    const result = await query('SELECT * FROM blogs ORDER BY published_at DESC');
    return res.status(200).json({ blogs: result.rows.map(normalizeBlog) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch admin blogs', error: error.message });
  }
};

const createBlog = async (req, res) => {
  try {
    await ensureBlogTable();
    const {
      title,
      excerpt = '',
      content,
      category = 'General',
      image = '',
      featured = false,
      author = 'FlutterFlirt Team',
      status = 'draft',
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const baseSlug = slugify(title, { lower: true, strict: true });
    let slug = baseSlug;
    let suffix = 1;

    while (true) {
      const existing = await query('SELECT id FROM blogs WHERE slug = $1', [slug]);
      if (existing.rows.length === 0) break;
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const result = await query(
      `INSERT INTO blogs (title, slug, excerpt, content, category, image, featured, author, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [title, slug, excerpt, content, category, image, featured, author, status]
    );

    return res.status(201).json({ message: 'Blog created successfully', blog: normalizeBlog(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create blog', error: error.message });
  }
};

const updateBlog = async (req, res) => {
  try {
    await ensureBlogTable();
    const { id } = req.params;
    const {
      title,
      excerpt = '',
      content,
      category,
      image,
      featured,
      author,
      status,
    } = req.body;

    const nextStatus = status || 'draft';

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const result = await query(
      `UPDATE blogs
       SET title = $1,
           slug = $2,
           excerpt = $3,
           content = $4,
           category = $5,
           image = $6,
           featured = $7,
           author = $8,
           status = $9,
           published_at = CASE WHEN $10 AND published_at IS NULL THEN NOW() ELSE published_at END
       WHERE id = $11
       RETURNING *`,
      [
        title,
        slugify(title, { lower: true, strict: true }),
        excerpt,
        content,
        category || 'General',
        image || '',
        featured ?? false,
        author || 'FlutterFlirt Team',
        nextStatus,
        nextStatus === 'published',
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ message: 'Blog updated successfully', blog: normalizeBlog(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update blog', error: error.message });
  }
};

const deleteBlog = async (req, res) => {
  try {
    await ensureBlogTable();
    const { id } = req.params;
    const result = await query('DELETE FROM blogs WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    return res.status(200).json({ message: 'Blog deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete blog', error: error.message });
  }
};

module.exports = {
  ensureBlogTable,
  getAllBlogs,
  getBlogBySlug,
  getAdminBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
};
