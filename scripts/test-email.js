require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmailConnection() {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_FROM
  } = process.env;

  console.log('Testing SMTP connection with settings:');
  console.log('SMTP_HOST:', SMTP_HOST);
  console.log('SMTP_PORT:', SMTP_PORT);
  console.log('SMTP_USER:', SMTP_USER);
  console.log('SMTP_PASS:', SMTP_PASS ? '********' : 'Not Set');
  console.log('SMTP_FROM:', SMTP_FROM);
  console.log('-------------------------------------------');

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    console.error('Error: SMTP variables are missing in your .env file!');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: false, // TLS
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Attempting to connect to Outlook SMTP server...');
    await transporter.verify();
    console.log('Success! SMTP connection established successfully.');

    console.log('Sending a test email...');
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: 'keshavprajapati357@gmail.com', // Send it to test recipient
      subject: 'FlutterFlirt SMTP Connection Test',
      text: 'This is a test email to verify that your Outlook SMTP authentication is working correctly.',
      html: '<p>This is a test email to verify that your Outlook SMTP authentication is working correctly.</p>',
    });

    console.log('Test email sent successfully! Message ID:', info.messageId);
  } catch (error) {
    console.error('SMTP Check: FAILED!');
    console.error('Error details:', error.message);
  }
}

testEmailConnection();
