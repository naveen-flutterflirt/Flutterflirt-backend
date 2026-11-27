const { query } = require('../config/db');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');
const { Pool } = require('pg');

// Setup email transporter using existing SMTP config
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false,
  },
});

const ensureDemoSessionsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS demo_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      demo_id VARCHAR(50) UNIQUE NOT NULL,
      customer_name VARCHAR(255) NOT NULL,
      work_email VARCHAR(255) NOT NULL,
      phone_number VARCHAR(50),
      company_name VARCHAR(255) NOT NULL,
      company_size VARCHAR(50) DEFAULT '10-50 employees',
      application VARCHAR(100) NOT NULL DEFAULT 'Dynamics 365 Finance & Operations',
      target_subdomain VARCHAR(100) NOT NULL DEFAULT 'demo.flutterflirt.com',
      username VARCHAR(100) NOT NULL,
      password_hash TEXT NOT NULL,
      temp_password_plain TEXT,
      login_count INTEGER NOT NULL DEFAULT 0,
      activity_log JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      credentials_sent_at TIMESTAMPTZ,
      first_login_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      last_login_at TIMESTAMPTZ,
      status VARCHAR(30) NOT NULL DEFAULT 'ready' 
        CHECK (status IN ('pending', 'approved', 'ready', 'active', 'expired', 'revoked')),
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_demo_sessions_status_expires ON demo_sessions(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_demo_sessions_email ON demo_sessions(work_email);
    CREATE INDEX IF NOT EXISTS idx_demo_sessions_username ON demo_sessions(username);
  `);
  // Add columns if table already exists
  await query(`ALTER TABLE demo_sessions ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0;`);
  await query(`ALTER TABLE demo_sessions ADD COLUMN IF NOT EXISTS activity_log JSONB DEFAULT '[]';`);

  // Ensure OTP verification table exists
  await query(`
    CREATE TABLE IF NOT EXISTS demo_email_otps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      otp_code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_demo_email_otps_lookup ON demo_email_otps(email, otp_code, verified);
  `);

  // Permanent Demo Claims History Table (prevents claiming same product demo again even if user/session deleted)
  await query(`
    CREATE TABLE IF NOT EXISTS demo_claims_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      work_email VARCHAR(255) NOT NULL,
      product_normalized VARCHAR(100) NOT NULL,
      application_title VARCHAR(255) NOT NULL,
      demo_id VARCHAR(50),
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_demo_claims_hist_lookup ON demo_claims_history(work_email, product_normalized);
  `);
};

// Helper: Normalize product title (strip spaces and non-alphanumeric chars)
const normalizeProductKey = (name) => {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Normalize response row for consistent API contracts
const normalizeSession = (row) => {
  let timeRemaining = null;
  let computedStatus = row.status;

  if (row.status === 'active' && row.expires_at) {
    const diffMs = new Date(row.expires_at).getTime() - Date.now();
    if (diffMs > 0) {
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      timeRemaining = `${hours}h ${mins}m remaining`;
    } else {
      timeRemaining = 'Expired';
      computedStatus = 'expired';
    }
  } else if (row.status === 'ready') {
    timeRemaining = '6 hours (Starts on 1st login)';
  } else if (row.status === 'pending') {
    timeRemaining = 'Not started (Pending approval)';
  } else if (row.status === 'expired') {
    timeRemaining = 'Expired';
  }

  return {
    id: row.id,
    demoId: row.demo_id,
    customerName: row.customer_name,
    workEmail: row.work_email,
    phoneNumber: row.phone_number,
    companyName: row.company_name,
    companySize: row.company_size,
    application: row.application,
    targetSubdomain: row.target_subdomain,
    username: row.username,
    tempPasswordPlain: row.temp_password_plain,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    credentialsSentAt: row.credentials_sent_at,
    firstLoginAt: row.first_login_at,
    expiresAt: row.expires_at,
    lastLoginAt: row.last_login_at,
    loginCount: row.login_count || 0,
    activityLog: row.activity_log || [],
    status: computedStatus,
    notes: row.notes,
    timeRemaining,
  };
};

// Seed initial test demo sessions if table is empty
const seedDefaultDemos = async () => {
  const countRes = await query(`SELECT COUNT(*) FROM demo_sessions`);
  if (parseInt(countRes.rows[0].count, 10) === 0) {
    const demos = [
      {
        demoId: 'ERP-DEMO-1001',
        customerName: 'Rahul Sharma',
        workEmail: 'rahul.sharma@apexlogistics.com',
        phoneNumber: '+91 98765 43210',
        companyName: 'Apex Global Logistics',
        companySize: '250-500 employees',
        application: 'Dynamics 365 Finance & Operations',
        username: 'rahul.apex',
        password_hash: crypto.createHash('sha256').update('ApexDemo2026!').digest('hex'),
        temp_password_plain: 'ApexDemo2026!',
        status: 'ready',
        approved_at: new Date(Date.now() - 24 * 60 * 60 * 1000),
        credentials_sent_at: new Date(Date.now() - 23 * 60 * 60 * 1000),
        first_login_at: null,
        expires_at: null,
      },
      {
        demoId: 'ERP-DEMO-1002',
        customerName: 'Sarah Jenkins',
        workEmail: 's.jenkins@novaretail.co',
        phoneNumber: '+1 (555) 349-1029',
        companyName: 'Nova Retail Group',
        companySize: '50-100 employees',
        application: 'Dynamics 365 Business Central',
        username: 'sarah.nova',
        password_hash: crypto.createHash('sha256').update('NovaDemo2026!').digest('hex'),
        temp_password_plain: 'NovaDemo2026!',
        status: 'pending',
      },
      {
        demoId: 'CRM-DEMO-1003',
        customerName: 'Vikram Malhotra',
        workEmail: 'v.malhotra@zenithenergy.in',
        phoneNumber: '+91 91234 56789',
        companyName: 'Zenith CleanTech',
        companySize: '100-250 employees',
        application: 'Customer Engagement (CRM)',
        username: 'vikram.zenith',
        password_hash: crypto.createHash('sha256').update('ZenithCRM2026!').digest('hex'),
        temp_password_plain: 'ZenithCRM2026!',
        status: 'active',
        approved_at: new Date(Date.now() - 10 * 60 * 60 * 1000),
        credentials_sent_at: new Date(Date.now() - 9 * 60 * 60 * 1000),
        first_login_at: new Date(Date.now() - 4 * 60 * 60 * 1000), // Logged in 4 hours ago
        expires_at: new Date(Date.now() + 44 * 60 * 60 * 1000), // 44 hours remaining
        last_login_at: new Date(Date.now() - 15 * 60 * 1000),
      },
    ];

    for (const d of demos) {
      await query(
        `INSERT INTO demo_sessions 
         (demo_id, customer_name, work_email, phone_number, company_name, company_size, application, username, password_hash, temp_password_plain, status, approved_at, credentials_sent_at, first_login_at, expires_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          d.demoId,
          d.customerName,
          d.workEmail,
          d.phoneNumber,
          d.companyName,
          d.companySize,
          d.application,
          d.username,
          d.password_hash,
          d.temp_password_plain,
          d.status,
          d.approved_at || null,
          d.credentials_sent_at || null,
          d.first_login_at || null,
          d.expires_at || null,
          d.last_login_at || null,
        ]
      );
    }
  }
};

// 0. PUBLIC: Send 6-Digit Email Verification Code to prevent dummy/fake emails
const sendDemoOtp = async (req, res) => {
  try {
    await ensureDemoSessionsTable();
    const { workEmail, fullName, productInterested } = req.body;

    if (!workEmail || !workEmail.trim()) {
      return res.status(400).json({ success: false, message: 'Work email is required.' });
    }

    const trimmedEmail = workEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address format.' });
    }

    const appRequested = (productInterested || 'Dynamics 365 Finance & Operations').trim();
    const normalizedApp = normalizeProductKey(appRequested);

    // 1. Check permanent claim history first
    const claimHistory = await query(
      `SELECT id, demo_id, claimed_at, application_title 
       FROM demo_claims_history 
       WHERE LOWER(work_email) = $1 AND product_normalized = $2 
       LIMIT 1`,
      [trimmedEmail, normalizedApp]
    );

    // 2. Check existing session in demo_sessions (exact match on normalized application name)
    const existingSession = await query(
      `SELECT id, demo_id, status, expires_at, first_login_at, application 
       FROM demo_sessions 
       WHERE LOWER(work_email) = $1 
         AND (
           REGEXP_REPLACE(LOWER(application), '[^a-z0-9]', '', 'g') = $2
           OR LOWER(TRIM(application)) = LOWER(TRIM($3))
         )
       ORDER BY created_at DESC 
       LIMIT 1`,
      [trimmedEmail, normalizedApp, appRequested]
    );

    if (existingSession.rows.length > 0) {
      const prior = existingSession.rows[0];
      if (prior.status === 'active' || prior.status === 'ready') {
        return res.status(409).json({
          success: false,
          code: 'DEMO_ALREADY_ACTIVE',
          message: `A demo access for this email is already active (Demo ID: ${prior.demo_id}). Please check your inbox for login credentials.`
        });
      } else {
        return res.status(403).json({
          success: false,
          code: 'DEMO_ALREADY_CLAIMED',
          message: `You have already claimed your 6-hour demo access for this application with this email (${trimmedEmail}). Each email is eligible for exactly one trial.`
        });
      }
    }

    if (claimHistory.rows.length > 0) {
      return res.status(403).json({
        success: false,
        code: 'DEMO_ALREADY_CLAIMED',
        message: `You have already claimed your 6-hour demo access for this application with this email (${trimmedEmail}). Each email is eligible for exactly one trial. Contact us at info@flutterflirt.com for an extended pilot.`
      });
    }

    // Generate secure 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes validity

    // Invalidate previous OTPs for this email
    await query(`DELETE FROM demo_email_otps WHERE LOWER(email) = $1`, [trimmedEmail]);

    // Save new OTP
    await query(
      `INSERT INTO demo_email_otps (email, otp_code, expires_at, verified)
       VALUES ($1, $2, $3, false)`,
      [trimmedEmail, otp, expiresAt]
    );

    // Send email with verification code
    if (process.env.SMTP_USER) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"FlutterFlirt Support" <${process.env.SMTP_USER}>`,
          to: trimmedEmail,
          subject: `Your verification code is ${otp}`,
          text: `Your verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this, you can safely ignore this email.`,
          headers: {
            'X-Entity-Ref-ID': `${Date.now()}-${otp}`
          },
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script type="application/ld+json">
  {
    "@context": "http://schema.org",
    "@type": "EmailMessage",
    "description": "Your verification code is ${otp}"
  }
  </script>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <!-- Gmail NLP Preheader -->
  <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    Your verification code is ${otp}. Use this code to verify your email.
  </div>
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:24px;border:1px solid #e2e8f0;padding:40px 32px;box-shadow:0 8px 30px rgba(15,23,42,0.06);">
          <tr>
            <td align="center">
              <!-- Header Icon -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <div style="width:52px;height:52px;background:#eff6ff;border:1px solid #dbeafe;border-radius:16px;text-align:center;line-height:52px;font-size:24px;">
                      ✉️
                    </div>
                  </td>
                </tr>
              </table>

              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.4px;">
                Verify Your Email
              </h2>
              <p style="margin:0 0 24px;font-size:13px;color:#64748b;line-height:1.6;max-width:360px;">
                Hi <strong>${fullName || 'there'}</strong>, your verification code is below:
              </p>

              <!-- Single clean double-clickable / one-click selectable code box -->
              <div style="margin:0 auto 28px;text-align:center;">
                <div style="display:inline-block;padding:14px 36px;background:#f8fafc;border:2px solid #cbd5e1;border-radius:16px;">
                  <span style="font-family:-apple-system,BlinkMacSystemFont,'SF Mono',Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:8px;color:#0f172a;user-select:all;-webkit-user-select:all;-moz-user-select:all;display:inline-block;cursor:pointer;">
                    ${otp}
                  </span>
                </div>
              </div>

              <div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:12px;padding:8px 18px;margin-bottom:24px;display:inline-block;">
                <span style="font-size:12px;color:#64748b;font-weight:500;">
                  ⏱️ Code expires in <strong>10 minutes</strong>
                </span>
              </div>

              <!-- Divider -->
              <div style="border-top:1px solid #f1f5f9;margin-bottom:20px;"></div>

              <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5;">
                If you did not request this demo, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin-top:20px;">
          <tr>
            <td align="center" style="font-size:11px;color:#94a3b8;">
              © ${new Date().getFullYear()} FlutterFlirt Cloud Systems. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
          `
        });
      } catch (mailErr) {
        console.error('[OTP Mail Dispatch Error]:', mailErr.message);
        return res.status(500).json({ success: false, message: 'Could not send verification email. Please check the address.' });
      }
    }

    return res.status(200).json({
      success: true,
      message: `A 6-digit verification code has been sent to ${trimmedEmail}.`
    });
  } catch (error) {
    console.error('sendDemoOtp error:', error);
    return res.status(500).json({ success: false, message: 'Failed to dispatch verification code.' });
  }
};

// 1. PUBLIC: Submit Demo Request & INSTANTLY SEND CREDENTIALS (Requires verified OTP)
const submitDemoRequest = async (req, res) => {
  try {
    await ensureDemoSessionsTable();
    const { fullName, workEmail, phoneNumber, companyName, companySize, productInterested, notes, otpCode } = req.body;

    if (!fullName || !workEmail || !companyName) {
      return res.status(400).json({ success: false, message: 'Full name, work email, and company name are required.' });
    }

    if (!otpCode || !otpCode.trim()) {
      return res.status(400).json({ success: false, message: 'Verification code is required to confirm your email.' });
    }

    const trimmedEmail = workEmail.trim().toLowerCase();
    const cleanOtp = otpCode.trim();

    // Verify OTP
    const otpRecord = await query(
      `SELECT id, expires_at 
       FROM demo_email_otps 
       WHERE LOWER(email) = $1 AND otp_code = $2 AND verified = false
       ORDER BY created_at DESC 
       LIMIT 1`,
      [trimmedEmail, cleanOtp]
    );

    if (otpRecord.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid verification code. Please check your email or request a new one.' });
    }

    if (new Date(otpRecord.rows[0].expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new code.' });
    }

    // Mark OTP as verified
    await query(`UPDATE demo_email_otps SET verified = true WHERE id = $1`, [otpRecord.rows[0].id]);

    const appRequested = (productInterested || 'Dynamics 365 Finance & Operations').trim();
    const normalizedApp = normalizeProductKey(appRequested);

    // 1. Check permanent claim history first
    const claimHistory = await query(
      `SELECT id, demo_id, claimed_at, application_title 
       FROM demo_claims_history 
       WHERE LOWER(work_email) = $1 AND product_normalized = $2 
       LIMIT 1`,
      [trimmedEmail, normalizedApp]
    );

    // 2. STRICT CHECK: User cannot claim another demo from the same Email ID for this product (exact match on normalized application name)
    const existingSession = await query(
      `SELECT id, demo_id, status, expires_at, first_login_at, application 
       FROM demo_sessions 
       WHERE LOWER(work_email) = $1 
         AND (
           REGEXP_REPLACE(LOWER(application), '[^a-z0-9]', '', 'g') = $2
           OR LOWER(TRIM(application)) = LOWER(TRIM($3))
         )
       ORDER BY created_at DESC 
       LIMIT 1`,
      [trimmedEmail, normalizedApp, appRequested]
    );

    if (existingSession.rows.length > 0) {
      const prior = existingSession.rows[0];
      if (prior.status === 'active' || prior.status === 'ready') {
        return res.status(409).json({
          success: false,
          code: 'DEMO_ALREADY_ACTIVE',
          message: `A demo access for this email is already active (Demo ID: ${prior.demo_id}). Please check your inbox for login credentials or sign in directly.`
        });
      } else {
        return res.status(403).json({
          success: false,
          code: 'DEMO_ALREADY_CLAIMED',
          message: `You have already claimed your 6-hour demo access for this application with this email (${trimmedEmail}). Each email is eligible for exactly one trial. Contact us at info@flutterflirt.com for an extended pilot.`
        });
      }
    }

    if (claimHistory.rows.length > 0) {
      return res.status(403).json({
        success: false,
        code: 'DEMO_ALREADY_CLAIMED',
        message: `You have already claimed your 6-hour demo access for this application with this email (${trimmedEmail}). Each email is eligible for exactly one trial. Contact us at info@flutterflirt.com for an extended pilot.`
      });
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const demoId = `${productInterested?.includes('CRM') ? 'CRM' : 'ERP'}-DEMO-${randomSuffix}`;
    const cleanUsername = `${fullName.toLowerCase().split(' ')[0]}.${companyName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const plainPassword = `Demo${Math.random().toString(36).substring(2, 8).toUpperCase()}!2026`;
    const passwordHash = crypto.createHash('sha256').update(plainPassword).digest('hex');
    const now = new Date();

    // 1. Fetch matching product to retrieve its configured demo_url and direct demo_db_url
    let targetDemoUrl = 'https://demo.flutterflirt.com';
    let targetDemoDbUrl = null;

    try {
      const prodRes = await query(
        `SELECT demo_url, demo_db_url FROM saas_products 
         WHERE LOWER(title) = LOWER($1) OR LOWER(title) LIKE LOWER($2) 
         LIMIT 1`,
        [productInterested, `%${productInterested}%`]
      );
      if (prodRes.rows.length > 0) {
        if (prodRes.rows[0].demo_url) {
          targetDemoUrl = prodRes.rows[0].demo_url;
        }
        if (prodRes.rows[0].demo_db_url) {
          targetDemoDbUrl = prodRes.rows[0].demo_db_url;
        }
      }
    } catch (e) {
      console.warn('Could not query saas_products for demo URLs:', e.message);
    }

    // 2. If the product has a direct demo DB configured, create user in that project's database
    if (targetDemoDbUrl) {
      try {
        const productDbPool = new Pool({
          connectionString: targetDemoDbUrl,
          connectionTimeoutMillis: 5000,
        });

        // Compute bcrypt hash (standard for apps like Stock Pilot / WMS / CashPilot)
        const salt = await bcrypt.genSalt(10);
        const bcryptHash = await bcrypt.hash(plainPassword, salt);

        // Introspect target database tables
        const tablesRes = await productDbPool.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        const targetTables = tablesRes.rows.map(r => r.table_name.toLowerCase());

        let targetUserId = null;

        // Check columns of 'users' table in target project DB
        if (targetTables.includes('users')) {
          const usersTableInfo = await productDbPool.query(`
            SELECT column_name, data_type, udt_name 
            FROM information_schema.columns 
            WHERE table_schema='public' AND table_name='users'
          `);

          const colNames = usersTableInfo.rows.map(r => r.column_name);
          const hasPasswordHash = colNames.includes('password_hash');
          const hasPassword = colNames.includes('password');
          const hasRole = colNames.includes('role');
          const hasActive = colNames.includes('active');
          const hasPhone = colNames.includes('phone');
          const hasLastOrgId = colNames.includes('last_org_id');
          const hasLastCompanyId = colNames.includes('last_company_id');

          const pwCol = hasPasswordHash ? 'password_hash' : (hasPassword ? 'password' : null);
          const pwVal = hasPasswordHash ? bcryptHash : (hasPassword ? bcryptHash : plainPassword);

          // Detect role enum values for users table if role is an enum
          let userRoleValue = 'ADMIN';
          if (hasRole) {
            try {
              const enumRes = await productDbPool.query(`
                SELECT e.enumlabel 
                FROM pg_enum e 
                JOIN pg_type t ON e.enumtypid = t.oid 
                JOIN information_schema.columns c ON c.udt_name = t.typname 
                WHERE c.table_name = 'users' AND c.column_name = 'role'
              `);
              const enumLabels = enumRes.rows.map(e => e.enumlabel.toUpperCase());
              if (enumLabels.length > 0) {
                if (enumLabels.includes('OWNER')) userRoleValue = 'OWNER';
                else if (enumLabels.includes('ADMIN')) userRoleValue = 'ADMIN';
                else if (enumLabels.includes('MANAGER')) userRoleValue = 'MANAGER';
                else userRoleValue = enumLabels[0];
              }
            } catch (err) {
              console.warn('[Role Enum Introspection Warning]:', err.message);
            }
          }

          // Check if user already exists
          const existing = await productDbPool.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [workEmail]);

          if (existing.rows.length > 0) {
            targetUserId = existing.rows[0].id;
            // Update password so user can login with their fresh credentials
            if (pwCol) {
              await productDbPool.query(`UPDATE users SET "${pwCol}" = $1, name = $2 WHERE id = $3`, [pwVal, fullName, targetUserId]);
            }
          } else {
            // Insert new user into users table
            let insertCols = ['name', 'email'];
            let insertVals = [fullName, workEmail];
            let placeholders = ['$1', '$2'];
            let idx = 3;

            if (pwCol) {
              insertCols.push(`"${pwCol}"`);
              insertVals.push(pwVal);
              placeholders.push(`$${idx++}`);
            }

            if (hasRole) {
              insertCols.push('role');
              insertVals.push(userRoleValue);
              placeholders.push(`$${idx++}`);
            }

            if (hasActive) {
              insertCols.push('active');
              insertVals.push(true);
              placeholders.push(`$${idx++}`);
            }

            if (hasPhone && phoneNumber) {
              insertCols.push('phone');
              insertVals.push(phoneNumber);
              placeholders.push(`$${idx++}`);
            }

            const insertSql = `INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`;
            const userInsertRes = await productDbPool.query(insertSql, insertVals);
            targetUserId = userInsertRes.rows[0].id;
          }
          console.log(`[Demo Provision] User record active (ID: ${targetUserId}) for ${workEmail}`);

          // --- SMART MULTI-TENANCY ATTACHMENT (Organizations / Companies / Memberships) ---

          // 1. Handle organizations (e.g. CashPilot)
          if (targetTables.includes('organizations')) {
            let orgId = null;
            // Check if organization already exists with this name or for this user
            const existingOrg = await productDbPool.query(`SELECT id FROM organizations LIMIT 1`);
            if (existingOrg.rows.length > 0) {
              orgId = existingOrg.rows[0].id;
            } else {
              const orgRes = await productDbPool.query(
                `INSERT INTO organizations (name, business_type, currency) VALUES ($1, 'SERVICES', 'INR') RETURNING id`,
                [companyName || 'My Business Enterprise']
              );
              orgId = orgRes.rows[0].id;
            }

            if (hasLastOrgId && targetUserId && orgId) {
              await productDbPool.query(`UPDATE users SET last_org_id = $1 WHERE id = $2`, [orgId, targetUserId]);
            }

            // Ensure membership link
            if (targetTables.includes('memberships') && targetUserId && orgId) {
              const memColsRes = await productDbPool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema='public' AND table_name='memberships'
              `);
              const memCols = memColsRes.rows.map(c => c.column_name.toLowerCase());
              if (memCols.includes('org_id') && memCols.includes('user_id')) {
                // Determine membership role (default 'OWNER')
                let memRole = 'OWNER';
                try {
                  const rEnumRes = await productDbPool.query(`
                    SELECT e.enumlabel FROM pg_enum e 
                    JOIN pg_type t ON e.enumtypid = t.oid 
                    JOIN information_schema.columns c ON c.udt_name = t.typname 
                    WHERE c.table_name = 'memberships' AND c.column_name = 'role'
                  `);
                  const rLabels = rEnumRes.rows.map(e => e.enumlabel.toUpperCase());
                  if (rLabels.length > 0) {
                    if (rLabels.includes('OWNER')) memRole = 'OWNER';
                    else if (rLabels.includes('ADMIN')) memRole = 'ADMIN';
                    else memRole = rLabels[0];
                  }
                } catch (_) {}

                await productDbPool.query(`
                  INSERT INTO memberships (org_id, user_id, role) 
                  VALUES ($1, $2, $3) 
                  ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
                `, [orgId, targetUserId, memRole]);
                console.log(`[Demo Provision] Created organization membership (Org: ${orgId}, User: ${targetUserId}, Role: ${memRole})`);
              }
            }
          }

          // 2. Handle companies (e.g. LedgerPilot)
          if (targetTables.includes('companies')) {
            let companyId = null;
            const existingComp = await productDbPool.query(`SELECT id FROM companies LIMIT 1`);
            if (existingComp.rows.length > 0) {
              companyId = existingComp.rows[0].id;
            } else {
              const compRes = await productDbPool.query(
                `INSERT INTO companies (name, currency) VALUES ($1, 'INR') RETURNING id`,
                [companyName || 'My Global Company']
              );
              companyId = compRes.rows[0].id;
            }

            if (hasLastCompanyId && targetUserId && companyId) {
              await productDbPool.query(`UPDATE users SET last_company_id = $1 WHERE id = $2`, [companyId, targetUserId]);
            }

            // Ensure company membership link
            if (targetTables.includes('memberships') && targetUserId && companyId) {
              const memColsRes = await productDbPool.query(`
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema='public' AND table_name='memberships'
              `);
              const memCols = memColsRes.rows.map(c => c.column_name.toLowerCase());
              if (memCols.includes('company_id') && memCols.includes('user_id')) {
                let compRole = 'OWNER';
                try {
                  const rEnumRes = await productDbPool.query(`
                    SELECT e.enumlabel FROM pg_enum e 
                    JOIN pg_type t ON e.enumtypid = t.oid 
                    JOIN information_schema.columns c ON c.udt_name = t.typname 
                    WHERE c.table_name = 'memberships' AND c.column_name = 'role'
                  `);
                  const rLabels = rEnumRes.rows.map(e => e.enumlabel.toUpperCase());
                  if (rLabels.length > 0) {
                    if (rLabels.includes('OWNER')) compRole = 'OWNER';
                    else if (rLabels.includes('ADMIN')) compRole = 'ADMIN';
                    else compRole = rLabels[0];
                  }
                } catch (_) {}

                await productDbPool.query(`
                  INSERT INTO memberships (company_id, user_id, role) 
                  VALUES ($1, $2, $3) 
                  ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role
                `, [companyId, targetUserId, compRole]);
                console.log(`[Demo Provision] Created company membership (Company: ${companyId}, User: ${targetUserId}, Role: ${compRole})`);
              }
            }
          }
        }

        // Also ensure demo_users backup table is kept updated for fast audit
        await productDbPool.query(`
          CREATE TABLE IF NOT EXISTS demo_users (
            id SERIAL PRIMARY KEY,
            demo_id VARCHAR(50),
            name VARCHAR(255),
            email VARCHAR(255) UNIQUE,
            username VARCHAR(100) UNIQUE,
            password TEXT,
            password_hash TEXT,
            role VARCHAR(50) DEFAULT 'admin',
            status VARCHAR(50) DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);

        await productDbPool.query(
          `INSERT INTO demo_users (demo_id, name, email, username, password, password_hash, role, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', 'active')
           ON CONFLICT (email) DO UPDATE 
           SET username = EXCLUDED.username, password = EXCLUDED.password, password_hash = EXCLUDED.password_hash`,
          [demoId, fullName, workEmail, cleanUsername, plainPassword, bcryptHash]
        );

        await productDbPool.end();
      } catch (dbErr) {
        console.error(`[Demo Provision Error] Failed to insert into project demo DB: ${dbErr.message}`);
      }
    }

    // 3. Insert into central demo_sessions table
    const result = await query(
      `INSERT INTO demo_sessions 
       (demo_id, customer_name, work_email, phone_number, company_name, company_size, application, target_subdomain, username, password_hash, temp_password_plain, notes, status, approved_at, credentials_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ready', $13, $13)
       RETURNING *`,
      [
        demoId,
        fullName,
        workEmail,
        phoneNumber || '',
        companyName,
        companySize || '10-50 employees',
        productInterested || 'Dynamics 365 Finance & Operations',
        targetDemoUrl,
        cleanUsername,
        passwordHash,
        plainPassword,
        notes || '',
        now,
      ]
    );

    const session = result.rows[0];

    // Permanently record in demo_claims_history so user cannot reclaim demo even if session is deleted
    try {
      await query(
        `INSERT INTO demo_claims_history (work_email, product_normalized, application_title, demo_id, claimed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [trimmedEmail, normalizedApp, productInterested || 'Dynamics 365 Finance & Operations', demoId, now]
      );
    } catch (claimErr) {
      console.warn('Failed to record demo claim history:', claimErr.message);
    }

    // INSTANT EMAIL DISPATCH TO USER WITH ACCURATE DEMO URL & CREDENTIALS
    if (process.env.SMTP_USER) {
      try {
        const demoLoginUrl = targetDemoUrl;
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"FlutterFlirt Enterprise Solutions" <${process.env.SMTP_USER}>`,
          to: workEmail,
          subject: `Your ${session.application} Demo Credentials [${session.demo_id}]`,
          html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Demo Access Credentials</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#172554;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:30px 12px;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" border="0"
style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 15px rgba(0,0,0,0.05);">

<!-- HEADER -->
<tr>
<td style="background:#0755c9;padding:30px 32px;color:#ffffff;">
  <h1 style="margin:0;font-size:27px;">FlutterFlirt</h1>
  <p style="margin:5px 0 0;font-size:13px;color:#dbeafe;">
    Cloud ERP &amp; CRM
  </p>
  <h2 style="margin:30px 0 0;font-size:28px;">
    Demo Access Credentials
  </h2>
  <p style="margin:8px 0 0;color:#dbeafe;font-size:14px;">
    Your workspace is ready to explore.
  </p>
</td>
</tr>

<!-- MESSAGE -->
<tr>
<td style="padding:30px 32px 15px;">
  <h2 style="font-size:21px;margin:0 0 14px;color:#0f172a;">
    Hello ${fullName},
  </h2>
  <p style="font-size:15px;line-height:1.7;color:#475569;margin:0;">
    Thank you for requesting access to
    <strong>FlutterFlirt Cloud ERP &amp; CRM.</strong>
    Your demo environment for <strong>${session.application}</strong>
    has been successfully provisioned.
  </p>
</td>
</tr>

<!-- PRODUCT -->
<tr>
<td style="padding:12px 32px;">
  <table width="100%" cellpadding="0" cellspacing="0"
  style="background:#eff6ff;border:1px solid #dbeafe;border-radius:9px;">
    <tr>
      <td style="padding:18px;">
        <h3 style="margin:0;color:#0755c9;font-size:19px;">${session.application}</h3>
        <p style="margin:6px 0 0;color:#475569;font-size:14px;">
          Interactive Shared B2B SaaS Demo Environment
        </p>
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- CREDENTIALS -->
<tr>
<td style="padding:20px 32px;">
  <h3 style="font-size:18px;color:#0f172a;margin:0 0 18px;">
    Your Demo Access Details
  </h3>

  <table width="100%" cellpadding="0" cellspacing="0"
  style="border:1px solid #e2e8f0;border-radius:9px;">
    <tr>
      <td style="padding:14px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 6px;color:#64748b;font-size:12px;">DEMO ACCESS URL</p>
        <a href="${demoLoginUrl}"
        style="color:#0755c9;font-weight:bold;word-break:break-all;">
          ${demoLoginUrl}
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:14px;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0 0 6px;color:#64748b;font-size:12px;">LOGIN EMAIL / USERNAME</p>
        <strong style="font-size:15px;">${workEmail}</strong>
        <p style="margin:5px 0 0;color:#64748b;font-size:13px;">
          Username handle: ${cleanUsername}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px;">
        <p style="margin:0 0 6px;color:#64748b;font-size:12px;">TEMPORARY PASSWORD</p>
        <strong style="font-size:17px;color:#0755c9;">
          ${plainPassword}
        </strong>
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- BUTTON -->
<tr>
<td align="center" style="padding:5px 32px 25px;">
  <a href="${demoLoginUrl}"
  style="display:inline-block;background:#0755c9;color:#ffffff;
  text-decoration:none;padding:15px 32px;border-radius:7px;
  font-size:15px;font-weight:bold;">
    Launch Demo Sandbox &nbsp; →
  </a>
</td>
</tr>

<!-- VALIDITY -->
<tr>
<td style="padding:0 32px 25px;">
  <table width="100%" cellpadding="0" cellspacing="0"
  style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;">
    <tr>
      <td style="padding:17px;">
        <strong style="font-size:16px;color:#0755c9;">
          6-Hour Demo Validity
        </strong>
        <p style="margin:7px 0 0;font-size:14px;line-height:1.6;color:#334155;">
          Your 6 hours of uninterrupted evaluation start strictly
          when you log in for the first time. Your access will
          automatically expire after 6 hours.
        </p>
      </td>
    </tr>
  </table>
</td>
</tr>

<!-- SUPPORT -->
<tr>
<td style="padding:5px 32px 30px;">
  <strong style="font-size:16px;color:#0f172a;">Need Assistance?</strong>
  <p style="font-size:14px;line-height:1.6;color:#475569;margin:7px 0 0;">
    If you face any difficulty accessing your demo workspace,
    contact our support team at
    <a href="mailto:info@flutterflirt.com"
    style="color:#0755c9;font-weight:bold;">
      info@flutterflirt.com
    </a>.
  </p>
</td>
</tr>

<!-- FOOTER -->
<tr>
<td align="center" style="background:#0f2d55;padding:23px;color:#ffffff;">
  <strong style="font-size:16px;">FlutterFlirt Solutions</strong>
  <p style="font-size:12px;color:#bfdbfe;margin:8px 0;">
    Enterprise Cloud Platform for Modern Businesses
  </p>
  <a href="https://flutterflirt.com"
  style="font-size:12px;color:#ffffff;text-decoration:none;">
    www.flutterflirt.com
  </a>
  <p style="font-size:11px;color:#bfdbfe;margin:15px 0 0;">
    This email contains confidential login credentials.
    Please do not share them with unauthorized individuals.
  </p>
</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>
          `,
        });
      } catch (mailErr) {
        console.warn('Could not dispatch instant credential email:', mailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: `Demo credentials and login URL have been emailed to ${workEmail}.`,
      session: normalizeSession(session),
    });
  } catch (error) {
    console.error('Error in submitDemoRequest:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit demo request' });
  }
};

// 2. ADMIN: List all demo sessions
const getAllDemoSessions = async (req, res) => {
  try {
    await ensureDemoSessionsTable();
    await seedDefaultDemos();

    // 1. Immediately expire any sessions whose 6 hours / expires_at has passed
    try {
      await checkAndExpireSessions();
    } catch (expireErr) {
      console.warn('Inline checkAndExpireSessions warning:', expireErr.message);
    }

    // Check if any 'ready' demo sessions have logged into their target product DB
    try {
      const readySessions = await query(
        `SELECT ds.id, ds.work_email, ds.application, p.demo_db_url 
         FROM demo_sessions ds
         LEFT JOIN saas_products p ON (
           REGEXP_REPLACE(LOWER(p.title), '\\s+', '', 'g') = REGEXP_REPLACE(LOWER(ds.application), '\\s+', '', 'g')
           OR LOWER(p.title) LIKE LOWER('%' || ds.application || '%')
           OR LOWER(ds.application) LIKE LOWER('%' || p.title || '%')
         )
         WHERE ds.status = 'ready' AND ds.first_login_at IS NULL AND p.demo_db_url IS NOT NULL AND p.demo_db_url != ''`
      );

      // Check ready sessions in parallel with strict timeout so admin endpoint responds within milliseconds
      await Promise.allSettled(
        readySessions.rows.map(async (row) => {
          let targetPool = null;
          try {
            targetPool = new Pool({
              connectionString: row.demo_db_url,
              connectionTimeoutMillis: 2000,
              ssl: { rejectUnauthorized: false }
            });
            
            let hasLoggedIn = false;
            let loginTimestamp = new Date();

            // Check 1: User's last_login or audit_log or demo_user_logins
            const targetTablesRes = await targetPool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
            const targetTables = targetTablesRes.rows.map(t => t.table_name.toLowerCase());

            // A. If target has audit_log (e.g. Cashpilot)
            if (targetTables.includes('audit_log')) {
              const auditCheck = await targetPool.query(`
                SELECT a.created_at 
                FROM audit_log a
                JOIN users u ON a.user_id = u.id
                WHERE LOWER(u.email) = LOWER($1)
                ORDER BY a.created_at ASC
                LIMIT 1
              `, [row.work_email]);
              if (auditCheck.rows.length > 0) {
                hasLoggedIn = true;
                loginTimestamp = new Date(auditCheck.rows[0].created_at);
              }
            }

            // B. Check users table for last_login / last_login_at / login_count
            if (!hasLoggedIn && targetTables.includes('users')) {
              const uColsRes = await targetPool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users'`);
              const uCols = uColsRes.rows.map(c => c.column_name.toLowerCase());
              
              if (uCols.includes('last_login')) {
                const uLogin = await targetPool.query(`SELECT last_login FROM users WHERE LOWER(email) = LOWER($1) AND last_login IS NOT NULL LIMIT 1`, [row.work_email]);
                if (uLogin.rows.length > 0 && uLogin.rows[0].last_login) {
                  hasLoggedIn = true;
                  loginTimestamp = new Date(uLogin.rows[0].last_login);
                }
              }
              if (!hasLoggedIn && uCols.includes('last_login_at')) {
                const uLogin = await targetPool.query(`SELECT last_login_at FROM users WHERE LOWER(email) = LOWER($1) AND last_login_at IS NOT NULL LIMIT 1`, [row.work_email]);
                if (uLogin.rows.length > 0 && uLogin.rows[0].last_login_at) {
                  hasLoggedIn = true;
                  loginTimestamp = new Date(uLogin.rows[0].last_login_at);
                }
              }
              if (!hasLoggedIn && uCols.includes('login_count')) {
                const uLogin = await targetPool.query(`SELECT login_count FROM users WHERE LOWER(email) = LOWER($1) AND login_count > 0 LIMIT 1`, [row.work_email]);
                if (uLogin.rows.length > 0 && parseInt(uLogin.rows[0].login_count, 10) > 0) {
                  hasLoggedIn = true;
                }
              }
            }

            // C. Check demo_users table if present (covers apps maintaining demo_users telemetry)
            if (!hasLoggedIn && targetTables.includes('demo_users')) {
              const dColsRes = await targetPool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='demo_users'`);
              const dCols = dColsRes.rows.map(c => c.column_name.toLowerCase());
              const queryCols = ['first_login_at', 'last_login_at', 'login_count'].filter(c => dCols.includes(c));
              if (queryCols.length > 0) {
                const dUser = await targetPool.query(
                  `SELECT ${queryCols.join(', ')} FROM demo_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
                  [row.work_email]
                );
                if (dUser.rows.length > 0) {
                  const u = dUser.rows[0];
                  if (u.first_login_at || u.last_login_at || (u.login_count && parseInt(u.login_count, 10) > 0)) {
                    hasLoggedIn = true;
                    loginTimestamp = new Date(u.first_login_at || u.last_login_at || Date.now());
                  }
                }
              }
            }

            // D. FMCG & Enterprise App Activity Check (orders, sales, collections, outlets, claims created by or during user session)
            if (!hasLoggedIn) {
              const activityTables = ['orders', 'sales_orders', 'collections', 'delivery_trips', 'purchase_orders'];
              for (const actTbl of activityTables) {
                if (targetTables.includes(actTbl)) {
                  try {
                    const actRes = await targetPool.query(
                      `SELECT created_at FROM "${actTbl}" 
                       WHERE created_at > (SELECT created_at FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1)
                       ORDER BY created_at DESC LIMIT 1`,
                      [row.work_email]
                    );
                    if (actRes.rows.length > 0 && actRes.rows[0].created_at) {
                      hasLoggedIn = true;
                      loginTimestamp = new Date(actRes.rows[0].created_at);
                      break;
                    }
                  } catch (_) {}
                }
              }
            }

            // E. Fallback: pg_stat_statements query tracker (covers ChainPilot, LedgerPilot, etc.)
            if (!hasLoggedIn) {
              try {
                const stat = await targetPool.query(
                  `SELECT calls FROM pg_stat_statements 
                   WHERE (
                     query ~* 'from\\s+users\\s+where.*email' 
                     OR query ~* 'lower\\(email\\)' 
                     OR query ILIKE '%users%email%'
                   ) 
                   AND calls > 0 
                   LIMIT 1`
                );
                if (stat.rows.length > 0 && parseInt(stat.rows[0].calls, 10) > 0) {
                  hasLoggedIn = true;
                }
              } catch (_) {}
            }

            if (hasLoggedIn) {
              const expiresAt = new Date(loginTimestamp.getTime() + 6 * 60 * 60 * 1000); // 6 hours demo timer
              const isAlreadyExpired = expiresAt.getTime() <= Date.now();
              const targetStatus = isAlreadyExpired ? 'expired' : 'active';
              const initialLog = [{ event: "First Successful Login via Product App", timestamp: loginTimestamp.toISOString(), client: row.application }];
              await query(
                `UPDATE demo_sessions
                 SET first_login_at = $1, expires_at = $2, last_login_at = $1, status = $3, login_count = COALESCE(login_count, 0) + 1, activity_log = $4
                 WHERE id = $5`,
                [loginTimestamp, expiresAt, targetStatus, JSON.stringify(initialLog), row.id]
              );
            }
          } catch (subErr) {
            // ignore individual db check error
          } finally {
            if (targetPool) {
              try { await targetPool.end(); } catch (_) {}
            }
          }
        })
      );
    } catch (syncErr) {
      console.warn('Sync ready sessions check failed:', syncErr.message);
    }

    const result = await query(`SELECT * FROM demo_sessions ORDER BY created_at DESC`);
    return res.status(200).json({
      success: true,
      sessions: result.rows.map(normalizeSession),
    });
  } catch (error) {
    console.error('Error in getAllDemoSessions:', error);
    return res.status(500).json({ success: false, message: 'Failed to load demo sessions' });
  }
};

// 3. ADMIN: Approve Demo Request & Dispatch Credentials
const approveDemoRequest = async (req, res) => {
  try {
    await ensureDemoSessionsTable();
    const { id } = req.params;
    const { sendEmail } = req.body;

    const sessionRes = await query(`SELECT * FROM demo_sessions WHERE id = $1`, [id]);
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Demo request not found' });
    }

    const session = sessionRes.rows[0];
    const now = new Date();

    // Set approved_at, credentials_sent_at, and transition to 'ready'
    // TIMER IS DELIBERATELY NOT STARTED HERE (first_login_at & expires_at stay NULL)
    const updated = await query(
      `UPDATE demo_sessions
       SET status = 'ready', approved_at = COALESCE(approved_at, $1), credentials_sent_at = $1
       WHERE id = $2
       RETURNING *`,
      [now, id]
    );

    // Optional email dispatch with formatted HTML email
    if (sendEmail !== false && process.env.SMTP_USER) {
      try {
        const demoLoginUrl = `https://${session.target_subdomain}`;
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"FlutterFlirt Enterprise Solutions" <${process.env.SMTP_USER}>`,
          to: session.work_email,
          subject: `Your ${session.application} Demo Access is Ready [${session.demo_id}]`,
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
                .card { max-width: 580px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
                .header { background: #0f172a; padding: 32px 36px; text-align: left; }
                .brand { color: #60a5fa; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 8px; }
                .title { color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; }
                .content { padding: 36px; }
                .greeting { font-size: 16px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
                .text { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
                .creds-box { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 14px; padding: 20px; margin-bottom: 24px; }
                .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #cbd5e1; }
                .row:last-child { border-bottom: none; }
                .label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748b; }
                .value { font-size: 13px; font-weight: 700; color: #0f172a; font-family: monospace; }
                .highlight { color: #2563eb; }
                .btn { display: inline-block; background: #2563eb; color: #ffffff !important; text-decoration: none; font-size: 14px; font-weight: 700; padding: 14px 28px; border-radius: 12px; margin-top: 8px; text-align: center; }
                .timer-notice { background: #eff6ff; border-left: 4px solid #2563eb; padding: 14px 18px; border-radius: 0 10px 10px 0; margin-top: 24px; font-size: 13px; line-height: 1.5; color: #1e40af; }
                .footer { padding: 24px 36px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="header">
                  <div class="brand">FlutterFlirt Cloud ERP & CRM</div>
                  <h1 class="title">Demo Access Provisioned</h1>
                </div>
                <div class="content">
                  <div class="greeting">Hello ${session.customer_name},</div>
                  <p class="text">
                    Your requested sandbox for <strong>${session.application}</strong> at <strong>${session.company_name}</strong> is now ready for exploration.
                  </p>

                  <div class="creds-box">
                    <div style="margin-bottom: 12px;">
                      <div class="label">Demo Access URL</div>
                      <div style="margin-top: 4px;"><a href="${demoLoginUrl}" style="color: #2563eb; font-weight: 700; font-size: 14px; text-decoration: none;">${demoLoginUrl}</a></div>
                    </div>
                    <div style="margin-bottom: 12px;">
                      <div class="label">Login Email / Username</div>
                      <div class="value" style="margin-top: 4px; font-size: 15px; color: #0f172a;">${session.work_email}</div>
                      <div style="font-size: 12px; color: #64748b; margin-top: 2px;">(Username handle: ${session.username})</div>
                    </div>
                    <div>
                      <div class="label">Temporary Password</div>
                      <div class="value" style="margin-top: 4px; font-size: 15px; color: #2563eb;">${session.temp_password_plain}</div>
                    </div>
                  </div>

                  <div style="text-align: center; margin: 28px 0;">
                    <a href="${demoLoginUrl}" class="btn">Launch Demo Sandbox &rarr;</a>
                  </div>

                  <div class="timer-notice">
                    <strong>⏳ 6-Hour Guarantee:</strong> Your 6 hours of evaluation begins strictly when you <strong>log in for the first time</strong>. No evaluation time has been consumed yet.
                  </div>
                </div>
                <div class="footer">
                  FlutterFlirt Solutions &bull; Enterprise Cloud Platform &bull; Need help? Contact info@flutterflirt.com
                </div>
              </div>
            </body>
            </html>
          `,
        });
      } catch (mailErr) {
        console.warn('Could not dispatch credential email:', mailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Demo request approved! Status set to Ready. 6-hour timer will start when user logs in.',
      session: normalizeSession(updated.rows[0]),
    });
  } catch (error) {
    console.error('Error in approveDemoRequest:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve demo request' });
  }
};

// 4. GATEWAY AUTHENTICATOR (Detects First Login and starts 48-hour timer)
const gatewayAuthenticate = async (req, res) => {
  try {
    await ensureDemoSessionsTable();
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    const hashedInput = crypto.createHash('sha256').update(password).digest('hex');

    const result = await query(
      `SELECT * FROM demo_sessions WHERE LOWER(username) = LOWER($1) OR LOWER(work_email) = LOWER($1)`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid demo credentials' });
    }

    const session = result.rows[0];

    // Password verification (check hashed or plain fallback)
    if (session.password_hash !== hashedInput && session.temp_password_plain !== password) {
      return res.status(401).json({ success: false, message: 'Invalid demo credentials' });
    }

    // Check account status
    if (session.status === 'revoked') {
      return res.status(403).json({ success: false, message: 'This demo session has been revoked by admin.' });
    }
    if (session.status === 'expired') {
      return res.status(403).json({ success: false, message: 'Your 6-hour demo session has expired. Contact sales for an extension.' });
    }

    const now = new Date();

    // FIRST LOGIN CHECK:
    if (!session.first_login_at) {
      // Exactly 6 hours from NOW
      const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const initialLog = [{ event: "First Successful Login", timestamp: now.toISOString(), ip: req.ip || "Direct Gateway" }];

      const activatedRes = await query(
        `UPDATE demo_sessions 
         SET first_login_at = $1, expires_at = $2, last_login_at = $1, status = 'active', login_count = 1, activity_log = $3
         WHERE id = $4
         RETURNING *`,
        [now, expiresAt, JSON.stringify(initialLog), session.id]
      );

      // Trigger Demo Activation Email
      if (process.env.SMTP_USER) {
        try {
          transporter.sendMail({
            from: process.env.SMTP_FROM || `"FlutterFlirt Cloud ERP" <${process.env.SMTP_USER}>`,
            to: session.work_email,
            subject: `Demo Activated: 6-Hour Timer Started [${session.demo_id}]`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; color: #1e293b; line-height: 1.6;">
                <h2 style="color: #16a34a;">Demo Session Successfully Activated!</h2>
                <p>Hello <strong>${session.customer_name}</strong>,</p>
                <p>You have successfully signed in to <strong>${session.application}</strong> for the first time.</p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0 0 6px;"><strong>First Login Time:</strong> ${now.toUTCString()}</p>
                  <p style="margin: 0 0 6px;"><strong>Valid Until:</strong> ${expiresAt.toUTCString()} (Exactly 6 Hours)</p>
                  <p style="margin: 0;"><strong>Active Demo ID:</strong> ${session.demo_id}</p>
                </div>
                <p>Enjoy exploring all enterprise capabilities. Our technical architecture team is on standby should you have any questions.</p>
              </div>
            `,
          }).catch(e => console.warn('Activation email error:', e.message));
        } catch (e) {
          console.warn('Mail exception:', e);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Welcome! Your 6-hour demo access has been activated.',
        isFirstLogin: true,
        session: normalizeSession(activatedRes.rows[0]),
      });
    } else {
      // SUBSEQUENT LOGIN: Check if expired
      if (new Date(session.expires_at) <= now) {
        await query(`UPDATE demo_sessions SET status = 'expired' WHERE id = $1`, [session.id]);
        return res.status(403).json({ success: false, message: 'Your 6-hour demo session has expired.' });
      }

      // Record subsequent login timestamp WITHOUT restarting or modifying expires_at
      const newLog = Array.isArray(session.activity_log) ? session.activity_log : [];
      newLog.unshift({ event: "Return Login", timestamp: now.toISOString(), ip: req.ip || "Direct Gateway" });

      const updatedRes = await query(
        `UPDATE demo_sessions 
         SET last_login_at = $1, login_count = COALESCE(login_count, 0) + 1, activity_log = $2 
         WHERE id = $3 
         RETURNING *`,
        [now, JSON.stringify(newLog.slice(0, 50)), session.id]
      );

      return res.status(200).json({
        success: true,
        message: 'Authentication successful. Welcome back.',
        isFirstLogin: false,
        session: normalizeSession(updatedRes.rows[0]),
      });
    }
  } catch (error) {
    console.error('Error in gatewayAuthenticate:', error);
    return res.status(500).json({ success: false, message: 'Authentication gateway failure' });
  }
};

// 5. ADMIN: Extend Demo Expiry (+24h or +48h or custom date)
const extendDemoExpiry = async (req, res) => {
  try {
    await ensureDemoSessionsTable();
    const { id } = req.params;
    const { additionalHours } = req.body;

    const sessionRes = await query(`SELECT * FROM demo_sessions WHERE id = $1`, [id]);
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Demo session not found' });
    }

    const session = sessionRes.rows[0];
    const addMs = (parseInt(additionalHours, 10) || 24) * 60 * 60 * 1000;

    // Base extension from current expires_at if in the future, or from now if already expired
    const baseTime = session.expires_at && new Date(session.expires_at) > new Date()
      ? new Date(session.expires_at)
      : new Date();

    const newExpiry = new Date(baseTime.getTime() + addMs);

    const updated = await query(
      `UPDATE demo_sessions 
       SET expires_at = $1, status = 'active'
       WHERE id = $2
       RETURNING *`,
      [newExpiry, id]
    );

    return res.status(200).json({
      success: true,
      message: `Demo successfully extended by ${additionalHours || 24} hours.`,
      session: normalizeSession(updated.rows[0]),
    });
  } catch (error) {
    console.error('Error in extendDemoExpiry:', error);
    return res.status(500).json({ success: false, message: 'Failed to extend demo expiry' });
  }
};

// 6. ADMIN: Revoke or Delete Demo Session
const deleteDemoSession = async (req, res) => {
  try {
    await ensureDemoSessionsTable();
    const { id } = req.params;
    await query(`DELETE FROM demo_sessions WHERE id = $1`, [id]);
    return res.status(200).json({ success: true, message: 'Demo session deleted successfully' });
  } catch (error) {
    console.error('Error in deleteDemoSession:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete demo session' });
  }
};

// 7. BACKGROUND SCHEDULER: Check and expire demo sessions, delete/revoke credentials
const checkAndExpireSessions = async () => {
  try {
    await ensureDemoSessionsTable();
    const now = new Date();
    const expiredCandidates = await query(
      `SELECT ds.*, p.demo_db_url 
       FROM demo_sessions ds
       LEFT JOIN saas_products p ON (
         REGEXP_REPLACE(LOWER(p.title), '\\s+', '', 'g') = REGEXP_REPLACE(LOWER(ds.application), '\\s+', '', 'g')
         OR LOWER(p.title) LIKE LOWER('%' || ds.application || '%')
         OR LOWER(ds.application) LIKE LOWER('%' || p.title || '%')
       )
       WHERE ds.status = 'active' AND ds.expires_at IS NOT NULL AND ds.expires_at <= $1`,
      [now]
    );

    if (expiredCandidates.rows.length > 0) {
      console.log(`[Expiry Scheduler] Expiring and cleaning up ${expiredCandidates.rows.length} session(s).`);
      for (const row of expiredCandidates.rows) {
        // 1. Mark session as expired in central DB
        await query(
          `UPDATE demo_sessions 
           SET status = 'expired', temp_password_plain = NULL 
           WHERE id = $1`,
          [row.id]
        );

        // 2. Automatically delete/deactivate user from the project's demo DB (e.g. Stock Pilot Neon DB)
        if (row.demo_db_url) {
          try {
            const projectDbPool = new Pool({
              connectionString: row.demo_db_url,
              connectionTimeoutMillis: 5000,
            });

            // Delete or deactivate from 'users' table
            await projectDbPool.query(
              `DELETE FROM users WHERE LOWER(email) = LOWER($1)`,
              [row.work_email]
            );

            // Also delete from 'demo_users' table if exists
            await projectDbPool.query(
              `DELETE FROM demo_users WHERE LOWER(email) = LOWER($1)`,
              [row.work_email]
            );

            await projectDbPool.end();
            console.log(`[Expiry Scheduler] Successfully purged credentials for ${row.work_email} from target demo DB.`);
          } catch (cleanErr) {
            console.warn(`[Expiry Scheduler] Error cleaning project demo DB for ${row.work_email}:`, cleanErr.message);
          }
        }

        // 3. Notify user their 6 hours have ended
        if (process.env.SMTP_USER) {
          try {
            transporter.sendMail({
              from: process.env.SMTP_FROM || `"FlutterFlirt Enterprise" <${process.env.SMTP_USER}>`,
              to: row.work_email,
              subject: `Your 6-Hour Demo Access Has Concluded [${row.demo_id}]`,
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; background-color: #ffffff;">
                  <div style="border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
                    <span style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #059669; background: #ecfdf5; padding: 4px 10px; border-radius: 20px;">
                      Demo Concluded
                    </span>
                    <h2 style="color: #0f172a; margin-top: 12px; margin-bottom: 4px; font-size: 22px;">
                      Thank you for evaluating ${row.application}
                    </h2>
                  </div>

                  <p style="margin: 0 0 16px; font-size: 15px;">Hello <strong>${row.customer_name}</strong>,</p>
                  
                  <p style="margin: 0 0 16px; font-size: 14.5px; color: #475569;">
                    Your 6-hour hands-on evaluation access for <strong>${row.application}</strong> has concluded, and your temporary credentials have been automatically decommissioned.
                  </p>

                  <p style="margin: 0 0 24px; font-size: 14.5px; color: #475569;">
                    We hope you experienced how effortlessly the platform streamlines your workflow and enterprise operations.
                  </p>

                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="margin: 0 0 8px; font-size: 15px; color: #0f172a;">Ready to purchase or deploy for your business?</h3>
                    <p style="margin: 0 0 16px; font-size: 13.5px; color: #64748b;">
                      Get in touch with our product team to purchase a commercial license, discuss dedicated custom deployment, or request pricing tailored to your organization.
                    </p>
                    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                      <a href="mailto:info@flutterflirt.com?subject=Purchase Inquiry for ${encodeURIComponent(row.application)}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">
                        Purchase Inquiry (Email Us)
                      </a>
                      <a href="tel:+918926104326" style="display: inline-block; background-color: #ffffff; color: #0f172a; border: 1px solid #cbd5e1; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600;">
                        Call: +91 8926 104 326
                      </a>
                    </div>
                  </div>

                  <p style="margin: 0; font-size: 13px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px;">
                    FlutterFlirt Technologies &bull; Direct Support: <a href="mailto:info@flutterflirt.com" style="color: #059669; text-decoration: none;">info@flutterflirt.com</a> | Call: <a href="tel:+918926104326" style="color: #059669; text-decoration: none;">+91 8926 104 326</a>
                  </p>
                </div>
              `,
            }).catch(e => console.warn('Expiry mail failed:', e.message));
          } catch (e) {
            console.warn('Mail exception:', e);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Expiry Scheduler Error]:', err.message);
  }
};

module.exports = {
  ensureDemoSessionsTable,
  sendDemoOtp,
  submitDemoRequest,
  getAllDemoSessions,
  approveDemoRequest,
  gatewayAuthenticate,
  extendDemoExpiry,
  deleteDemoSession,
  checkAndExpireSessions,
};
