const express = require('express');
const router = express.Router();
const publicBlogController = require('../controllers/blog/publicBlogController');
const adminBlogController = require('../controllers/blog/adminBlogController');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createBlogSchema } = require('../validations/blogValidations');

// Public Blog Endpoints
router.get('/blogs', publicBlogController.getAllBlogs);
router.get('/blogs/:slug', publicBlogController.getBlogBySlug);

// Admin Blog Endpoints
router.get('/admin/blogs', authMiddleware, adminBlogController.getAdminBlogs);
router.get('/admin/blogs/:id', authMiddleware, adminBlogController.getBlogById);
router.post('/admin/blogs', authMiddleware, validate(createBlogSchema), adminBlogController.createBlog);
router.put('/admin/blogs/:id', authMiddleware, validate(createBlogSchema), adminBlogController.updateBlog);
router.delete('/admin/blogs/:id', authMiddleware, adminBlogController.deleteBlog);

module.exports = router;
