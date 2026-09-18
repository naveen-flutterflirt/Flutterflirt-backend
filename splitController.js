const fs = require('fs');

const original = fs.readFileSync('src/controllers/blogController.js', 'utf8');

const publicImports = `const db = require('../config/db');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
`;

const publicMethods = ['getAllBlogs', 'getBlogBySlug'];
const adminMethods = ['getAdminBlogs', 'getBlogById', 'createBlog', 'updateBlog', 'deleteBlog'];

function extractMethod(code, method) {
  const startStr = `const ${method} = async`;
  const startIdx = code.indexOf(startStr);
  if (startIdx === -1) return '';
  let endIdx = startIdx;
  let braceCount = 0;
  let foundBrace = false;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === '{') {
      braceCount++;
      foundBrace = true;
    } else if (code[i] === '}') {
      braceCount--;
    }
    if (foundBrace && braceCount === 0) {
      endIdx = i;
      break;
    }
  }
  return code.substring(startIdx, endIdx + 1) + ';\n\n';
}

let publicCode = publicImports + '\n';
publicMethods.forEach(m => publicCode += extractMethod(original, m));
publicCode += `module.exports = {\n  ${publicMethods.join(',\n  ')}\n};\n`;

let adminCode = publicImports + '\n';
adminMethods.forEach(m => adminCode += extractMethod(original, m));
adminCode += `module.exports = {\n  ${adminMethods.join(',\n  ')}\n};\n`;

fs.writeFileSync('src/controllers/blog/publicBlogController.js', publicCode);
fs.writeFileSync('src/controllers/blog/adminBlogController.js', adminCode);

console.log("Controllers split successfully!");
