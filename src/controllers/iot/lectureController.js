
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

const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const slugify = require('slugify');
const path = require('path');

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
      course_id,
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
      (title, slug, description, s3_key, video_url, duration, sequence_order, is_preview, thumbnail_url, resources, status, course_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      course_id || null,
    ];

    const { rows } = await pool.query(insertQuery, values);
    return res.status(201).json({ success: true, message: 'Lecture created successfully', lecture: rows[0] });
  } catch (error) {
    console.error('Error creating lecture:', error);
    return res.status(500).json({ message: 'Failed to create lecture', error: error.message });
  }
};

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
      course_id,
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
          course_id = $12,
          updated_at = NOW()
      WHERE id = $13
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
      is_preview !== undefined ? is_preview : current.is_preview,
      thumbnail_url ? thumbnail_url.trim() : current.thumbnail_url,
      resources ? JSON.stringify(resources) : current.resources,
      status ? (status === 'draft' ? 'draft' : 'published') : current.status,
      course_id !== undefined ? course_id : current.course_id,
      id,
    ];

    const { rows } = await pool.query(updateQuery, values);
    return res.status(200).json({ success: true, message: 'Lecture updated successfully', lecture: rows[0] });
  } catch (error) {
    console.error('Error updating lecture:', error);
    return res.status(500).json({ message: 'Failed to update lecture', error: error.message });
  }
};

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

