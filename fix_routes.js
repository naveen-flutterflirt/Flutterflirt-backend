const fs = require('fs');

const routePath = 'src/routes/iotRoutes.js';
let content = fs.readFileSync(routePath, 'utf8');

content = content.replace(
  "const iotController = require('../controllers/iotController');",
  `const studentAuthController = require('../controllers/iot/studentAuthController');
const courseController = require('../controllers/iot/courseController');
const lectureController = require('../controllers/iot/lectureController');
const adminController = require('../controllers/iot/adminController');
const inquiryController = require('../controllers/iot/inquiryController');`
);

// Map old controller calls to new ones
content = content.replace(/iotController\.registerStudent/g, 'studentAuthController.registerStudent');
content = content.replace(/iotController\.loginStudent/g, 'studentAuthController.loginStudent');
content = content.replace(/iotController\.getStudentMe/g, 'studentAuthController.getStudentMe');
content = content.replace(/iotController\.verifyKitCode/g, 'studentAuthController.verifyKitCode');

content = content.replace(/iotController\.getPublicCourses/g, 'courseController.getPublicCourses');
content = content.replace(/iotController\.getPublicCourseBySlug/g, 'courseController.getPublicCourseBySlug');
content = content.replace(/iotController\.getAllCoursesAdmin/g, 'courseController.getAllCoursesAdmin');
content = content.replace(/iotController\.createCourseAdmin/g, 'courseController.createCourseAdmin');
content = content.replace(/iotController\.updateCourseAdmin/g, 'courseController.updateCourseAdmin');
content = content.replace(/iotController\.deleteCourseAdmin/g, 'courseController.deleteCourseAdmin');

content = content.replace(/iotController\.getPublicLectures/g, 'lectureController.getPublicLectures');
content = content.replace(/iotController\.getLecturePlayback/g, 'lectureController.getLecturePlayback');
content = content.replace(/iotController\.generatePresignedUploadUrl/g, 'lectureController.generatePresignedUploadUrl');
content = content.replace(/iotController\.uploadVideoFallback/g, 'lectureController.uploadVideoFallback');
content = content.replace(/iotController\.getAllLecturesAdmin/g, 'lectureController.getAllLecturesAdmin');
content = content.replace(/iotController\.createLectureAdmin/g, 'lectureController.createLectureAdmin');
content = content.replace(/iotController\.updateLectureAdmin/g, 'lectureController.updateLectureAdmin');
content = content.replace(/iotController\.deleteLectureAdmin/g, 'lectureController.deleteLectureAdmin');

content = content.replace(/iotController\.getDashboardOverview/g, 'adminController.getDashboardOverview');
content = content.replace(/iotController\.getAllStudentsAdmin/g, 'adminController.getAllStudentsAdmin');
content = content.replace(/iotController\.createStudentAdmin/g, 'adminController.createStudentAdmin');
content = content.replace(/iotController\.toggleStudentKitAdmin/g, 'adminController.toggleStudentKitAdmin');
content = content.replace(/iotController\.deleteStudentAdmin/g, 'adminController.deleteStudentAdmin');
content = content.replace(/iotController\.getAllCodesAdmin/g, 'adminController.getAllCodesAdmin');
content = content.replace(/iotController\.generateCodesAdmin/g, 'adminController.generateCodesAdmin');
content = content.replace(/iotController\.toggleCodeStatusAdmin/g, 'adminController.toggleCodeStatusAdmin');

content = content.replace(/iotController\.submitCollegeInquiry/g, 'inquiryController.submitCollegeInquiry');
content = content.replace(/iotController\.getAllCollegeInquiriesAdmin/g, 'inquiryController.getAllCollegeInquiriesAdmin');
content = content.replace(/iotController\.updateCollegeInquiryAdmin/g, 'inquiryController.updateCollegeInquiryAdmin');
content = content.replace(/iotController\.deleteCollegeInquiryAdmin/g, 'inquiryController.deleteCollegeInquiryAdmin');

fs.writeFileSync(routePath, content);
console.log('Routes fixed');
