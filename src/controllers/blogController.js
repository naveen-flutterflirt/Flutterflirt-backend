const { pool, query } = require('../config/db');
const { generateSectionSlugs, generateUniqueBlogSlug } = require('../utils/slugify');
const { blogCache } = require('../utils/cache');

/**
 * Format blog record with camelCase / clean fields
 */
const formatBlog = (blogRow, sections = []) => {
  if (!blogRow) return null;
  return {
    id: blogRow.id,
    title: blogRow.title,
    slug: blogRow.slug,
    excerpt: blogRow.excerpt || '',
    cover_image: blogRow.cover_image || '',
    image: blogRow.cover_image || '', // alias for frontend compatibility
    category: blogRow.category || 'General',
    author: blogRow.author || 'FlutterFlirt Team',
    featured: Boolean(blogRow.featured),
    status: blogRow.status || 'draft',
    created_at: blogRow.created_at,
    updated_at: blogRow.updated_at,
    published_at: blogRow.published_at,
    publishedAt: blogRow.published_at, // alias
    sections: sections.map(formatSection),
  };
};

const formatSection = (sectionRow) => ({
  id: sectionRow.id,
  blog_id: sectionRow.blog_id,
  heading: sectionRow.heading,
  slug: sectionRow.slug,
  content: typeof sectionRow.content === 'string' ? JSON.parse(sectionRow.content) : (sectionRow.content || {}),
  position: sectionRow.position,
  created_at: sectionRow.created_at,
  updated_at: sectionRow.updated_at,
});

/**
 * Normalize Tiptap JSON content
 */
const sanitizeTiptapContent = (content) => {
  if (!content) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch {
      return {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }],
      };
    }
  }
  if (typeof content === 'object') {
    return content;
  }
  return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
};

/**
 * GET /api/blogs
 * Fetch all published blogs (cached for 60 seconds)
 */
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

/**
 * GET /api/blogs/:slug
 * Fetch a single blog by slug with all sections ordered by position ASC (cached for 60 seconds)
 */
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

/**
 * GET /api/admin/blogs
 * Fetch all blogs (drafts & published) for admin dashboard
 */
const getAdminBlogs = async (req, res) => {
  try {
    const cacheKey = 'blogs:admin:all';
    const cached = blogCache.get(cacheKey);

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
      GROUP BY b.id
      ORDER BY b.updated_at DESC, b.created_at DESC
    `;

    const result = await query(blogsQuery);
    const blogs = result.rows.map((row) => formatBlog(row, row.sections));

    blogCache.set(cacheKey, blogs, 30);

    return res.status(200).json({
      success: true,
      data: blogs,
      blogs: blogs,
    });
  } catch (error) {
    console.error('getAdminBlogs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch admin blogs', error: error.message });
  }
};

/**
 * GET /api/admin/blogs/:id
 * Fetch single blog by ID for editing
 */
const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `blogs:id:${id}`;
    const cached = blogCache.get(cacheKey);

    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json({
        success: true,
        data: cached,
        blog: cached,
      });
    }

    res.setHeader('X-Cache', 'MISS');

    const blogRes = await query('SELECT * FROM blogs WHERE id = $1', [id]);

    if (blogRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    const blog = blogRes.rows[0];
    const sectionsRes = await query(
      'SELECT * FROM blog_sections WHERE blog_id = $1 ORDER BY position ASC',
      [blog.id]
    );

    const formatted = formatBlog(blog, sectionsRes.rows);

    blogCache.set(cacheKey, formatted, 60);

    return res.status(200).json({
      success: true,
      data: formatted,
      blog: formatted,
    });
  } catch (error) {
    console.error('getBlogById error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch blog', error: error.message });
  }
};

/**
 * POST /api/blogs or POST /api/admin/blogs
 * Create blog + sections inside a single transaction (purges cache)
 */
const createBlog = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      title,
      excerpt = '',
      cover_image = '',
      image = '',
      category = 'General',
      author = 'FlutterFlirt Team',
      featured = false,
      status = 'draft',
      sections = [],
    } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Blog title is required' });
    }

    const finalCoverImage = cover_image || image || '';
    const normalizedStatus = ['draft', 'published'].includes(status) ? status : 'draft';
    const publishedAt = normalizedStatus === 'published' ? new Date().toISOString() : null;

    await client.query('BEGIN');

    // 1. Generate unique blog slug
    const blogSlug = await generateUniqueBlogSlug(title, client);

    // 2. Insert blog row
    const insertBlogQuery = `
      INSERT INTO blogs (title, slug, excerpt, cover_image, category, author, featured, status, published_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
    `;
    const blogRes = await client.query(insertBlogQuery, [
      title.trim(),
      blogSlug,
      excerpt ? excerpt.trim() : '',
      finalCoverImage,
      category || 'General',
      author || 'FlutterFlirt Team',
      Boolean(featured),
      normalizedStatus,
      publishedAt,
    ]);

    const createdBlog = blogRes.rows[0];

    // 3. Process sections with unique slugs
    const normalizedSections = Array.isArray(sections) && sections.length > 0
      ? sections
      : (req.body.content ? [{ heading: 'Introduction', content: req.body.content }] : []);

    const sectionsWithSlugs = generateSectionSlugs(normalizedSections);
    const createdSections = [];

    for (let i = 0; i < sectionsWithSlugs.length; i++) {
      const sec = sectionsWithSlugs[i];
      const heading = (sec.heading || `Section ${i + 1}`).trim();
      const slug = sec.slug;
      const content = sanitizeTiptapContent(sec.content);
      const position = i + 1; // 1-indexed ordered position

      const insertSecQuery = `
        INSERT INTO blog_sections (blog_id, heading, slug, content, position, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `;
      const secRes = await client.query(insertSecQuery, [
        createdBlog.id,
        heading,
        slug,
        JSON.stringify(content),
        position,
      ]);
      createdSections.push(secRes.rows[0]);
    }

    await client.query('COMMIT');

    // Invalidate all blog caches
    blogCache.invalidatePattern('blogs:');

    const formattedResponse = formatBlog(createdBlog, createdSections);

    return res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: formattedResponse,
      blog: formattedResponse,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('createBlog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create blog', error: error.message });
  } finally {
    client.release();
  }
};

/**
 * PUT /api/blogs/:id or PUT /api/admin/blogs/:id
 * Update blog + synchronize sections in a single transaction (purges cache)
 */
const updateBlog = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      title,
      excerpt = '',
      cover_image = '',
      image = '',
      category,
      author,
      featured,
      status,
      sections = [],
    } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Blog title is required' });
    }

    await client.query('BEGIN');

    // Check if blog exists
    const existingRes = await client.query('SELECT * FROM blogs WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    const existingBlog = existingRes.rows[0];
    const finalCoverImage = cover_image !== undefined ? cover_image : (image !== undefined ? image : existingBlog.cover_image);
    const nextStatus = status || existingBlog.status || 'draft';
    
    // Determine published_at value
    let nextPublishedAt = existingBlog.published_at;
    if (nextStatus === 'published' && !existingBlog.published_at) {
      nextPublishedAt = new Date().toISOString();
    }

    // Generate unique slug if title changed, or keep stable
    const blogSlug = title.trim() !== existingBlog.title
      ? await generateUniqueBlogSlug(title, client, id)
      : existingBlog.slug;

    // Update blog row
    const updateBlogQuery = `
      UPDATE blogs
      SET title = $1,
          slug = $2,
          excerpt = $3,
          cover_image = $4,
          category = $5,
          author = $6,
          featured = $7,
          status = $8,
          published_at = $9,
          updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `;

    const updatedBlogRes = await client.query(updateBlogQuery, [
      title.trim(),
      blogSlug,
      excerpt ? excerpt.trim() : '',
      finalCoverImage,
      category || existingBlog.category || 'General',
      author || existingBlog.author || 'FlutterFlirt Team',
      featured !== undefined ? Boolean(featured) : existingBlog.featured,
      nextStatus,
      nextPublishedAt,
      id,
    ]);

    const updatedBlog = updatedBlogRes.rows[0];

    // Sections management
    const inputSections = Array.isArray(sections) && sections.length > 0
      ? sections
      : (req.body.content ? [{ heading: 'Introduction', content: req.body.content }] : []);

    const sectionsWithSlugs = generateSectionSlugs(inputSections);

    // Extract existing section IDs in payload
    const incomingExistingIds = sectionsWithSlugs
      .filter((s) => s.id)
      .map((s) => s.id);

    // 1. Delete sections that were removed from the payload
    if (incomingExistingIds.length > 0) {
      await client.query(
        'DELETE FROM blog_sections WHERE blog_id = $1 AND id NOT IN (SELECT unnest($2::uuid[]))',
        [id, incomingExistingIds]
      );
    } else {
      await client.query('DELETE FROM blog_sections WHERE blog_id = $1', [id]);
    }

    // 2. Temporarily set slug & position to temp values to prevent UNIQUE constraint collisions during reordering
    await client.query(
      "UPDATE blog_sections SET slug = slug || '-temp-' || gen_random_uuid(), position = -position - 10000 WHERE blog_id = $1",
      [id]
    );

    const savedSections = [];

    for (let i = 0; i < sectionsWithSlugs.length; i++) {
      const sec = sectionsWithSlugs[i];
      const heading = (sec.heading || `Section ${i + 1}`).trim();
      const slug = sec.slug;
      const content = sanitizeTiptapContent(sec.content);
      const position = i + 1;

      if (sec.id) {
        // Update existing section
        const updateSecQuery = `
          UPDATE blog_sections
          SET heading = $1,
              slug = $2,
              content = $3,
              position = $4,
              updated_at = NOW()
          WHERE id = $5 AND blog_id = $6
          RETURNING *
        `;
        const updatedSec = await client.query(updateSecQuery, [
          heading,
          slug,
          JSON.stringify(content),
          position,
          sec.id,
          id,
        ]);

        if (updatedSec.rows.length > 0) {
          savedSections.push(updatedSec.rows[0]);
        } else {
          // If ID was not found, insert as new
          const insertSecQuery = `
            INSERT INTO blog_sections (blog_id, heading, slug, content, position, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            RETURNING *
          `;
          const insertedSec = await client.query(insertSecQuery, [
            id,
            heading,
            slug,
            JSON.stringify(content),
            position,
          ]);
          savedSections.push(insertedSec.rows[0]);
        }
      } else {
        // Insert new section
        const insertSecQuery = `
          INSERT INTO blog_sections (blog_id, heading, slug, content, position, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          RETURNING *
        `;
        const insertedSec = await client.query(insertSecQuery, [
          id,
          heading,
          slug,
          JSON.stringify(content),
          position,
        ]);
        savedSections.push(insertedSec.rows[0]);
      }
    }

    await client.query('COMMIT');

    // Invalidate all blog caches
    blogCache.invalidatePattern('blogs:');

    // Fetch ordered sections
    const finalSectionsRes = await query(
      'SELECT * FROM blog_sections WHERE blog_id = $1 ORDER BY position ASC',
      [id]
    );

    const formattedResponse = formatBlog(updatedBlog, finalSectionsRes.rows);

    return res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: formattedResponse,
      blog: formattedResponse,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('updateBlog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update blog', error: error.message });
  } finally {
    client.release();
  }
};

/**
 * DELETE /api/blogs/:id or DELETE /api/admin/blogs/:id (purges cache)
 */
const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM blogs WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }

    // Invalidate all blog caches
    blogCache.invalidatePattern('blogs:');

    return res.status(200).json({
      success: true,
      message: 'Blog deleted successfully',
      data: { id },
    });
  } catch (error) {
    console.error('deleteBlog error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete blog', error: error.message });
  }
};

module.exports = {
  getAllBlogs,
  getBlogBySlug,
  getBlogById,
  getAdminBlogs,
  createBlog,
  updateBlog,
  deleteBlog,
};
