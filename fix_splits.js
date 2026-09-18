const fs = require('fs');

const files = [
  'src/controllers/iot/studentAuthController.js',
  'src/controllers/iot/courseController.js',
  'src/controllers/iot/lectureController.js',
  'src/controllers/iot/adminController.js',
  'src/controllers/iot/inquiryController.js'
];

const s3ClientCode = `
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
`;

files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace("require('../../config/database')", "require('../../config/db')");
  content = content.replace("const { getS3Client } = require('../../config/s3');", s3ClientCode);
  fs.writeFileSync(f, content);
});
console.log('Fixed imports!');
