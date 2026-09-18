
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

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 60 * 24 * 60 * 60 * 1000 // 60 days
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to IoT Labs.',
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

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 60 * 24 * 60 * 60 * 1000 // 60 days
    });

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully! Welcome back to IoT Labs.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_kit_unlocked: user.is_kit_unlocked,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

exports.getStudentMe = async (req, res) => {
  try {
    let token = req.cookies?.token;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No authorization token provided.' });
      }
      token = authHeader.split(' ')[1];
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.id) {
      const { rows } = await pool.query(
        'SELECT id, name, email, is_kit_unlocked FROM iot_users WHERE id = $1',
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

exports.verifyKitCode = async (req, res) => {
  try {
    const { code, studentName, studentEmail } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ message: 'Please provide a valid Kit Activation Code.' });
    }

    const normalizedCode = code.trim();

    // Check if request is authenticated with a logged in user
    let loggedInUserId = null;
    let loggedInUser = null;
    let token = req.cookies?.token;
    
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.id) {
          loggedInUserId = decoded.id;
          loggedInUser = decoded;
        }
      } catch (e) {
        // Continue with anonymous/code token
      }
    }

    // Determine email to verify against (must have one for fraud check)
    const emailToVerify = loggedInUser?.email || studentEmail;

    if (!emailToVerify) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email is required to verify the kit code.' 
      });
    }

    // Fetch from NivaShop API
    const response = await fetch('https://api.nivashop.in/api/orders/public/all', {
      headers: {
        'x-api-key': 'nivashop_secret_key_123'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch orders from NivaShop API. Status: ${response.status}`);
    }

    const responseData = await response.json();
    const orders = responseData.data || [];

    // Find the order that matches the provided kit code
    const order = orders.find(o => o.iotKitCode && o.iotKitCode.trim() === normalizedCode);

    if (!order) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Kit Activation Code or no purchase found.',
      });
    }

    // Fraud Check: Strict Email Match
    if (order.customerEmail.toLowerCase().trim() !== emailToVerify.toLowerCase().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Fraud check failed: Email does not match the purchase record for this kit.',
      });
    }

    // If logged in student, permanently mark their user account as unlocked in database
    if (loggedInUserId) {
      await pool.query(
        `UPDATE iot_users 
         SET is_kit_unlocked = true,
             kit_code = $1,
             unlocked_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [normalizedCode, loggedInUserId]
      );
    }

    // Generate verified student JWT
    const newToken = jwt.sign(
      {
        id: loggedInUserId,
        access: 'iot_lectures',
        code: normalizedCode,
        verified: true,
        is_kit_unlocked: true,
        role: 'student',
        user: loggedInUser?.name || studentName || order.customerName || 'IoT Student',
        email: emailToVerify,
      },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );

    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 90 * 24 * 60 * 60 * 1000 // 90 days
    });

    return res.status(200).json({
      success: true,
      message: 'Kit verified successfully! All IoT Labs Video Lectures are now unlocked.',
      user: {
        id: loggedInUserId,
        name: loggedInUser?.name || studentName || order.customerName || 'IoT Student',
        is_kit_unlocked: true,
      },
    });
  } catch (error) {
    console.error('Error verifying kit code:', error);
    return res.status(500).json({ message: 'Internal server error while verifying code', error: error.message });
  }
};

