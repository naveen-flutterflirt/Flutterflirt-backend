const { query, pool } = require('../../config/db');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require("node-cache");
const blogCache = new NodeCache({ stdTTL: 300 });
const { formatBlog } = require('../../utils/blogUtils');


// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getAllBlogs = async (req, res) => {
  try {
    const cacheKey = 'blogs:published';
    const cached = blogCache.get(cacheKey);

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json({
        success: true,
        data: cached,
        blogs: cached,
      });
    }

    res.setHeader('X-Cache', 'MISS');

    const blogsQuery = `
      SELECT b.*, 
        COALESCE(
          json_agg(
            json_build_object(
              'id', s.id,
              'heading', s.heading,
              'slug', s.slug,
              'content', s.content,
              'position', s.position,
              'created_at', s.created_at,
              'updated_at', s.updated_at
            ) ORDER BY s.position ASC
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS sections
      FROM blogs b
      LEFT JOIN blog_sections s ON b.id = s.blog_id
      WHERE b.status = 'published'
      GROUP BY b.id
      ORDER BY b.published_at DESC NULLS LAST, b.created_at DESC
    `;

    const result = await query(blogsQuery);
    const blogs = result.rows.map((row) => formatBlog(row, row.sections));

    // Save to cache for 60 seconds
    blogCache.set(cacheKey, blogs, 60);

    return res.status(200).json({
      success: true,
      data: blogs,
      blogs: blogs,
    });
  } catch (error) {
    console.error('getAllBlogs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch blogs', error: error.message });
  }
};

const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const cacheKey = `blogs:slug:${slug}`;
    const cached = blogCache.get(cacheKey);

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json({
        success: true,
        data: cached,
        blog: cached,
      });
    }

    res.setHeader('X-Cache', 'MISS');

    const blogRes = await query('SELECT * FROM blogs WHERE slug = $1', [slug]);

    if (blogRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    const blog = blogRes.rows[0];
    const sectionsRes = await query(
      'SELECT * FROM blog_sections WHERE blog_id = $1 ORDER BY position ASC',
      [blog.id]
    );

    const formatted = formatBlog(blog, sectionsRes.rows);

    // Save to cache for 60 seconds
    blogCache.set(cacheKey, formatted, 60);

    return res.status(200).json({
      success: true,
      data: formatted,
      blog: formatted,
    });
  } catch (error) {
    console.error('getBlogBySlug error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch blog', error: error.message });
  }
};

module.exports = {
  getAllBlogs,
  getBlogBySlug
};
