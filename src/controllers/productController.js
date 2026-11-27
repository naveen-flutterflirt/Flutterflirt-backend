const { query } = require('../config/db');
const { Pool } = require('pg');
const NodeCache = require('node-cache');
const productCache = new NodeCache({ stdTTL: 120, checkperiod: 60 });

const normalizeProduct = (row) => ({
  id: row.id,
  category: row.category,
  title: row.title,
  badge: row.badge,
  tagline: row.tagline,
  description: row.description,
  demoUrl: row.demo_url,
  demoDbUrl: row.demo_db_url || '',
  accentColor: row.accent_color,
  status: row.status,
  keyFeatures: row.key_features || [],
  metrics: row.metrics || [],
  previewTags: row.preview_tags || [],
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

let isProductsTableReady = false;
const ensureProductsTable = async () => {
  if (isProductsTableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS saas_products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category VARCHAR(50) NOT NULL DEFAULT 'erp',
      title VARCHAR(255) NOT NULL,
      badge VARCHAR(100) DEFAULT 'Cloud Solution',
      tagline TEXT NOT NULL,
      description TEXT DEFAULT '',
      demo_url TEXT DEFAULT '',
      demo_db_url TEXT DEFAULT '',
      accent_color VARCHAR(50) DEFAULT '#2563eb',
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
      key_features JSONB DEFAULT '[]',
      metrics JSONB DEFAULT '[]',
      preview_tags JSONB DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_saas_products_status_sort ON saas_products(status, sort_order ASC, created_at DESC);
  `);
  // Ensure column exists for already created tables
  await query(`ALTER TABLE saas_products ADD COLUMN IF NOT EXISTS demo_db_url TEXT DEFAULT '';`);
  isProductsTableReady = true;
};

// Public endpoint: Fetch active products for website visitors (cached with sub-millisecond response)
const getPublicProducts = async (req, res) => {
  try {
    const cached = productCache.get('products:public');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
      return res.status(200).json({ products: cached });
    }

    await ensureProductsTable();
    const result = await query(
      `SELECT * FROM saas_products 
       WHERE status = 'active' 
       ORDER BY sort_order ASC, created_at DESC`
    );
    const products = result.rows.map(normalizeProduct);
    productCache.set('products:public', products, 120);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching public products:', error);
    return res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
};

// Admin endpoint: Fetch all products (including drafts & archived)
const getAllProductsAdmin = async (req, res) => {
  try {
    const cached = productCache.get('products:admin');
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json({ products: cached });
    }

    await ensureProductsTable();
    const result = await query(
      `SELECT * FROM saas_products 
       ORDER BY sort_order ASC, created_at DESC`
    );
    const products = result.rows.map(normalizeProduct);
    productCache.set('products:admin', products, 60);

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json({ products });
  } catch (error) {
    console.error('Error fetching admin products:', error);
    return res.status(500).json({ message: 'Failed to fetch products', error: error.message });
  }
};

// Admin endpoint: Create product
const createProduct = async (req, res) => {
  try {
    await ensureProductsTable();
    const {
      title,
      category = 'erp',
      badge = 'Cloud Solution',
      tagline,
      description = '',
      demoUrl = '',
      demoDbUrl = '',
      accentColor = '#2563eb',
      status = 'active',
      keyFeatures = [],
      metrics = [],
      previewTags = [],
      sortOrder = 0,
    } = req.body;

    const result = await query(
      `INSERT INTO saas_products (
        title, category, badge, tagline, description, demo_url, demo_db_url, accent_color,
        status, key_features, metrics, preview_tags, sort_order, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      RETURNING *`,
      [
        title,
        category,
        badge,
        tagline,
        description,
        demoUrl,
        demoDbUrl,
        accentColor,
        status,
        JSON.stringify(keyFeatures),
        JSON.stringify(metrics),
        JSON.stringify(previewTags),
        sortOrder,
      ]
    );

    productCache.flushAll();
    return res.status(201).json({
      message: 'Product created successfully',
      product: normalizeProduct(result.rows[0]),
    });
  } catch (error) {
    console.error('Error creating product:', error);
    return res.status(500).json({ message: 'Failed to create product', error: error.message });
  }
};

// Admin endpoint: Update product
const updateProduct = async (req, res) => {
  try {
    await ensureProductsTable();
    const { id } = req.params;
    const {
      title,
      category,
      badge,
      tagline,
      description,
      demoUrl,
      demoDbUrl,
      accentColor,
      status,
      keyFeatures,
      metrics,
      previewTags,
      sortOrder,
    } = req.body;

    const result = await query(
      `UPDATE saas_products SET
        title = COALESCE($1, title),
        category = COALESCE($2, category),
        badge = COALESCE($3, badge),
        tagline = COALESCE($4, tagline),
        description = COALESCE($5, description),
        demo_url = COALESCE($6, demo_url),
        demo_db_url = COALESCE($7, demo_db_url),
        accent_color = COALESCE($8, accent_color),
        status = COALESCE($9, status),
        key_features = COALESCE($10, key_features),
        metrics = COALESCE($11, metrics),
        preview_tags = COALESCE($12, preview_tags),
        sort_order = COALESCE($13, sort_order),
        updated_at = NOW()
      WHERE id = $14
      RETURNING *`,
      [
        title,
        category,
        badge,
        tagline,
        description,
        demoUrl,
        demoDbUrl,
        accentColor,
        status,
        keyFeatures ? JSON.stringify(keyFeatures) : null,
        metrics ? JSON.stringify(metrics) : null,
        previewTags ? JSON.stringify(previewTags) : null,
        sortOrder,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    productCache.flushAll();
    return res.status(200).json({
      message: 'Product updated successfully',
      product: normalizeProduct(result.rows[0]),
    });
  } catch (error) {
    console.error('Error updating product:', error);
    return res.status(500).json({ message: 'Failed to update product', error: error.message });
  }
};

// Admin endpoint: Delete product
const deleteProduct = async (req, res) => {
  try {
    await ensureProductsTable();
    const { id } = req.params;

    const result = await query(
      `DELETE FROM saas_products WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    productCache.flushAll();
    return res.status(200).json({
      message: 'Product deleted successfully',
      id,
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    return res.status(500).json({ message: 'Failed to delete product', error: error.message });
  }
};

// Admin endpoint: Test connection to PostgreSQL / Neon Demo DB URL & auto-persist
const testDbConnection = async (req, res) => {
  const { demoDbUrl, productId } = req.body;
  if (!demoDbUrl || !demoDbUrl.trim()) {
    return res.status(400).json({
      connected: false,
      message: 'Demo database URL is empty',
    });
  }

  const cleanUrl = demoDbUrl.trim();
  if (!cleanUrl.startsWith('postgresql://') && !cleanUrl.startsWith('postgres://')) {
    return res.status(400).json({
      connected: false,
      message: 'Invalid protocol. URL must start with postgresql:// or postgres://',
    });
  }

  const startTime = Date.now();
  const testPool = new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
  });

  try {
    const pingRes = await testPool.query('SELECT current_database() as db, version() as ver, NOW() as server_time');
    const latency = Date.now() - startTime;
    const dbName = pingRes.rows[0]?.db || 'database';
    const rawVer = pingRes.rows[0]?.ver || '';
    const verShort = rawVer.split(' ')[0] + ' ' + (rawVer.split(' ')[1] || '');

    // If connected and productId is provided, auto-save to saas_products immediately
    if (productId) {
      await query(
        `UPDATE saas_products SET demo_db_url = $1, updated_at = NOW() WHERE id = $2`,
        [cleanUrl, productId]
      );
      console.log(`[DB Test] Successfully verified & auto-saved demo_db_url for product ${productId}`);
    }

    return res.status(200).json({
      connected: true,
      database: dbName,
      version: verShort,
      latencyMs: latency,
      message: `Connected ${productId ? '& saved ' : ''}successfully to "${dbName}" (${verShort}, ${latency}ms latency)`,
    });
  } catch (err) {
    let reason = err.message;
    if (err.code === '28P01') reason = 'Authentication failed: Invalid username or password';
    else if (err.code === '3D000') reason = 'Database does not exist on target host';
    else if (err.code === 'ENOTFOUND') reason = 'Database host address not found (DNS failed)';
    else if (err.code === 'ECONNREFUSED') reason = 'Connection refused by server on port';
    else if (err.code === 'ETIMEDOUT') reason = 'Connection timed out: Neon compute might be inactive or network unreachable';

    return res.status(200).json({
      connected: false,
      error: reason,
      message: `Connection failed: ${reason}`,
    });
  } finally {
    try {
      await testPool.end();
    } catch (_) {}
  }
};

// Admin endpoint: Batch verify database connectivity for list of products
const batchVerifyDbStatus = async (req, res) => {
  try {
    await ensureProductsTable();
    const result = await query(
      `SELECT id, demo_db_url FROM saas_products WHERE demo_db_url IS NOT NULL AND demo_db_url != ''`
    );

    const statuses = {};
    await Promise.all(
      result.rows.map(async (row) => {
        const testPool = new Pool({
          connectionString: row.demo_db_url,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 4000,
        });
        try {
          await testPool.query('SELECT 1');
          statuses[row.id] = { connected: true };
        } catch (e) {
          statuses[row.id] = { connected: false, error: e.message };
        } finally {
          try {
            await testPool.end();
          } catch (_) {}
        }
      })
    );

    return res.status(200).json({ statuses });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to verify statuses', error: err.message });
  }
};

module.exports = {
  ensureProductsTable,
  getPublicProducts,
  getAllProductsAdmin,
  createProduct,
  updateProduct,
  deleteProduct,
  testDbConnection,
  batchVerifyDbStatus,
};
