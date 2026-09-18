
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

