const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const authMiddleware = require('../middleware/auth');

// Public Blog Endpoints (Specification compliant)
router.get('/blogs', blogController.getAllBlogs);
router.get('/blogs/:slug', blogController.getBlogBySlug);
router.post('/blogs', blogController.createBlog);
router.put('/blogs/:id', blogController.updateBlog);
router.delete('/blogs/:id', blogController.deleteBlog);

// Admin Blog Endpoints
router.get('/admin/blogs', authMiddleware, blogController.getAdminBlogs);
router.get('/admin/blogs/:id', authMiddleware, blogController.getBlogById);
router.post('/admin/blogs', authMiddleware, blogController.createBlog);
router.put('/admin/blogs/:id', authMiddleware, blogController.updateBlog);
router.delete('/admin/blogs/:id', authMiddleware, blogController.deleteBlog);

module.exports = router;
