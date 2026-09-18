
const { pool } = require('../../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { S3Client } = require('@aws-sdk/client-s3');
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

const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const slugify = require('slugify');

const verifyAccess = (req) => {
  let token = req.cookies?.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) return false;

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

