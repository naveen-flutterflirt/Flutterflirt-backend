const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const iotController = require('../controllers/iotController');

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
router.post('/iot/auth/register', iotController.registerStudent);
router.post('/iot/auth/login', iotController.loginStudent);
router.get('/iot/auth/me', iotController.getStudentMe);

// Get all published lectures (with locked/unlocked state depending on bearer token)
router.get('/iot/lectures', iotController.getPublicLectures);

// Dynamic Courses / Masterclasses
router.get('/iot/courses', iotController.getPublicCourses);
router.get('/iot/courses/:slug', iotController.getPublicCourseBySlug);

// Get playback stream URL for a specific lecture (requires unlocked kit token)
router.get('/iot/lectures/:id/playback', iotController.getLecturePlayback);

// Verify student Niva Hardware Kit activation code
router.post('/iot/verify-code', iotController.verifyKitCode);

// University & College Partnership Inquiry (Public)
router.post('/iot/college-inquiry', iotController.submitCollegeInquiry);

// ==========================================
// ADMIN ROUTES (Protected)
// ==========================================

// Global Dashboard Overview & Analytics
router.get('/admin/iot/dashboard-overview', authMiddleware, iotController.getDashboardOverview);

// Students Management
router.get('/admin/iot/students', authMiddleware, iotController.getAllStudentsAdmin);
router.post('/admin/iot/students', authMiddleware, iotController.createStudentAdmin);
router.patch('/admin/iot/students/:id/toggle-kit', authMiddleware, iotController.toggleStudentKitAdmin);
router.delete('/admin/iot/students/:id', authMiddleware, iotController.deleteStudentAdmin);

// University & College Partnership Inquiries
router.get('/admin/iot/college-inquiries', authMiddleware, iotController.getAllCollegeInquiriesAdmin);
router.patch('/admin/iot/college-inquiries/:id', authMiddleware, iotController.updateCollegeInquiryAdmin);
router.delete('/admin/iot/college-inquiries/:id', authMiddleware, iotController.deleteCollegeInquiryAdmin);

// AWS S3 Presigned URL for high-speed direct client-to-S3 video upload
router.post('/admin/iot/presigned-upload-url', authMiddleware, iotController.generatePresignedUploadUrl);

// Multer fallback video upload
router.post('/admin/iot/upload-video', authMiddleware, videoUpload.single('video'), iotController.uploadVideoFallback);

// Dynamic IoT Courses CRUD
router.get('/admin/iot/courses', authMiddleware, iotController.getAllCoursesAdmin);
router.post('/admin/iot/courses', authMiddleware, iotController.createCourseAdmin);
router.put('/admin/iot/courses/:id', authMiddleware, iotController.updateCourseAdmin);
router.delete('/admin/iot/courses/:id', authMiddleware, iotController.deleteCourseAdmin);

// IoT Lecture CRUD
router.get('/admin/iot/lectures', authMiddleware, iotController.getAllLecturesAdmin);
router.post('/admin/iot/lectures', authMiddleware, iotController.createLectureAdmin);
router.put('/admin/iot/lectures/:id', authMiddleware, iotController.updateLectureAdmin);
router.delete('/admin/iot/lectures/:id', authMiddleware, iotController.deleteLectureAdmin);

// Kit Access Codes Management
router.get('/admin/iot/codes', authMiddleware, iotController.getAllCodesAdmin);
router.post('/admin/iot/codes/generate', authMiddleware, iotController.generateCodesAdmin);
router.patch('/admin/iot/codes/:id/toggle', authMiddleware, iotController.toggleCodeStatusAdmin);

module.exports = router;
