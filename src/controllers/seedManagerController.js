const { query } = require('../config/db');
const { Pool } = require('pg');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Directory for storing uploaded seed files (Safe for Vercel Serverless /tmp or local storage)
const SEED_STORAGE_DIR = process.env.VERCEL
  ? '/tmp'
  : path.join(__dirname, '../../uploads/seed-scripts');

try {
  if (!fs.existsSync(SEED_STORAGE_DIR)) {
    fs.mkdirSync(SEED_STORAGE_DIR, { recursive: true });
  }
} catch (e) {
  // Gracefully ignore filesystem restrictions in read-only serverless lambdas
}

let activeCronTask = null;

// Ensure database table for seed config & run logs
const ensureSeedTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS product_seed_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES saas_products(id) ON DELETE CASCADE,
      cron_time VARCHAR(20) NOT NULL DEFAULT '03:00',
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      file_name VARCHAR(255),
      file_path TEXT,
      original_name VARCHAR(255),
      file_content TEXT,
      last_run_at TIMESTAMPTZ,
      last_status VARCHAR(50),
      last_log TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_product_seed UNIQUE (product_id)
    );

    CREATE TABLE IF NOT EXISTS product_seed_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES saas_products(id) ON DELETE CASCADE,
      run_type VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      status VARCHAR(20) NOT NULL,
      details TEXT,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE product_seed_configs ADD COLUMN IF NOT EXISTS schema_content TEXT DEFAULT '';
    ALTER TABLE product_seed_configs ADD COLUMN IF NOT EXISTS schema_file_name VARCHAR(255);
  `);
};

/**
 * Execute seed script against target demo database.
 * CRITICAL RULE: The target DB's users / demo_users tables are PRESERVED so that
 * active user demo sessions are not wiped out before their 6 hours expire.
 */
const runSeedForProduct = async (productId, runType = 'manual') => {
  const startTime = Date.now();
  console.log(`[Seed Runner] Starting seed run for product ${productId} (type: ${runType})...`);

  // 1. Fetch product first to verify product existence & demo DB setup
  const productCheck = await query(
    `SELECT id, title, demo_db_url FROM saas_products WHERE id = $1`,
    [productId]
  );

  if (productCheck.rows.length === 0) {
    throw new Error(`Product not found (ID: ${productId})`);
  }

  const { title, demo_db_url } = productCheck.rows[0];

  if (!demo_db_url || !demo_db_url.trim()) {
    throw new Error(`Missing Demo Database URL: Product "${title}" does not have a demo_db_url configured yet. Please configure the target database URL first.`);
  }

  // Fetch seed config
  const configRes = await query(
    `SELECT file_path, file_content, schema_content, is_enabled FROM product_seed_configs WHERE product_id = $1`,
    [productId]
  );

  if (configRes.rows.length === 0 || (!configRes.rows[0].file_content && !configRes.rows[0].file_path)) {
    throw new Error(`No Seed File Configured: Product "${title}" has no seed.sql script saved yet. Please upload a seed file and click "Save & Schedule" first.`);
  }

  const { file_path, file_content, schema_content } = configRes.rows[0];

  let codeToRun = file_content;
  if (!codeToRun && file_path && fs.existsSync(file_path)) {
    codeToRun = fs.readFileSync(file_path, 'utf8');
  }

  if (!codeToRun || !codeToRun.trim()) {
    throw new Error(`Seed script for product "${title}" is empty. Please upload a valid seed.sql.`);
  }

  // 2. Connect to target demo database
  const targetPool = new Pool({
    connectionString: demo_db_url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  const logs = [];
  const appendLog = (msg) => {
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    console.log(`[Seed Engine: ${title}] ${msg}`);
  };

  try {
    appendLog(`Connected to target Neon DB for "${title}".`);

    // STEP 0: If schema_content exists or if codeToRun has CREATE TABLE / CREATE TYPE / CREATE EXTENSION,
    // execute schema DDL first to ensure blank DB has all necessary tables
    if (schema_content && schema_content.trim()) {
      appendLog('Applying Database Schema DDL (creating missing tables/types)...');
      try {
        await targetPool.query(schema_content.trim());
        appendLog('Schema DDL applied successfully.');
      } catch (schemaErr) {
        appendLog(`Schema notice: ${schemaErr.message}`);
      }
    }

    // Check if the script is pure SQL (.sql file or SQL statements)
    // If it starts with SQL statements (like TRUNCATE, INSERT, CREATE, DO, BEGIN, etc.) or is not JS,
    // we execute it directly via pg client query
    const trimmedCode = codeToRun.trim();
    const isPureSql = 
      /^(TRUNCATE|INSERT|CREATE|DO\s*\$\$|BEGIN|DROP|ALTER|UPDATE|DELETE|--|\/\*)/i.test(trimmedCode) &&
      !trimmedCode.includes('require(') && 
      !trimmedCode.includes('module.exports') &&
      !trimmedCode.includes('function');

    if (isPureSql) {
      // If codeToRun itself contains CREATE TABLE / CREATE EXTENSION, execute them upfront
      if (/CREATE\s+(TABLE|EXTENSION|TYPE|SEQUENCE|INDEX)/i.test(trimmedCode)) {
        appendLog('Checking and running any schema definition statements in SQL...');
      }

      appendLog('Preparing target database for fresh seed records...');
      
      // 1. Automatically wipe out old test records so new seed data replaces it freshly
      // Extract target tables mentioned in INSERT INTO statements
      const insertTableMatches = Array.from(trimmedCode.matchAll(/INSERT\s+INTO\s+(?:["`]?\w+["`]?\.)?["`]?(\w+)["`]?/gi))
        .map(m => m[1].toLowerCase());
      
      // Crucial: preserve existing users! Never wipe/delete/truncate the users or demo_users table
      const tablesToClean = Array.from(new Set(insertTableMatches)).filter(
        tbl => tbl !== 'users' && tbl !== 'demo_users' && tbl !== 'demo_sessions'
      );
      
      if (tablesToClean.length > 0) {
        appendLog(`Cleaning old data from tables: ${tablesToClean.join(', ')} (preserving all existing users)...`);
        // We truncate existing non-user tables with CASCADE
        try {
          // Disable foreign key constraints temporarily during wipe
          await targetPool.query(`
            DO $$ 
            DECLARE 
              r RECORD;
            BEGIN
              SET CONSTRAINTS ALL DEFERRED;
            END $$;
          `);

          for (const tbl of tablesToClean) {
            try {
              await targetPool.query(`TRUNCATE TABLE "${tbl}" RESTART IDENTITY CASCADE;`);
            } catch (tblErr) {
              // If TRUNCATE is restricted by trigger (e.g. forbid_change trigger), drop rows via DELETE or disable trigger
              try {
                await targetPool.query(`ALTER TABLE "${tbl}" DISABLE TRIGGER ALL;`);
                await targetPool.query(`DELETE FROM "${tbl}";`);
                await targetPool.query(`ALTER TABLE "${tbl}" ENABLE TRIGGER ALL;`);
              } catch (_) {
                try {
                  await targetPool.query(`DELETE FROM "${tbl}";`);
                } catch (e2) {
                  // ignore if table doesn't exist yet
                }
              }
            }
          }
          appendLog('Old non-user records wiped clean.');
        } catch (cleanErr) {
          appendLog(`Notice during table clean: ${cleanErr.message}`);
        }
      }

      // Safe user insertion:
      // If the target database does NOT have a 'users' table (e.g. some apps use 'members', 'staff', 'accounts', etc.),
      // we check whether the table exists before executing or wrap safely so it doesn't crash the entire seed
      let executableSql = trimmedCode;

      // Check if 'users' table exists in target database
      const hasUsersTable = await targetPool.query(`
        SELECT to_regclass('public.users') as tbl;
      `).then(r => Boolean(r.rows[0]?.tbl)).catch(() => false);

      if (hasUsersTable) {
        // Safe user insertion: only apply ON CONFLICT if the user statement does not already have an ON CONFLICT clause
        // Split SQL by statements safely to avoid greedy matching across subsequent tables (like companies, beats, etc.)
        const stmts = executableSql.split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/);
        const transformedStmts = stmts.map(stmt => {
          const trimmed = stmt.trim();
          if (/^INSERT\s+INTO\s+(?:["`]?\w+["`]?\.)?["`]?users["`]?/i.test(trimmed)) {
            if (!/ON\s+CONFLICT/i.test(trimmed)) {
              return `${trimmed} ON CONFLICT (email) DO NOTHING`;
            }
          }
          return trimmed;
        }).filter(Boolean);
        executableSql = transformedStmts.join(';\n\n') + ';';
      } else {
        // Target DB schema doesn't have a 'users' table - remove or comment out any 'INSERT INTO users' statements
        appendLog(`Note: Target database does not have a 'users' table. Bypassing any user table insertion.`);
        executableSql = executableSql.replace(
          /INSERT\s+INTO\s+(?:["`]?\w+["`]?\.)?["`]?users["`]?[\s\S]*?;/gi,
          '-- [Bypassed: relation "users" does not exist in target DB]'
        );
      }

      appendLog('Executing fresh seed data injection...');
      await targetPool.query(executableSql);
      appendLog('Fresh seed records inserted successfully.');
    } else {
      // 3. Setup sandbox context for the seed script
      // We provide: pool, db (targetPool), query, console, setTimeout, Buffer, etc.
      // The script can export an async function or be an async IIFE / standard JS script.
      const customConsole = {
        log: (...args) => appendLog(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')),
        warn: (...args) => appendLog(`WARN: ` + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')),
        error: (...args) => appendLog(`ERROR: ` + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')),
        info: (...args) => appendLog(`INFO: ` + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')),
      };

      const sandbox = {
        pool: targetPool,
        db: targetPool,
        query: (text, params) => targetPool.query(text, params),
        console: customConsole,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Buffer,
        Date,
        Math,
        JSON,
        RegExp,
        Promise,
        require: (mod) => {
          if (mod === 'pg') return { Pool };
          if (mod === 'crypto') return require('crypto');
          if (mod === 'bcryptjs' || mod === 'bcrypt') return require('bcryptjs');
          throw new Error(`Require for module '${mod}' is restricted in seed script.`);
        },
        module: { exports: {} },
        exports: {},
      };

      const scriptContext = vm.createContext(sandbox);

      // Wrap in an async execution wrapper so top-level awaits or exported functions run cleanly
      const wrappedCode = `
        (async () => {
          ${codeToRun}
          if (typeof module.exports === 'function') {
            await module.exports({ pool, query, db });
          } else if (typeof module.exports?.seed === 'function') {
            await module.exports.seed({ pool, query, db });
          }
        })()
      `;

      const script = new vm.Script(wrappedCode, {
        filename: `seed_${productId}.js`,
        timeout: 120000, // 2 minutes max execution
      });

      await script.runInContext(scriptContext);
    }

    appendLog('Seed execution completed successfully.');

    const duration = Date.now() - startTime;
    const finalLog = logs.join('\n');

    // Update config status
    await query(
      `UPDATE product_seed_configs 
       SET last_run_at = NOW(), last_status = 'success', last_log = $1, updated_at = NOW()
       WHERE product_id = $2`,
      [finalLog, productId]
    );

    // Save run history log
    await query(
      `INSERT INTO product_seed_logs (product_id, run_type, status, details, duration_ms)
       VALUES ($1, $2, 'success', $3, $4)`,
      [productId, runType, finalLog, duration]
    );

    return { success: true, log: finalLog, duration };
  } catch (err) {
    let errorDetail = err.message;
    // Specifically detect demo database connection/reachability failures
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message?.includes('getaddrinfo') || err.message?.includes('connect ECONNREFUSED')) {
      errorDetail = `Target Database Connection Error: Cannot connect to target Demo Database (${demo_db_url ? demo_db_url.split('@')[1] || 'URL' : 'URL'}). Please check if the demo database host exists, is awake, or network connectivity is available. Original error: ${err.message}`;
    }

    appendLog(`Execution Failed: ${errorDetail}`);
    const duration = Date.now() - startTime;
    const finalLog = logs.join('\n');

    await query(
      `UPDATE product_seed_configs 
       SET last_run_at = NOW(), last_status = 'error', last_log = $1, updated_at = NOW()
       WHERE product_id = $2`,
      [finalLog, productId]
    );

    await query(
      `INSERT INTO product_seed_logs (product_id, run_type, status, details, duration_ms)
       VALUES ($1, $2, 'error', $3, $4)`,
      [productId, runType, finalLog, duration]
    );

    const enrichedErr = new Error(errorDetail);
    enrichedErr.originalError = err;
    throw enrichedErr;
  } finally {
    try {
      await targetPool.end();
    } catch (_) {}
  }
};

/**
 * Daily scheduler: checks active seed configurations and schedules/runs them.
 * Evaluates every minute if any configured daily time matches the current system time.
 */
const startSeedScheduler = () => {
  if (activeCronTask) {
    activeCronTask.stop();
  }

  // Check every minute
  activeCronTask = cron.schedule('* * * * *', async () => {
    try {
      await ensureSeedTables();

      const now = new Date();
      // Format current time as HH:MM in 24h
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hours}:${minutes}`;

      // Find all enabled seed configs matching this time
      const res = await query(
        `SELECT product_id, cron_time, last_run_at 
         FROM product_seed_configs 
         WHERE is_enabled = true AND cron_time = $1`,
        [currentTimeStr]
      );

      for (const row of res.rows) {
        // Prevent running more than once within the same minute
        if (row.last_run_at) {
          const diffMinutes = (Date.now() - new Date(row.last_run_at).getTime()) / (1000 * 60);
          if (diffMinutes < 1.5) continue;
        }

        console.log(`[Seed Cron Trigger] Triggering scheduled seed for product ${row.product_id} at ${currentTimeStr}`);
        runSeedForProduct(row.product_id, 'scheduled').catch(err => {
          console.error(`[Seed Cron Error for ${row.product_id}]:`, err.message);
        });
      }
    } catch (err) {
      console.error('[Seed Cron Global Error]:', err.message);
    }
  });

  console.log('[Seed Scheduler] Daily night seed runner initialized and active.');
};

// --- HTTP Controller Methods ---

// GET /api/admin/products/:productId/seed-config
const getSeedConfig = async (req, res) => {
  try {
    await ensureSeedTables();
    const { productId } = req.params;

    const configRes = await query(
      `SELECT * FROM product_seed_configs WHERE product_id = $1`,
      [productId]
    );

    const logsRes = await query(
      `SELECT * FROM product_seed_logs WHERE product_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [productId]
    );

    if (configRes.rows.length === 0) {
      return res.status(200).json({
        exists: false,
        config: {
          productId,
          cronTime: '03:00', // Default 3:00 AM night time
          isEnabled: true,
          fileName: null,
          hasContent: false,
        },
        logs: [],
      });
    }

    const row = configRes.rows[0];
    let fileContent = row.file_content || '';
    if (!fileContent && row.file_path && fs.existsSync(row.file_path)) {
      try {
        fileContent = fs.readFileSync(row.file_path, 'utf8');
      } catch (_) {}
    }

    return res.status(200).json({
      exists: true,
      config: {
        id: row.id,
        productId: row.product_id,
        cronTime: row.cron_time,
        isEnabled: row.is_enabled,
        fileName: row.file_name || row.original_name,
        originalName: row.original_name,
        hasContent: !!(fileContent),
        fileContent: fileContent,
        schemaContent: row.schema_content || '',
        schemaFileName: row.schema_file_name || null,
        lastRunAt: row.last_run_at,
        lastStatus: row.last_status,
        lastLog: row.last_log,
      },
      logs: logsRes.rows,
    });
  } catch (error) {
    console.error('getSeedConfig error:', error);
    return res.status(500).json({ message: 'Failed to retrieve seed configuration' });
  }
};

// POST /api/admin/products/:productId/seed-config
// Supports file upload (seedFile & optional schemaFile) or direct code text
const saveSeedConfig = async (req, res) => {
  try {
    await ensureSeedTables();
    const { productId } = req.params;
    const { cronTime = '03:00', isEnabled = 'true', seedCode, schemaCode } = req.body;

    let fileName = null;
    let filePath = null;
    let originalName = null;
    let fileContent = seedCode || '';

    let schemaContent = schemaCode || '';
    let schemaFileName = null;

    // Handle uploaded files (seedFile and schemaFile)
    const seedFile = req.files?.seedFile?.[0] || req.file;
    const schemaFile = req.files?.schemaFile?.[0];

    if (seedFile) {
      originalName = seedFile.originalname;
      fileName = `${productId}_${Date.now()}_${seedFile.originalname}`;
      filePath = path.join(SEED_STORAGE_DIR, fileName);
      try {
        fs.writeFileSync(filePath, seedFile.buffer);
      } catch (_) {}
      fileContent = seedFile.buffer.toString('utf8');
    }

    if (schemaFile) {
      schemaFileName = schemaFile.originalname;
      schemaContent = schemaFile.buffer.toString('utf8');
    }

    const enabledBool = isEnabled === 'true' || isEnabled === true;

    // Check existing
    const existing = await query(
      `SELECT id, file_path, file_content, original_name, file_name, schema_content, schema_file_name 
       FROM product_seed_configs WHERE product_id = $1`,
      [productId]
    );

    if (existing.rows.length > 0) {
      const prev = existing.rows[0];
      const finalFileName = fileName || prev.file_name;
      const finalFilePath = filePath || prev.file_path;
      const finalOrigName = originalName || prev.original_name;
      const finalContent = fileContent || prev.file_content;
      const finalSchemaContent = schemaContent || prev.schema_content || '';
      const finalSchemaFileName = schemaFileName || prev.schema_file_name || null;

      await query(
        `UPDATE product_seed_configs
         SET cron_time = $1, is_enabled = $2, file_name = $3, file_path = $4,
             original_name = $5, file_content = $6, schema_content = $7, schema_file_name = $8, updated_at = NOW()
         WHERE product_id = $9`,
        [cronTime, enabledBool, finalFileName, finalFilePath, finalOrigName, finalContent, finalSchemaContent, finalSchemaFileName, productId]
      );
    } else {
      await query(
        `INSERT INTO product_seed_configs 
         (product_id, cron_time, is_enabled, file_name, file_path, original_name, file_content, schema_content, schema_file_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [productId, cronTime, enabledBool, fileName, filePath, originalName, fileContent, schemaContent, schemaFileName]
      );
    }

    return res.status(200).json({
      message: 'Seed and schema configurations saved successfully',
      cronTime,
      isEnabled: enabledBool,
      fileName: fileName || (existing.rows[0]?.file_name),
      schemaFileName: schemaFileName || (existing.rows[0]?.schema_file_name),
    });
  } catch (error) {
    console.error('saveSeedConfig error:', error);
    return res.status(500).json({ message: error.message || 'Failed to save seed config' });
  }
};

// POST /api/admin/products/:productId/seed-trigger
// Manually triggers seed execution on demand
const triggerSeedNow = async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await runSeedForProduct(productId, 'manual');
    return res.status(200).json({
      message: 'Seed executed successfully',
      log: result.log,
      durationMs: result.duration,
    });
  } catch (error) {
    console.error('triggerSeedNow error:', error);
    return res.status(500).json({
      message: 'Seed execution failed: ' + error.message,
      error: error.message,
    });
  }
};

// GET /api/cron/seed
// Triggered automatically by Vercel Cron Jobs or external pingers every night
const handleVercelCronSeed = async (req, res) => {
  try {
    await ensureSeedTables();

    // Verify Vercel Cron authorization if CRON_SECRET is set
    const authHeader = req.headers['authorization'];
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ message: 'Unauthorized cron trigger' });
    }

    // Find all active products with seeding enabled
    const resConfigs = await query(
      `SELECT product_id, cron_time 
       FROM product_seed_configs 
       WHERE is_enabled = true`
    );

    const results = [];
    for (const row of resConfigs.rows) {
      try {
        console.log(`[Vercel Cron] Running scheduled reset for product ${row.product_id}...`);
        const out = await runSeedForProduct(row.product_id, 'scheduled');
        results.push({ productId: row.product_id, status: 'success', durationMs: out.duration });
      } catch (err) {
        console.error(`[Vercel Cron Error for ${row.product_id}]:`, err.message);
        results.push({ productId: row.product_id, status: 'error', error: err.message });
      }
    }

    return res.status(200).json({
      message: 'Midnight seed executed successfully via Vercel Cron',
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('handleVercelCronSeed global error:', error);
    return res.status(500).json({ message: 'Cron execution failure: ' + error.message });
  }
};

module.exports = {
  getSeedConfig,
  saveSeedConfig,
  triggerSeedNow,
  startSeedScheduler,
  runSeedForProduct,
  handleVercelCronSeed,
};
