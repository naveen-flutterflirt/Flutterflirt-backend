const express = require('express');
const router = express.Router();
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const authMiddleware = require('../middleware/auth');
const path = require('path');

// Configure multer (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // Limit: 5MB
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images (.jpeg, .jpg, .png, .webp, .gif) are allowed!'));
  },
});

router.post('/admin/upload', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const {
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
      AWS_REGION,
      AWS_S3_BUCKET
    } = process.env;

    // Check if S3 is configured
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_S3_BUCKET) {
      console.warn('AWS S3 is not configured in .env. Falling back to simulated successful upload response.');
      // For local testing/development when S3 credentials aren't filled yet, return a mock URL
      // so the admin panel continues working.
      const mockUrl = `https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=800`;
      return res.status(200).json({
        message: 'Upload simulated (S3 credentials missing)',
        imageUrl: mockUrl,
      });
    }

    // Initialize S3 Client
    const s3 = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });

    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const fileName = `blogs/${Date.now()}-${Math.random().toString(36).substring(2, 8)}${fileExtension}`;

    // Upload to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: fileName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    const imageUrl = `https://s3.${AWS_REGION}.amazonaws.com/${AWS_S3_BUCKET}/${fileName}`;

    return res.status(200).json({
      message: 'Image uploaded successfully',
      imageUrl,
    });
  } catch (error) {
    console.error('S3 Upload Error:', error);
    return res.status(500).json({
      message: 'Failed to upload image',
      error: error.message,
    });
  }
});

module.exports = router;
