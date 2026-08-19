require('dotenv').config();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

async function testS3Connection() {
  const {
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_S3_BUCKET
  } = process.env;

  console.log('Testing S3 Connection with the following configuration:');
  console.log('AWS_ACCESS_KEY_ID:', AWS_ACCESS_KEY_ID ? '***' + AWS_ACCESS_KEY_ID.slice(-4) : 'Not Set');
  console.log('AWS_SECRET_ACCESS_KEY:', AWS_SECRET_ACCESS_KEY ? 'Present (Hidden)' : 'Not Set');
  console.log('AWS_REGION:', AWS_REGION || 'Not Set');
  console.log('AWS_S3_BUCKET:', AWS_S3_BUCKET || 'Not Set');
  console.log('--------------------------------------------------');

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_REGION || !AWS_S3_BUCKET) {
    console.error('Error: One or more S3 environment variables are missing in your .env file!');
    process.exit(1);
  }

  const s3 = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });

  const testKey = `test-${Date.now()}.txt`;
  const testBody = 'This is a test file to verify S3 permissions and connection.';

  try {
    console.log(`Attempting to upload test file "${testKey}" to bucket "${AWS_S3_BUCKET}"...`);
    
    await s3.send(
      new PutObjectCommand({
        Bucket: AWS_S3_BUCKET,
        Key: testKey,
        Body: testBody,
        ContentType: 'text/plain',
      })
    );

    const publicUrl = `https://${AWS_S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${testKey}`;
    console.log('\nSuccess! File uploaded successfully.');
    console.log('Generated S3 URL:', publicUrl);
    console.log('--------------------------------------------------');
    console.log('Now testing accessibility...');
    
    const response = await fetch(publicUrl);
    if (response.ok) {
      console.log('Public Read Check: PASSED! The URL is publicly readable.');
    } else {
      console.log(`Public Read Check: FAILED (Status: ${response.status}).`);
      console.log('Make sure to uncheck "Block all public access" and attach the public read bucket policy in AWS S3.');
    }
  } catch (error) {
    console.error('\nUpload Check: FAILED!');
    console.error('Error details:', error.message);
  }
}

testS3Connection();
