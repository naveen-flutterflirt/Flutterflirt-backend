
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

