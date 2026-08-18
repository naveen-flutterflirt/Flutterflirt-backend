const { query } = require('../config/db');

const normalizeContactQuery = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  companyName: row.company_name,
  message: row.message,
  status: row.status,
  createdAt: row.created_at,
});

const ensureContactTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS contact_queries (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      company_name VARCHAR(255),
      message TEXT NOT NULL,
      status VARCHAR(30) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
};

const createContactQuery = async (req, res) => {
  try {
    await ensureContactTable();
    const { name, email, phone = '', companyName = '', message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: 'Name, email, and message are required' });
    }

    const result = await query(
      `INSERT INTO contact_queries (name, email, phone, company_name, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, email, phone, companyName, message]
    );

    return res.status(201).json({ message: 'Contact query submitted successfully', query: normalizeContactQuery(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to submit contact query', error: error.message });
  }
};

const getAllContactQueries = async (req, res) => {
  try {
    await ensureContactTable();
    const result = await query('SELECT * FROM contact_queries ORDER BY created_at DESC');
    return res.status(200).json({ contactQueries: result.rows.map(normalizeContactQuery) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch contact queries', error: error.message });
  }
};

const getContactQueryById = async (req, res) => {
  try {
    await ensureContactTable();
    const { id } = req.params;
    const result = await query('SELECT * FROM contact_queries WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Contact query not found' });
    }

    return res.status(200).json({ contactQuery: normalizeContactQuery(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch contact query', error: error.message });
  }
};

const updateContactQueryStatus = async (req, res) => {
  try {
    await ensureContactTable();
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'replied', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const result = await query(
      'UPDATE contact_queries SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Contact query not found' });
    }

    return res.status(200).json({ message: 'Status updated', contactQuery: normalizeContactQuery(result.rows[0]) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update status', error: error.message });
  }
};

const replyToContactQuery = async (req, res) => {
  const nodemailer = require('nodemailer');
  try {
    await ensureContactTable();
    const { id } = req.params;
    const { replyMessage, replySubject } = req.body;

    if (!replyMessage) {
      return res.status(400).json({ message: 'Reply message is required' });
    }

    const queryResult = await query('SELECT * FROM contact_queries WHERE id = $1', [id]);
    if (queryResult.rows.length === 0) {
      return res.status(404).json({ message: 'Contact query not found' });
    }

    const queryData = normalizeContactQuery(queryResult.rows[0]);
    let emailSent = false;
    let mockMode = true;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"FlutterFlirt Support" <${process.env.ADMIN_EMAIL || 'support@flutterflirt.com'}>`,
        to: queryData.email,
        subject: replySubject || `Re: Contact Query from ${queryData.name}`,
        text: replyMessage,
        html: `<p>${replyMessage.replace(/\n/g, '<br/>')}</p>`,
      });
      emailSent = true;
      mockMode = false;
    } else {
      console.log('--- MOCK EMAIL SENT (Configure SMTP_USER & SMTP_PASS in .env for real delivery) ---');
      console.log(`To: ${queryData.email}`);
      console.log(`Subject: ${replySubject || `Re: Contact Query from ${queryData.name}`}`);
      console.log(`Body: ${replyMessage}`);
      console.log('-------------------------------------------------------------------------------');
      emailSent = true;
    }

    // Automatically update the status to replied
    await query(
      "UPDATE contact_queries SET status = 'replied' WHERE id = $1",
      [id]
    );

    return res.status(200).json({
      message: mockMode ? 'Reply processed (mock email logged to console)' : 'Reply sent successfully via email',
      emailSent,
      mockMode,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to send reply', error: error.message });
  }
};

module.exports = {
  ensureContactTable,
  createContactQuery,
  getAllContactQueries,
  getContactQueryById,
  updateContactQueryStatus,
  replyToContactQuery,
};
