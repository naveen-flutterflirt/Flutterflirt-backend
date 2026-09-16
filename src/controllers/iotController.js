const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const slugify = require('slugify');
const path = require('path');
const { pool } = require('../config/db');

// Helper to get S3 client
const getS3Client = () => {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION } = process.env;
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION) {
    return null;
  }
  return new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });
};

// Helper: verify if request has valid kit access token or admin token
const verifyAccess = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Valid if admin login OR IoT kit verified access
    if (decoded.role === 'admin' || decoded.is_kit_unlocked === true || decoded.access === 'iot_lectures' || decoded.verified) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

// -------------------------------------------------------------
// PUBLIC & STUDENT CONTROLLERS
// -------------------------------------------------------------

// GET /api/iot/lectures
exports.getPublicLectures = async (req, res) => {
  try {
    const isUnlocked = verifyAccess(req);

    const query = `
      SELECT id, title, slug, description, duration, sequence_order, is_preview, thumbnail_url, resources, status, created_at, s3_key, video_url
      FROM iot_lectures
      WHERE status = 'published'
      ORDER BY sequence_order ASC, created_at ASC;
    `;
    const { rows } = await pool.query(query);

    const s3 = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET;

    const formatted = await Promise.all(
      rows.map(async (lec) => {
        let streamUrl = null;
        const canPlay = isUnlocked || lec.is_preview;

        if (canPlay) {
          if (s3 && bucket && lec.s3_key) {
            try {
              const command = new GetObjectCommand({
                Bucket: bucket,
                Key: lec.s3_key,
              });
              streamUrl = await getSignedUrl(s3, command, { expiresIn: 7200 }); // 2 hours
            } catch (err) {
              console.warn('Could not generate presigned playback URL:', err.message);
              streamUrl = lec.video_url;
            }
          } else {
            streamUrl = lec.video_url;
          }
        }

        return {
          id: lec.id,
          title: lec.title,
          slug: lec.slug,
          description: lec.description,
          duration: lec.duration,
          sequence_order: lec.sequence_order,
          is_preview: lec.is_preview,
          thumbnail_url: lec.thumbnail_url,
          resources: lec.resources,
          isLocked: !canPlay,
          videoUrl: canPlay ? streamUrl : null,
        };
      })
    );

    return res.status(200).json({
      success: true,
      isUnlocked,
      totalLectures: formatted.length,
      lectures: formatted,
    });
  } catch (error) {
    console.error('Error fetching public IoT lectures:', error);
    return res.status(500).json({ message: 'Failed to fetch IoT lectures', error: error.message });
  }
};

// GET /api/iot/lectures/:id/playback
exports.getLecturePlayback = async (req, res) => {
  try {
    const { id } = req.params;
    const isUnlocked = verifyAccess(req);

    const { rows } = await pool.query(
      `SELECT * FROM iot_lectures WHERE id = $1 AND status = 'published'`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    const lecture = rows[0];

    if (!isUnlocked && !lecture.is_preview) {
      return res.status(403).json({
        message: 'Content locked. You must enter a valid Niva Hardware Kit verification code to view this lecture.',
        isLocked: true,
      });
    }

    const s3 = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET;
    let playbackUrl = lecture.video_url;

    if (s3 && bucket && lecture.s3_key) {
      try {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: lecture.s3_key,
        });
        playbackUrl = await getSignedUrl(s3, command, { expiresIn: 7200 });
      } catch (err) {
        console.warn('Presigned URL error, fallback to video_url:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      id: lecture.id,
      title: lecture.title,
      playbackUrl,
    });
  } catch (error) {
    console.error('Error fetching lecture playback:', error);
    return res.status(500).json({ message: 'Failed to get playback stream', error: error.message });
  }
};

// =============================================================
// STUDENT AUTHENTICATION CONTROLLERS (IoT Labs)
// =============================================================

// POST /api/iot/auth/register
exports.registerStudent = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ message: 'Please provide a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    const checkUser = await pool.query('SELECT id FROM iot_users WHERE email = $1', [cleanEmail]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ message: 'An account with this email already exists. Please log in.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertQuery = `
      INSERT INTO iot_users (name, email, password_hash, is_kit_unlocked)
      VALUES ($1, $2, $3, false)
      RETURNING id, name, email, is_kit_unlocked, created_at;
    `;
    const { rows } = await pool.query(insertQuery, [name.trim(), cleanEmail, passwordHash]);
    const user = rows[0];

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'student',
        is_kit_unlocked: false,
      },
      process.env.JWT_SECRET,
      { expiresIn: '60d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to IoT Labs.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_kit_unlocked: false,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

// POST /api/iot/auth/login
exports.loginStudent = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const { rows } = await pool.query('SELECT * FROM iot_users WHERE email = $1', [cleanEmail]);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Update last login timestamp
    await pool.query('UPDATE iot_users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'student',
        is_kit_unlocked: user.is_kit_unlocked,
      },
      process.env.JWT_SECRET,
      { expiresIn: '60d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully! Welcome back to IoT Labs.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_kit_unlocked: user.is_kit_unlocked,
        kit_code: user.kit_code,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

// GET /api/iot/auth/me
exports.getStudentMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No authorization token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.id) {
      const { rows } = await pool.query(
        'SELECT id, name, email, is_kit_unlocked, kit_code FROM iot_users WHERE id = $1',
        [decoded.id]
      );
      if (rows.length > 0) {
        return res.status(200).json({
          success: true,
          user: rows[0],
        });
      }
    }

    return res.status(200).json({
      success: true,
      user: {
        id: decoded.id || null,
        name: decoded.name || decoded.user || 'Student',
        email: decoded.email || '',
        is_kit_unlocked: !!decoded.is_kit_unlocked || !!decoded.verified,
      },
    });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired session token.' });
  }
};

// POST /api/iot/verify-code
exports.verifyKitCode = async (req, res) => {
  try {
    const { code, studentName, studentEmail } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ message: 'Please provide a valid Kit Activation Code.' });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Check code in database
    const query = `
      SELECT * FROM iot_access_codes 
      WHERE UPPER(code) = $1
    `;
    const { rows } = await pool.query(query, [normalizedCode]);

    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Kit Activation Code. Please check the code provided inside your Niva Hardware Kit package.',
      });
    }

    const codeRecord = rows[0];

    if (!codeRecord.is_active) {
      return res.status(400).json({
        success: false,
        message: 'This activation code has been deactivated or disabled.',
      });
    }

    if (codeRecord.expires_at && new Date(codeRecord.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This activation code has expired.',
      });
    }

    if (codeRecord.max_uses > 0 && codeRecord.times_used >= codeRecord.max_uses) {
      return res.status(400).json({
        success: false,
        message: 'This activation code has already reached its maximum redemption limit.',
      });
    }

    // Check if request is authenticated with a logged in user
    let loggedInUserId = null;
    let loggedInUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
        if (decoded.id) {
          loggedInUserId = decoded.id;
          loggedInUser = decoded;
        }
      } catch (e) {
        // Continue with anonymous/code token
      }
    }

    // Increment usage
    await pool.query(
      `UPDATE iot_access_codes 
       SET times_used = times_used + 1,
           redeemed_at = NOW(),
           redeemed_by = COALESCE($1, redeemed_by)
       WHERE id = $2`,
      [loggedInUser?.email || studentEmail || studentName || 'Student Kit Purchaser', codeRecord.id]
    );

    // If logged in student, permanently mark their user account as unlocked in database
    if (loggedInUserId) {
      await pool.query(
        `UPDATE iot_users 
         SET is_kit_unlocked = true,
             kit_code = $1,
             unlocked_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [codeRecord.code, loggedInUserId]
      );
    }

    // Generate verified student JWT
    const token = jwt.sign(
      {
        id: loggedInUserId,
        access: 'iot_lectures',
        code: codeRecord.code,
        verified: true,
        is_kit_unlocked: true,
        role: 'student',
        user: loggedInUser?.name || studentName || 'IoT Student',
        email: loggedInUser?.email || studentEmail || '',
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Kit verified successfully! All IoT Labs Video Lectures are now unlocked.',
      token,
      code: codeRecord.code,
      user: {
        id: loggedInUserId,
        name: loggedInUser?.name || studentName || 'IoT Student',
        is_kit_unlocked: true,
      },
    });
  } catch (error) {
    console.error('Error verifying kit code:', error);
    return res.status(500).json({ message: 'Internal server error while verifying code', error: error.message });
  }
};

// -------------------------------------------------------------
// ADMIN CONTROLLERS (Protected by authMiddleware)
// -------------------------------------------------------------

// POST /api/admin/iot/presigned-upload-url
// Industry standard: client requests presigned PUT URL and uploads directly to AWS S3
exports.generatePresignedUploadUrl = async (req, res) => {
  try {
    const { fileName, fileType, fileSize, masterclassSlug, courseSlug, masterclassId, courseId } = req.body;

    if (!fileName) {
      return res.status(400).json({ message: 'fileName is required' });
    }

    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET } = process.env;
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_S3_BUCKET) {
      return res.status(400).json({ message: 'AWS S3 environment variables not configured on server' });
    }

    const s3 = getS3Client();
    const cleanExt = path.extname(fileName).toLowerCase() || '.mp4';
    const baseSlug = slugify(path.basename(fileName, cleanExt), { lower: true, strict: true }) || 'lecture';

    // Store each particular masterclass in its own separate directory in S3
    const targetSlug = masterclassSlug || courseSlug || req.query?.masterclassSlug || req.query?.courseSlug;
    const cleanMasterclassDir = targetSlug
      ? slugify(targetSlug, { lower: true, strict: true })
      : (masterclassId || courseId ? `course-${masterclassId || courseId}` : 'general');

    const s3Key = `masterclasses/${cleanMasterclassDir}/videos/${Date.now()}-${baseSlug}${cleanExt}`;

    const contentType = fileType || 'video/mp4';

    const command = new PutObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: s3Key,
      ContentType: contentType,
    });

    // Valid for 60 minutes to accommodate large video uploads
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    const directUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;

    return res.status(200).json({
      success: true,
      presignedUrl,
      s3Key,
      directUrl,
      masterclassDir: cleanMasterclassDir,
      contentType,
    });
  } catch (error) {
    console.error('Error creating presigned upload URL:', error);
    return res.status(500).json({ message: 'Failed to generate S3 upload URL', error: error.message });
  }
};

// POST /api/admin/iot/upload-video (Server-side multipart fallback)
exports.uploadVideoFallback = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file provided' });
    }

    const s3 = getS3Client();
    const { AWS_REGION, AWS_S3_BUCKET } = process.env;

    const fileExtension = path.extname(req.file.originalname).toLowerCase() || '.mp4';
    const baseSlug = slugify(path.basename(req.file.originalname, fileExtension), { lower: true, strict: true }) || 'lecture';

    const targetSlug = req.body?.masterclassSlug || req.body?.courseSlug || req.query?.masterclassSlug || req.query?.courseSlug;
    const cleanMasterclassDir = targetSlug
      ? slugify(targetSlug, { lower: true, strict: true })
      : (req.body?.masterclassId || req.body?.courseId ? `course-${req.body?.masterclassId || req.body?.courseId}` : 'general');

    const s3Key = `masterclasses/${cleanMasterclassDir}/videos/${Date.now()}-${baseSlug}${fileExtension}`;

    if (!s3 || !AWS_S3_BUCKET) {
      // Return simulated link if S3 not accessible
      return res.status(200).json({
        success: true,
        s3Key,
        directUrl: `https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4`,
      });
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: s3Key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || 'video/mp4',
      })
    );

    const directUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;

    return res.status(200).json({
      success: true,
      message: 'Video uploaded to S3 successfully',
      s3Key,
      directUrl,
    });
  } catch (error) {
    console.error('Server video upload error:', error);
    return res.status(500).json({ message: 'Failed to upload video to S3', error: error.message });
  }
};

// GET /api/admin/iot/lectures
exports.getAllLecturesAdmin = async (req, res) => {
  try {
    const query = `
      SELECT * FROM iot_lectures 
      ORDER BY sequence_order ASC, created_at ASC;
    `;
    const { rows } = await pool.query(query);

    const s3 = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET;

    // Generate signed playback URLs for admin preview
    const lectures = await Promise.all(
      rows.map(async (lec) => {
        let previewStreamUrl = lec.video_url;
        if (s3 && bucket && lec.s3_key) {
          try {
            const command = new GetObjectCommand({
              Bucket: bucket,
              Key: lec.s3_key,
            });
            previewStreamUrl = await getSignedUrl(s3, command, { expiresIn: 7200 });
          } catch (err) {
            console.warn('Presigned URL generation failed for admin preview:', err.message);
          }
        }
        return {
          ...lec,
          previewStreamUrl,
        };
      })
    );

    return res.status(200).json({ success: true, count: lectures.length, lectures });
  } catch (error) {
    console.error('Error fetching admin lectures:', error);
    return res.status(500).json({ message: 'Failed to fetch lectures', error: error.message });
  }
};

// POST /api/admin/iot/lectures
exports.createLectureAdmin = async (req, res) => {
  try {
    const {
      title,
      description,
      s3_key,
      video_url,
      duration,
      sequence_order,
      is_preview,
      thumbnail_url,
      resources,
      status,
    } = req.body;

    if (!title || !s3_key) {
      return res.status(400).json({ message: 'Title and S3 video key are required' });
    }

    let slug = slugify(title, { lower: true, strict: true }) || `lecture-${Date.now()}`;
    // Check slug collision
    const existing = await pool.query(`SELECT id FROM iot_lectures WHERE slug = $1`, [slug]);
    if (existing.rows.length > 0) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const insertQuery = `
      INSERT INTO iot_lectures 
      (title, slug, description, s3_key, video_url, duration, sequence_order, is_preview, thumbnail_url, resources, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const values = [
      title.trim(),
      slug,
      description || '',
      s3_key.trim(),
      video_url ? video_url.trim() : `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3_key.trim()}`,
      duration || '10:00',
      sequence_order ? parseInt(sequence_order, 10) : 1,
      !!is_preview,
      thumbnail_url || 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200',
      JSON.stringify(resources || []),
      status === 'draft' ? 'draft' : 'published',
    ];

    const { rows } = await pool.query(insertQuery, values);
    return res.status(201).json({ success: true, message: 'Lecture created successfully', lecture: rows[0] });
  } catch (error) {
    console.error('Error creating lecture:', error);
    return res.status(500).json({ message: 'Failed to create lecture', error: error.message });
  }
};

// PUT /api/admin/iot/lectures/:id
exports.updateLectureAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      s3_key,
      video_url,
      duration,
      sequence_order,
      is_preview,
      thumbnail_url,
      resources,
      status,
    } = req.body;

    const existingRes = await pool.query(`SELECT * FROM iot_lectures WHERE id = $1`, [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    const current = existingRes.rows[0];

    let slug = current.slug;
    if (title && title !== current.title) {
      slug = slugify(title, { lower: true, strict: true }) || current.slug;
    }

    const updateQuery = `
      UPDATE iot_lectures
      SET title = $1,
          slug = $2,
          description = $3,
          s3_key = $4,
          video_url = $5,
          duration = $6,
          sequence_order = $7,
          is_preview = $8,
          thumbnail_url = $9,
          resources = $10,
          status = $11,
          updated_at = NOW()
      WHERE id = $12
      RETURNING *;
    `;

    const values = [
      title ? title.trim() : current.title,
      slug,
      description !== undefined ? description : current.description,
      s3_key ? s3_key.trim() : current.s3_key,
      video_url ? video_url.trim() : current.video_url,
      duration || current.duration,
      sequence_order !== undefined ? parseInt(sequence_order, 10) : current.sequence_order,
      is_preview !== undefined ? !!is_preview : current.is_preview,
      thumbnail_url || current.thumbnail_url,
      resources ? JSON.stringify(resources) : current.resources,
      status || current.status,
      id,
    ];

    const { rows } = await pool.query(updateQuery, values);
    return res.status(200).json({ success: true, message: 'Lecture updated successfully', lecture: rows[0] });
  } catch (error) {
    console.error('Error updating lecture:', error);
    return res.status(500).json({ message: 'Failed to update lecture', error: error.message });
  }
};

// DELETE /api/admin/iot/lectures/:id
exports.deleteLectureAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(`SELECT s3_key FROM iot_lectures WHERE id = $1`, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Lecture not found' });
    }

    const s3Key = rows[0].s3_key;

    // Delete from Postgres
    await pool.query(`DELETE FROM iot_lectures WHERE id = $1`, [id]);

    // Attempt to delete from S3
    const s3 = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET;
    if (s3 && bucket && s3Key && !s3Key.startsWith('sample')) {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: s3Key,
          })
        );
      } catch (err) {
        console.warn('S3 object deletion warning:', err.message);
      }
    }

    return res.status(200).json({ success: true, message: 'Lecture deleted successfully' });
  } catch (error) {
    console.error('Error deleting lecture:', error);
    return res.status(500).json({ message: 'Failed to delete lecture', error: error.message });
  }
};

// GET /api/admin/iot/codes
exports.getAllCodesAdmin = async (req, res) => {
  try {
    const query = `
      SELECT id, code, description, max_uses, times_used, is_active, expires_at, created_at, redeemed_at, redeemed_by
      FROM iot_access_codes
      ORDER BY created_at DESC;
    `;
    const { rows } = await pool.query(query);
    return res.status(200).json({ success: true, count: rows.length, codes: rows });
  } catch (error) {
    console.error('Error fetching kit access codes:', error);
    return res.status(500).json({ message: 'Failed to fetch access codes', error: error.message });
  }
};

// POST /api/admin/iot/codes/generate
exports.generateCodesAdmin = async (req, res) => {
  try {
    const { prefix = 'NIVA', count = 1, description = 'Niva IoT Kit Purchase Access Code', maxUses = 1 } = req.body;

    const numCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 50); // generate up to 50 at once
    const cleanPrefix = (prefix || 'NIVA').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    const generated = [];

    for (let i = 0; i < numCount; i++) {
      const randomPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const randomPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `${cleanPrefix}-${randomPart1}-${randomPart2}`;

      const { rows } = await pool.query(
        `INSERT INTO iot_access_codes (code, description, max_uses, times_used, is_active)
         VALUES ($1, $2, $3, 0, true)
         RETURNING *;`,
        [code, description, parseInt(maxUses, 10) || 1]
      );
      generated.push(rows[0]);
    }

    return res.status(201).json({
      success: true,
      message: `Generated ${generated.length} kit access code(s) successfully.`,
      codes: generated,
    });
  } catch (error) {
    console.error('Error generating kit codes:', error);
    return res.status(500).json({ message: 'Failed to generate kit codes', error: error.message });
  }
};

// PATCH /api/admin/iot/codes/:id/toggle
exports.toggleCodeStatusAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE iot_access_codes 
       SET is_active = NOT is_active 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Code not found' });
    }

    return res.status(200).json({ success: true, message: 'Code status updated', code: rows[0] });
  } catch (error) {
    console.error('Error toggling code status:', error);
    return res.status(500).json({ message: 'Failed to update code', error: error.message });
  }
};

// =============================================================
// DYNAMIC IOT COURSES / MASTERCLASSES CONTROLLERS
// =============================================================

// GET /api/iot/courses (Public & Student)
exports.getPublicCourses = async (req, res) => {
  try {
    const isUnlocked = verifyAccess(req);

    const query = `
      SELECT id, code, title, slug, badge, level, duration, thumbnail_url,
             description, overview, hardware_used, learning_outcomes, lessons,
             resources, sequence_order, status, created_at, updated_at
      FROM iot_courses
      WHERE status = 'published'
      ORDER BY sequence_order ASC, created_at ASC;
    `;
    const { rows } = await pool.query(query);

    // Format courses and their lessons with unlock status
    const formatted = rows.map((c) => {
      let parsedHardware = c.hardware_used;
      if (typeof parsedHardware === 'string') {
        try { parsedHardware = JSON.parse(parsedHardware); } catch(e) { parsedHardware = []; }
      }
      
      let parsedOutcomes = c.learning_outcomes;
      if (typeof parsedOutcomes === 'string') {
        try { parsedOutcomes = JSON.parse(parsedOutcomes); } catch(e) { parsedOutcomes = []; }
      }
      
      let parsedResources = c.resources;
      if (typeof parsedResources === 'string') {
        try { parsedResources = JSON.parse(parsedResources); } catch(e) { parsedResources = []; }
      }

      let rawModules = c.lessons;
      if (typeof rawModules === 'string') {
        try { rawModules = JSON.parse(rawModules); } catch(e) { rawModules = []; }
      }
      if (!Array.isArray(rawModules)) rawModules = [];

      let flatLessons = [];
      rawModules.forEach(mod => {
          if (mod.lessons && Array.isArray(mod.lessons)) {
              flatLessons = flatLessons.concat(mod.lessons);
          } else {
             flatLessons.push(mod);
          }
      });

      const mappedLessons = flatLessons.map((l, index) => ({
        ...l,
        sequence_order: l.sequence_order || (index + 1),
        isLocked: !(isUnlocked || l.is_preview),
        videoUrl: (isUnlocked || l.is_preview)
          ? (l.videoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")
          : null,
      }));

      return {
        id: c.id,
        code: c.code,
        title: c.title,
        slug: c.slug,
        badge: c.badge,
        level: c.level,
        duration: c.duration,
        thumbnail_url: c.thumbnail_url,
        description: c.description,
        overview: c.overview,
        hardware_used: parsedHardware || [],
        hardware_items: parsedHardware || [],
        learning_outcomes: parsedOutcomes || [],
        lessons: mappedLessons,
        modules: mappedLessons,
        resources: parsedResources || [],
        sequence_order: c.sequence_order,
        isLocked: !isUnlocked,
      };
    });

    return res.status(200).json({
      success: true,
      isUnlocked,
      totalCourses: formatted.length,
      courses: formatted,
    });
  } catch (error) {
    console.error('Error fetching public courses:', error);
    return res.status(500).json({ message: 'Failed to fetch courses', error: error.message });
  }
};

// GET /api/iot/courses/:slug (Public & Student)
exports.getPublicCourseBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const isUnlocked = verifyAccess(req);

    const query = `
      SELECT id, code, title, slug, badge, level, duration, thumbnail_url,
             description, overview, hardware_used, learning_outcomes, lessons,
             resources, sequence_order, status, created_at, updated_at
      FROM iot_courses
      WHERE (slug = $1 OR id::text = $1) AND status = 'published'
      LIMIT 1;
    `;
    const { rows } = await pool.query(query, [slug]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Masterclass course not found' });
    }

    const c = rows[0];

    // Check if there are also standalone lectures linked to this course in iot_lectures
    const { rows: linkedLectures } = await pool.query(
      `SELECT id, title, slug, description, duration, sequence_order, is_preview, thumbnail_url, resources, s3_key, video_url
       FROM iot_lectures
       WHERE course_id = $1 AND status = 'published'
       ORDER BY sequence_order ASC`,
      [c.id]
    );

    let rawModules = c.lessons;
    if (typeof rawModules === 'string') {
      try { rawModules = JSON.parse(rawModules); } catch(e) { rawModules = []; }
    }
    if (!Array.isArray(rawModules)) rawModules = [];

    let flatLessons = [];
    rawModules.forEach(mod => {
        if (mod.lessons && Array.isArray(mod.lessons)) {
            flatLessons = flatLessons.concat(mod.lessons);
        } else {
            flatLessons.push(mod);
        }
    });

    let rawLessons = flatLessons;

    // Merge linked lectures if any exist
    if (linkedLectures.length > 0) {
      linkedLectures.forEach((lec) => {
        const exists = rawLessons.some((l) => l.slug === lec.slug || l.id === lec.id);
        if (!exists) {
          rawLessons.push({
            id: lec.id,
            sequence_order: lec.sequence_order,
            title: lec.title,
            duration: lec.duration,
            description: lec.description,
            is_preview: lec.is_preview,
            videoUrl: lec.video_url,
          });
        }
      });
    }

    // Sort lessons by sequence_order
    rawLessons.sort((a, b) => (a.sequence_order || 1) - (b.sequence_order || 1));

    const s3 = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET;

    const mappedLessons = await Promise.all(
      rawLessons.map(async (l) => {
        const canPlay = isUnlocked || l.is_preview;
        let streamUrl = null;

        if (canPlay) {
          if (s3 && bucket && l.s3_key) {
            try {
              const command = new GetObjectCommand({
                Bucket: bucket,
                Key: l.s3_key,
              });
              streamUrl = await getSignedUrl(s3, command, { expiresIn: 7200 });
            } catch (err) {
              streamUrl = l.videoUrl || null;
            }
          } else {
            streamUrl = l.videoUrl || "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
          }
        }

        return {
          id: l.id,
          sequence_order: l.sequence_order || 1,
          title: l.title,
          duration: l.duration || "20:00",
          description: l.description || "",
          is_preview: !!l.is_preview,
          isLocked: !canPlay,
          videoUrl: canPlay ? streamUrl : null,
        };
      })
    );

      let parsedHardware = c.hardware_used;
      if (typeof parsedHardware === 'string') {
        try { parsedHardware = JSON.parse(parsedHardware); } catch(e) { parsedHardware = []; }
      }
      
      let parsedOutcomes = c.learning_outcomes;
      if (typeof parsedOutcomes === 'string') {
        try { parsedOutcomes = JSON.parse(parsedOutcomes); } catch(e) { parsedOutcomes = []; }
      }
      
      let parsedResources = c.resources;
      if (typeof parsedResources === 'string') {
        try { parsedResources = JSON.parse(parsedResources); } catch(e) { parsedResources = []; }
      }

    return res.status(200).json({
      success: true,
      isUnlocked,
      course: {
        id: c.id,
        code: c.code,
        title: c.title,
        slug: c.slug,
        badge: c.badge,
        level: c.level,
        duration: c.duration,
        thumbnail_url: c.thumbnail_url,
        description: c.description,
        overview: c.overview,
        hardware_used: parsedHardware || [],
        hardware_items: parsedHardware || [],
        learning_outcomes: parsedOutcomes || [],
        lessons: mappedLessons,
        modules: mappedLessons,
        resources: parsedResources || [],
        isLocked: !isUnlocked,
      },
    });
  } catch (error) {
    console.error('Error fetching course by slug:', error);
    return res.status(500).json({ message: 'Failed to fetch masterclass', error: error.message });
  }
};

// GET /api/admin/iot/courses (Admin protected)
exports.getAllCoursesAdmin = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM iot_courses ORDER BY sequence_order ASC, created_at DESC;`
    );
    
    // Map DB columns to frontend expected fields and parse JSON if stringified
    const mappedRows = rows.map(r => {
      let parsedHardware = r.hardware_used;
      if (typeof parsedHardware === 'string') {
        try { parsedHardware = JSON.parse(parsedHardware); } catch(e) { parsedHardware = []; }
      }
      
      let parsedModules = r.lessons;
      if (typeof parsedModules === 'string') {
        try { parsedModules = JSON.parse(parsedModules); } catch(e) { parsedModules = []; }
      }

      return {
        ...r,
        hardware_items: parsedHardware || [],
        modules: parsedModules || [],
        learning_outcomes: typeof r.learning_outcomes === 'string' ? JSON.parse(r.learning_outcomes) : (r.learning_outcomes || []),
        resources: typeof r.resources === 'string' ? JSON.parse(r.resources) : (r.resources || [])
      };
    });

    return res.status(200).json({
      success: true,
      totalCourses: mappedRows.length,
      courses: mappedRows,
    });
  } catch (error) {
    console.error('Admin error fetching courses:', error);
    return res.status(500).json({ message: 'Failed to fetch admin courses', error: error.message });
  }
};

// POST /api/admin/iot/courses (Admin protected)
exports.createCourseAdmin = async (req, res) => {
  try {
    const {
      code,
      title,
      slug,
      badge = 'Physical Computing',
      level = 'Beginner',
      duration = '4 Lessons • 2h 00m',
      thumbnail_url = '',
      description = '',
      overview = '',
      hardware_items = [],
      hardware_used = [], // fallback
      learning_outcomes = [],
      modules = [],
      lessons = [], // fallback
      resources = [],
      sequence_order = 1,
      status = 'published',
    } = req.body;
    
    const finalHardware = (hardware_items && hardware_items.length > 0) ? hardware_items : hardware_used;
    const finalModules = (modules && modules.length > 0) ? modules : lessons;

    if (!code || !title) {
      return res.status(400).json({ message: 'Course code and title are required.' });
    }

    const autoSlug = (slug || slugify(title, { lower: true, strict: true })).trim();

    const insertQuery = `
      INSERT INTO iot_courses (
        code, title, slug, badge, level, duration, thumbnail_url,
        description, overview, hardware_used, learning_outcomes, lessons,
        resources, sequence_order, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `;

    const values = [
      code.trim().toUpperCase(),
      title.trim(),
      autoSlug,
      badge.trim(),
      level,
      duration.trim(),
      thumbnail_url.trim(),
      description.trim(),
      overview.trim(),
      JSON.stringify(Array.isArray(finalHardware) ? finalHardware : []),
      JSON.stringify(Array.isArray(learning_outcomes) ? learning_outcomes : []),
      JSON.stringify(Array.isArray(finalModules) ? finalModules : []),
      JSON.stringify(Array.isArray(resources) ? resources : []),
      parseInt(sequence_order, 10) || 1,
      status === 'draft' ? 'draft' : 'published',
    ];

    const { rows } = await pool.query(insertQuery, values);
    return res.status(201).json({
      success: true,
      message: 'Course created successfully.',
      course: rows[0],
    });
  } catch (error) {
    console.error('Error creating course:', error);
    if (error.code === '23505') {
      return res.status(400).json({ message: 'A course with this slug already exists. Please choose a different title or slug.' });
    }
    return res.status(500).json({ message: 'Failed to create course', error: error.message });
  }
};

// PUT /api/admin/iot/courses/:id (Admin protected)
exports.updateCourseAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      title,
      slug,
      badge,
      level,
      duration,
      thumbnail_url,
      description,
      overview,
      hardware_items,
      hardware_used,
      learning_outcomes,
      modules,
      lessons,
      resources,
      sequence_order,
      status,
    } = req.body;
    
    const finalHardware = hardware_items !== undefined ? hardware_items : hardware_used;
    const finalModules = modules !== undefined ? modules : lessons;

    const { rows: existing } = await pool.query('SELECT * FROM iot_courses WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const current = existing[0];
    const newSlug = slug ? slug.trim() : (title ? slugify(title, { lower: true, strict: true }) : current.slug);

    const updateQuery = `
      UPDATE iot_courses
      SET code = COALESCE($1, code),
          title = COALESCE($2, title),
          slug = COALESCE($3, slug),
          badge = COALESCE($4, badge),
          level = COALESCE($5, level),
          duration = COALESCE($6, duration),
          thumbnail_url = COALESCE($7, thumbnail_url),
          description = COALESCE($8, description),
          overview = COALESCE($9, overview),
          hardware_used = COALESCE($10, hardware_used),
          learning_outcomes = COALESCE($11, learning_outcomes),
          lessons = COALESCE($12, lessons),
          resources = COALESCE($13, resources),
          sequence_order = COALESCE($14, sequence_order),
          status = COALESCE($15, status),
          updated_at = NOW()
      WHERE id = $16
      RETURNING *;
    `;

    const values = [
      code ? code.trim().toUpperCase() : null,
      title ? title.trim() : null,
      newSlug,
      badge ? badge.trim() : null,
      level || null,
      duration ? duration.trim() : null,
      thumbnail_url !== undefined ? thumbnail_url.trim() : null,
      description !== undefined ? description.trim() : null,
      overview !== undefined ? overview.trim() : null,
      finalHardware ? JSON.stringify(finalHardware) : null,
      learning_outcomes !== undefined ? JSON.stringify(learning_outcomes) : null,
      finalModules ? JSON.stringify(finalModules) : null,
      resources !== undefined ? JSON.stringify(resources) : null,
      sequence_order !== undefined ? parseInt(sequence_order, 10) : null,
      status || null,
      id,
    ];

    const { rows } = await pool.query(updateQuery, values);
    return res.status(200).json({
      success: true,
      message: 'Course updated successfully.',
      course: rows[0],
    });
  } catch (error) {
    console.error('Error updating course:', error);
    return res.status(500).json({ message: 'Failed to update course', error: error.message });
  }
};

// DELETE /api/admin/iot/courses/:id (Admin protected)
exports.deleteCourseAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM iot_courses WHERE id = $1 RETURNING id, title', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }
    return res.status(200).json({
      success: true,
      message: `Course '${rows[0].title}' deleted successfully.`,
    });
  } catch (error) {
    console.error('Error deleting course:', error);
    return res.status(500).json({ message: 'Failed to delete course', error: error.message });
  }
};

// =============================================================
// ADMIN STUDENTS MANAGEMENT CONTROLLERS
// =============================================================

// GET /api/admin/iot/students (Admin protected)
exports.getAllStudentsAdmin = async (req, res) => {
  try {
    const { search = '', status = 'all' } = req.query;

    let query = `
      SELECT id, name, email, is_kit_unlocked, kit_code, unlocked_at, last_login_at, created_at
      FROM iot_users
    `;
    const params = [];
    const conditions = [];

    if (search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`(LOWER(name) LIKE $${params.length} OR LOWER(email) LIKE $${params.length} OR LOWER(COALESCE(kit_code, '')) LIKE $${params.length})`);
    }

    if (status === 'unlocked') {
      conditions.push('is_kit_unlocked = true');
    } else if (status === 'pending') {
      conditions.push('is_kit_unlocked = false');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY created_at DESC;`;

    const { rows: students } = await pool.query(query, params);

    // Compute metrics
    const { rows: statsRows } = await pool.query(`
      SELECT 
        COUNT(*) as total_students,
        COUNT(CASE WHEN is_kit_unlocked = true THEN 1 END) as kit_unlocked_count,
        COUNT(CASE WHEN is_kit_unlocked = false THEN 1 END) as pending_code_count,
        COUNT(CASE WHEN last_login_at >= NOW() - INTERVAL '7 days' THEN 1 END) as active_past_week,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_this_month
      FROM iot_users;
    `);

    const stats = statsRows[0] || {
      total_students: 0,
      kit_unlocked_count: 0,
      pending_code_count: 0,
      active_past_week: 0,
      new_this_month: 0,
    };

    return res.status(200).json({
      success: true,
      stats: {
        totalStudents: parseInt(stats.total_students, 10),
        kitUnlockedCount: parseInt(stats.kit_unlocked_count, 10),
        pendingCodeCount: parseInt(stats.pending_code_count, 10),
        activePastWeek: parseInt(stats.active_past_week, 10),
        newThisMonth: parseInt(stats.new_this_month, 10),
      },
      students,
    });
  } catch (error) {
    console.error('Error fetching admin students:', error);
    return res.status(500).json({ message: 'Failed to fetch students', error: error.message });
  }
};

// POST /api/admin/iot/students (Admin protected - create student manually)
exports.createStudentAdmin = async (req, res) => {
  try {
    const { name, email, password, is_kit_unlocked = false, kit_code = '' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await pool.query('SELECT id FROM iot_users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'A student account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertQuery = `
      INSERT INTO iot_users (name, email, password_hash, is_kit_unlocked, kit_code, unlocked_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, is_kit_unlocked, kit_code, created_at;
    `;

    const { rows } = await pool.query(insertQuery, [
      name.trim(),
      cleanEmail,
      passwordHash,
      !!is_kit_unlocked,
      kit_code ? kit_code.trim().toUpperCase() : null,
      is_kit_unlocked ? new Date() : null,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Student account created successfully.',
      student: rows[0],
    });
  } catch (error) {
    console.error('Error creating student by admin:', error);
    return res.status(500).json({ message: 'Failed to create student account', error: error.message });
  }
};

// PATCH /api/admin/iot/students/:id/toggle-kit (Admin protected)
exports.toggleStudentKitAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: existing } = await pool.query('SELECT id, is_kit_unlocked, name, email FROM iot_users WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const newStatus = !existing[0].is_kit_unlocked;
    const { rows } = await pool.query(
      `UPDATE iot_users 
       SET is_kit_unlocked = $1,
           unlocked_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, email, is_kit_unlocked, kit_code, unlocked_at;`,
      [newStatus, id]
    );

    return res.status(200).json({
      success: true,
      message: `Student kit access set to ${newStatus ? 'Verified (Unlocked)' : 'Locked'}.`,
      student: rows[0],
    });
  } catch (error) {
    console.error('Error toggling student kit status:', error);
    return res.status(500).json({ message: 'Failed to update student kit status', error: error.message });
  }
};

// DELETE /api/admin/iot/students/:id (Admin protected)
exports.deleteStudentAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM iot_users WHERE id = $1 RETURNING id, name, email', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    return res.status(200).json({
      success: true,
      message: `Student '${rows[0].name}' deleted successfully.`,
    });
  } catch (error) {
    console.error('Error deleting student:', error);
    return res.status(500).json({ message: 'Failed to delete student', error: error.message });
  }
};

// =============================================================
// UNIVERSITY & COLLEGE PARTNERSHIP INQUIRIES CONTROLLERS
// =============================================================

// POST /api/iot/college-inquiry (Public submission from landing page)
exports.submitCollegeInquiry = async (req, res) => {
  try {
    const { collegeName, contactPerson, email, phone = '', batchSize = '60-120 Students', notes = '' } = req.body;

    if (!collegeName || !contactPerson || !email) {
      return res.status(400).json({ message: 'Institution name, contact person, and official email are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const insertQuery = `
      INSERT INTO iot_college_inquiries (
        college_name, contact_person, email, phone, batch_size, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *;
    `;

    const { rows } = await pool.query(insertQuery, [
      collegeName.trim(),
      contactPerson.trim(),
      cleanEmail,
      phone ? phone.trim() : null,
      batchSize ? batchSize.trim() : '60-120 Students',
      notes ? notes.trim() : null,
    ]);

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your institutional partnership inquiry has been received. Our academic team will contact you within 24 hours.',
      inquiry: rows[0],
    });
  } catch (error) {
    console.error('Error submitting college inquiry:', error);
    return res.status(500).json({ message: 'Failed to submit partnership request', error: error.message });
  }
};

// GET /api/admin/iot/college-inquiries (Admin protected)
exports.getAllCollegeInquiriesAdmin = async (req, res) => {
  try {
    const { status = 'all', search = '' } = req.query;

    let query = `
      SELECT id, college_name, contact_person, email, phone, batch_size, notes, status, created_at, updated_at
      FROM iot_college_inquiries
    `;
    const params = [];
    const conditions = [];

    if (search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`(LOWER(college_name) LIKE $${params.length} OR LOWER(contact_person) LIKE $${params.length} OR LOWER(email) LIKE $${params.length})`);
    }

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY created_at DESC;`;

    const { rows: inquiries } = await pool.query(query, params);

    // Compute status stats
    const { rows: statsRows } = await pool.query(`
      SELECT 
        COUNT(*) as total_inquiries,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted_count,
        COUNT(CASE WHEN status = 'in_discussion' THEN 1 END) as in_discussion_count,
        COUNT(CASE WHEN status = 'partnered' THEN 1 END) as partnered_count
      FROM iot_college_inquiries;
    `);

    const stats = statsRows[0] || {
      total_inquiries: 0,
      pending_count: 0,
      contacted_count: 0,
      in_discussion_count: 0,
      partnered_count: 0,
    };

    return res.status(200).json({
      success: true,
      stats: {
        totalInquiries: parseInt(stats.total_inquiries, 10),
        pendingCount: parseInt(stats.pending_count, 10),
        contactedCount: parseInt(stats.contacted_count, 10),
        inDiscussionCount: parseInt(stats.in_discussion_count, 10),
        partneredCount: parseInt(stats.partnered_count, 10),
      },
      inquiries,
    });
  } catch (error) {
    console.error('Error fetching college inquiries:', error);
    return res.status(500).json({ message: 'Failed to fetch college inquiries', error: error.message });
  }
};

// PATCH /api/admin/iot/college-inquiries/:id (Admin protected - update status and notes)
exports.updateCollegeInquiryAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const { rows: existing } = await pool.query('SELECT * FROM iot_college_inquiries WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Inquiry not found.' });
    }

    const { rows } = await pool.query(
      `UPDATE iot_college_inquiries 
       SET status = COALESCE($1, status),
           notes = COALESCE($2, notes),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *;`,
      [status || null, notes !== undefined ? notes : null, id]
    );

    return res.status(200).json({
      success: true,
      message: 'Inquiry updated successfully.',
      inquiry: rows[0],
    });
  } catch (error) {
    console.error('Error updating college inquiry:', error);
    return res.status(500).json({ message: 'Failed to update inquiry', error: error.message });
  }
};

// DELETE /api/admin/iot/college-inquiries/:id (Admin protected)
exports.deleteCollegeInquiryAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM iot_college_inquiries WHERE id = $1 RETURNING id, college_name', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Inquiry not found.' });
    }
    return res.status(200).json({
      success: true,
      message: `Inquiry for '${rows[0].college_name}' deleted successfully.`,
    });
  } catch (error) {
    console.error('Error deleting college inquiry:', error);
    return res.status(500).json({ message: 'Failed to delete inquiry', error: error.message });
  }
};

// GET /api/admin/iot/dashboard-overview (Admin protected)
exports.getDashboardOverview = async (req, res) => {
  try {
    const [
      studentsRes,
      coursesRes,
      collegeInquiriesRes,
      lecturesRes,
      codesRes,
      queriesRes,
      blogsRes
    ] = await Promise.all([
      pool.query(`
        SELECT 
          id, name, email, is_kit_unlocked, kit_code, last_login_at, created_at
        FROM iot_users 
        ORDER BY created_at DESC;
      `),
      pool.query(`
        SELECT 
          id, code, title, slug, badge, level, duration, thumbnail_url, description, status, lessons, created_at
        FROM iot_courses 
        ORDER BY code ASC;
      `),
      pool.query(`
        SELECT 
          id, college_name, contact_person, email, phone, batch_size, notes, status, created_at, updated_at
        FROM iot_college_inquiries 
        ORDER BY created_at DESC;
      `),
      pool.query(`
        SELECT id, title, slug, sequence_order, is_preview, status, created_at
        FROM iot_lectures 
        ORDER BY sequence_order ASC;
      `),
      pool.query(`
        SELECT id, code, description, max_uses, times_used, is_active, redeemed_by, created_at
        FROM iot_access_codes 
        ORDER BY created_at DESC;
      `),
      pool.query(`
        SELECT id, name, email, company_name, message, status, created_at
        FROM contact_queries 
        ORDER BY created_at DESC;
      `),
      pool.query(`
        SELECT id, title, slug, status, created_at
        FROM blogs 
        ORDER BY created_at DESC;
      `)
    ]);

    const students = studentsRes.rows;
    const courses = coursesRes.rows;
    const collegeInquiries = collegeInquiriesRes.rows;
    const lectures = lecturesRes.rows;
    const codes = codesRes.rows;
    const queries = queriesRes.rows;
    const blogs = blogsRes.rows;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Calculate aggregated course metrics
    let totalModules = 0;
    let totalLessons = 0;
    const levelCounts = { Beginner: 0, Intermediate: 0, Advanced: 0, Specialist: 0 };

    courses.forEach((c) => {
      if (levelCounts[c.level] !== undefined) {
        levelCounts[c.level]++;
      }
      if (Array.isArray(c.lessons)) {
        totalLessons += c.lessons.length;
        totalModules += c.lessons.length;
      }
    });

    // Student stats
    const totalStudents = students.length;
    const kitUnlockedStudents = students.filter(s => s.is_kit_unlocked).length;
    const pendingKitStudents = totalStudents - kitUnlockedStudents;
    const activePastWeek = students.filter(s => s.last_login_at && new Date(s.last_login_at) >= oneWeekAgo).length;

    // College Inquiries stats
    const totalCollegeInquiries = collegeInquiries.length;
    const pendingCollege = collegeInquiries.filter(i => i.status === 'pending').length;
    const contactedCollege = collegeInquiries.filter(i => i.status === 'contacted').length;
    const inDiscussionCollege = collegeInquiries.filter(i => i.status === 'in_discussion').length;
    const partneredCollege = collegeInquiries.filter(i => i.status === 'partnered').length;

    // Code stats
    const totalCodes = codes.length;
    const totalRedeemedCodes = codes.filter(c => c.times_used > 0).length;

    // Query stats
    const totalQueries = queries.length;
    const pendingQueries = queries.filter(q => q.status === 'pending' || !q.status).length;

    // Blog stats
    const totalBlogs = blogs.length;
    const publishedBlogs = blogs.filter(b => b.status === 'published').length;

    return res.status(200).json({
      success: true,
      metrics: {
        students: {
          total: totalStudents,
          kitUnlocked: kitUnlockedStudents,
          pending: pendingKitStudents,
          activePastWeek,
        },
        courses: {
          total: courses.length,
          published: courses.filter(c => c.status === 'published').length,
          totalModules,
          totalLessons,
          levelCounts,
        },
        collegeInquiries: {
          total: totalCollegeInquiries,
          pending: pendingCollege,
          contacted: contactedCollege,
          inDiscussion: inDiscussionCollege,
          partnered: partneredCollege,
        },
        lectures: {
          total: lectures.length,
        },
        accessCodes: {
          total: totalCodes,
          redeemed: totalRedeemedCodes,
          active: codes.filter(c => c.is_active).length,
        },
        queries: {
          total: totalQueries,
          pending: pendingQueries,
        },
        blogs: {
          total: totalBlogs,
          published: publishedBlogs,
        }
      },
      recentData: {
        students: students.slice(0, 5),
        collegeInquiries: collegeInquiries.slice(0, 5),
        courses: courses.slice(0, 6),
        queries: queries.slice(0, 5),
        codes: codes.slice(0, 5)
      }
    });
  } catch (error) {
    console.error('Error in getDashboardOverview:', error);
    return res.status(500).json({ message: 'Failed to retrieve dashboard overview', error: error.message });
  }
};



