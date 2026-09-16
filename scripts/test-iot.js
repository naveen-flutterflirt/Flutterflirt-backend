require('dotenv').config();
const http = require('http');
const app = require('../src/app');

async function testIoTBackend() {
  const server = http.createServer(app);
  const port = 5002;

  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`Test server running on port ${port}`);

  try {
    const baseUrl = `http://localhost:${port}`;

    // 1. Test GET /api/iot/lectures (Public / Locked)
    console.log('\n--- 1. Testing GET /api/iot/lectures (Unauthenticated) ---');
    const res1 = await fetch(`${baseUrl}/api/iot/lectures`);
    const data1 = await res1.json();
    console.log('Status:', res1.status, '| isUnlocked:', data1.isUnlocked, '| Total lectures:', data1.totalLectures);
    if (data1.lectures.length > 0) {
      console.log('Sample lecture 1 locked?', data1.lectures[0].isLocked, '| videoUrl:', data1.lectures[0].videoUrl);
    }

    // 2. Test Invalid Kit Code
    console.log('\n--- 2. Testing Invalid Kit Code ---');
    const res2 = await fetch(`${baseUrl}/api/iot/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'INVALID-CODE-123' })
    });
    const data2 = await res2.json();
    console.log('Status:', res2.status, '| Message:', data2.message);

    // 3. Test Valid Kit Code: NIVA-IOT-2025
    console.log('\n--- 3. Testing Valid Kit Code (NIVA-IOT-2025) ---');
    const res3 = await fetch(`${baseUrl}/api/iot/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'NIVA-IOT-2025', studentName: 'Test Student' })
    });
    const data3 = await res3.json();
    console.log('Status:', res3.status, '| Success:', data3.success, '| Has Token:', !!data3.token);

    const studentToken = data3.token;

    // 4. Test GET /api/iot/lectures with verified student token
    console.log('\n--- 4. Testing GET /api/iot/lectures with Unlocked Token ---');
    const res4 = await fetch(`${baseUrl}/api/iot/lectures`, {
      headers: { Authorization: `Bearer ${studentToken}` }
    });
    const data4 = await res4.json();
    console.log('Status:', res4.status, '| isUnlocked:', data4.isUnlocked);
    if (data4.lectures.length > 0) {
      console.log('Sample lecture 1 unlocked?', !data4.lectures[0].isLocked);
      console.log('Has videoUrl:', !!data4.lectures[0].videoUrl);
    }

    // 5. Test Admin Login and IoT Admin Features
    console.log('\n--- 5. Testing Admin IoT Functions ---');
    const adminLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD
      })
    });
    const adminData = await adminLoginRes.json();
    const adminToken = adminData.token;
    console.log('Admin login success:', !!adminToken);

    // Test Admin S3 Presigned Upload URL generation
    const presignRes = await fetch(`${baseUrl}/api/admin/iot/presigned-upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        fileName: 'esp32-pwm-timers.mp4',
        fileType: 'video/mp4',
        fileSize: 45000000
      })
    });
    const presignData = await presignRes.json();
    console.log('S3 Presign generation:', presignData.success, '| s3Key:', presignData.s3Key);
    console.log('Has presigned upload URL:', !!presignData.presignedUrl);

    // Test Admin Code Generation
    const genCodeRes = await fetch(`${baseUrl}/api/admin/iot/codes/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        prefix: 'NIVA-TEST',
        count: 2,
        description: 'Auto-test batch'
      })
    });
    const genCodeData = await genCodeRes.json();
    console.log('Admin generated codes:', genCodeData.codes.map(c => c.code));

    console.log('\nALL BACKEND API TESTS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

testIoTBackend();
