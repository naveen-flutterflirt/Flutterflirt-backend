const fs = require('fs');
const path = require('path');

const srcFile = 'src/controllers/iotController.js';
const targetDir = 'src/controllers/iot';

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

let code = fs.readFileSync(srcFile, 'utf8');

const baseImports = `
const { pool } = require('../../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getS3Client } = require('../../config/s3');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const slugify = require('slugify');
`;

const extractFunction = (funcName) => {
  // Finds `exports.funcName = async (req, res) => { ... };` with everything in between until the next `exports.` or end of file
  const regex = new RegExp(`exports\\.${funcName}\\s*=\\s*async\\s*\\(req,\\s*res\\)\\s*=>\\s*\\{[\\s\\S]*?\\n\\};`, 'm');
  const match = code.match(regex);
  if (match) return match[0] + '\n';
  
  // Try finding standard function
  const regex2 = new RegExp(`const\\s+${funcName}\\s*=\\s*async\\s*\\(req,\\s*res\\)\\s*=>\\s*\\{[\\s\\S]*?\\n\\};`, 'm');
  const match2 = code.match(regex2);
  if (match2) return match2[0] + '\n';
  
  return `// ${funcName} NOT FOUND\n`;
};

const extractHelper = (funcName) => {
  const regex = new RegExp(`const\\s+${funcName}\\s*=\\s*\\([\\s\\S]*?\\)\\s*=>\\s*\\{[\\s\\S]*?\\n\\};`, 'm');
  const match = code.match(regex);
  if (match) return match[0] + '\n';
  return `// ${funcName} NOT FOUND\n`;
}

// Helpers
const verifyAccessCode = extractHelper('verifyAccess');

// 1. studentAuthController.js
const studentAuthFuncs = ['registerStudent', 'loginStudent', 'getStudentMe', 'verifyKitCode'];
let studentAuthCode = baseImports + '\n' + verifyAccessCode + '\n';
studentAuthFuncs.forEach(f => studentAuthCode += extractFunction(f) + '\n');
fs.writeFileSync(path.join(targetDir, 'studentAuthController.js'), studentAuthCode);

// 2. courseController.js
const courseFuncs = ['getPublicCourses', 'getPublicCourseBySlug', 'getAllCoursesAdmin', 'createCourseAdmin', 'updateCourseAdmin', 'deleteCourseAdmin'];
let courseCode = baseImports + '\n' + verifyAccessCode + '\n';
courseFuncs.forEach(f => courseCode += extractFunction(f) + '\n');
fs.writeFileSync(path.join(targetDir, 'courseController.js'), courseCode);

// 3. lectureController.js
const lectureFuncs = ['getPublicLectures', 'getLecturePlayback', 'generatePresignedUploadUrl', 'uploadVideoFallback', 'getAllLecturesAdmin', 'createLectureAdmin', 'updateLectureAdmin', 'deleteLectureAdmin'];
let lectureCode = baseImports + '\n' + verifyAccessCode + '\n';
lectureFuncs.forEach(f => lectureCode += extractFunction(f) + '\n');
fs.writeFileSync(path.join(targetDir, 'lectureController.js'), lectureCode);

// 4. adminController.js
const adminFuncs = ['getDashboardOverview', 'getAllStudentsAdmin', 'createStudentAdmin', 'toggleStudentKitAdmin', 'deleteStudentAdmin', 'getAllCodesAdmin', 'generateCodesAdmin', 'toggleCodeStatusAdmin'];
let adminCode = baseImports + '\n';
adminFuncs.forEach(f => adminCode += extractFunction(f) + '\n');
fs.writeFileSync(path.join(targetDir, 'adminController.js'), adminCode);

// 5. inquiryController.js
const inquiryFuncs = ['submitCollegeInquiry', 'getAllCollegeInquiriesAdmin', 'updateCollegeInquiryAdmin', 'deleteCollegeInquiryAdmin'];
let inquiryCode = baseImports + '\n';
inquiryFuncs.forEach(f => inquiryCode += extractFunction(f) + '\n');
fs.writeFileSync(path.join(targetDir, 'inquiryController.js'), inquiryCode);

console.log('Split complete!');
