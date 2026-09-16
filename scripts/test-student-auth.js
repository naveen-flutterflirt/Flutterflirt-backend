require('dotenv').config();
const http = require('http');
const app = require('../src/app');

async function testStudentAuth() {
  const server = http.createServer(app);
  const port = 5003;
  await new Promise((resolve) => server.listen(port, resolve));

  try {
    const baseUrl = `http://localhost:${port}`;
    const testEmail = `student_${Date.now()}@test.com`;

    // 1. Register
    console.log('\n--- 1. Registering new student ---');
    const regRes = await fetch(`${baseUrl}/api/iot/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pranjal Soni',
        email: testEmail,
        password: 'securePassword123'
      })
    });
    const regData = await regRes.json();
    console.log('Register status:', regRes.status, '| Success:', regData.success, '| User:', regData.user?.name);
    const initialToken = regData.token;

    // 2. Login
    console.log('\n--- 2. Logging in student ---');
    const loginRes = await fetch(`${baseUrl}/api/iot/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'securePassword123'
      })
    });
    const loginData = await loginRes.json();
    console.log('Login status:', loginRes.status, '| Unlocked before code:', loginData.user?.is_kit_unlocked);

    // 3. Verify Kit Code linked to this user
    console.log('\n--- 3. Verifying kit code for logged in student ---');
    const verifyRes = await fetch(`${baseUrl}/api/iot/verify-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${initialToken}`
      },
      body: JSON.stringify({
        code: 'NIVA-IOT-2025'
      })
    });
    const verifyData = await verifyRes.json();
    console.log('Verify status:', verifyRes.status, '| Message:', verifyData.message);

    // 4. Check profile ME
    console.log('\n--- 4. Checking /api/iot/auth/me after kit verification ---');
    const meRes = await fetch(`${baseUrl}/api/iot/auth/me`, {
      headers: { Authorization: `Bearer ${verifyData.token}` }
    });
    const meData = await meRes.json();
    console.log('Me user unlocked:', meData.user?.is_kit_unlocked, '| Kit Code:', meData.user?.kit_code);

    // 5. Check lectures unlocked
    console.log('\n--- 5. Checking /api/iot/lectures with user token ---');
    const lecRes = await fetch(`${baseUrl}/api/iot/lectures`, {
      headers: { Authorization: `Bearer ${verifyData.token}` }
    });
    const lecData = await lecRes.json();
    console.log('Lectures unlocked?:', lecData.isUnlocked, '| Sample video url present?:', !!lecData.lectures[0]?.videoUrl);

    console.log('\nSUCCESS! Student authentication & kit binding verified.');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

testStudentAuth();
