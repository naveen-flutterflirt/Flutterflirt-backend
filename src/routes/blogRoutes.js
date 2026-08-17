const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const authMiddleware = require('../middleware/auth');

router.get('/blogs', blogController.getAllBlogs);
router.get('/blogs/:slug', blogController.getBlogBySlug);

router.get('/admin/blogs', authMiddleware, blogController.getAdminBlogs);
router.post('/admin/blogs', authMiddleware, blogController.createBlog);
router.put('/admin/blogs/:id', authMiddleware, blogController.updateBlog);
router.delete('/admin/blogs/:id', authMiddleware, blogController.deleteBlog);

module.exports = router;
