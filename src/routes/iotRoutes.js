const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { registerStudentSchema, loginStudentSchema, createCourseSchema } = require('../validations/iotValidations');
const studentAuthController = require('../controllers/iot/studentAuthController');
const courseController = require('../controllers/iot/courseController');
const lectureController = require('../controllers/iot/lectureController');
const adminController = require('../controllers/iot/adminController');
const inquiryController = require('../controllers/iot/inquiryController');

// Multer memory storage for direct video upload fallback (up to 300MB)
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 300 * 1024 * 1024, // 300 MB limit
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|webm|ogg|mov|mkv/;
    const mimetype = filetypes.test(file.mimetype) || file.mimetype.startsWith('video/');
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype || extname) {
      return cb(null, true);
    }
    cb(new Error('Only video files (.mp4, .webm, .ogg, .mov, .mkv) are allowed!'));
  },
});

// ==========================================
// PUBLIC & STUDENT ROUTES
// ==========================================

// Student Authentication
router.post('/iot/auth/register', authLimiter, validate(registerStudentSchema), studentAuthController.registerStudent);
router.post('/iot/auth/login', authLimiter, validate(loginStudentSchema), studentAuthController.loginStudent);
router.get('/iot/auth/me', studentAuthController.getStudentMe);

// Get all published lectures (with locked/unlocked state depending on bearer token)
router.get('/iot/lectures', lectureController.getPublicLectures);

// Dynamic Courses / Masterclasses
router.get('/iot/courses', courseController.getPublicCourses);
router.get('/iot/courses/:slug', courseController.getPublicCourseBySlug);

// Get playback stream URL for a specific lecture (requires unlocked kit token)
router.get('/iot/lectures/:id/playback', lectureController.getLecturePlayback);

// Verify student Niva Hardware Kit activation code
router.post('/iot/verify-code', studentAuthController.verifyKitCode);

// University & College Partnership Inquiry (Public)
router.post('/iot/college-inquiry', inquiryController.submitCollegeInquiry);

// ==========================================
// ADMIN ROUTES (Protected)
// ==========================================

// Global Dashboard Overview & Analytics
router.get('/admin/iot/dashboard-overview', authMiddleware, adminController.getDashboardOverview);

// Students Management
router.get('/admin/iot/students', authMiddleware, adminController.getAllStudentsAdmin);
router.post('/admin/iot/students', authMiddleware, adminController.createStudentAdmin);
router.patch('/admin/iot/students/:id/toggle-kit', authMiddleware, adminController.toggleStudentKitAdmin);
router.delete('/admin/iot/students/:id', authMiddleware, adminController.deleteStudentAdmin);

// University & College Partnership Inquiries
router.get('/admin/iot/college-inquiries', authMiddleware, inquiryController.getAllCollegeInquiriesAdmin);
router.patch('/admin/iot/college-inquiries/:id', authMiddleware, inquiryController.updateCollegeInquiryAdmin);
router.delete('/admin/iot/college-inquiries/:id', authMiddleware, inquiryController.deleteCollegeInquiryAdmin);

// AWS S3 Presigned URL for high-speed direct client-to-S3 video upload
router.post('/admin/iot/presigned-upload-url', authMiddleware, lectureController.generatePresignedUploadUrl);

// Multer fallback video upload
router.post('/admin/iot/upload-video', authMiddleware, videoUpload.single('video'), lectureController.uploadVideoFallback);

// Dynamic IoT Courses CRUD
router.get('/admin/iot/courses', authMiddleware, courseController.getAllCoursesAdmin);
router.post('/admin/iot/courses', authMiddleware, validate(createCourseSchema), courseController.createCourseAdmin);
router.put('/admin/iot/courses/:id', authMiddleware, courseController.updateCourseAdmin);
router.delete('/admin/iot/courses/:id', authMiddleware, courseController.deleteCourseAdmin);

// IoT Lecture CRUD
router.get('/admin/iot/lectures', authMiddleware, lectureController.getAllLecturesAdmin);
router.post('/admin/iot/lectures', authMiddleware, lectureController.createLectureAdmin);
router.put('/admin/iot/lectures/:id', authMiddleware, lectureController.updateLectureAdmin);
router.delete('/admin/iot/lectures/:id', authMiddleware, lectureController.deleteLectureAdmin);

// Kit Access Codes Management
router.get('/admin/iot/codes', authMiddleware, adminController.getAllCodesAdmin);
router.post('/admin/iot/codes/generate', authMiddleware, adminController.generateCodesAdmin);
router.patch('/admin/iot/codes/:id/toggle', authMiddleware, adminController.toggleCodeStatusAdmin);

module.exports = router;
