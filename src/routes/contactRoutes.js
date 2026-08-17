const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const authMiddleware = require('../middleware/auth');

router.post('/contact', contactController.createContactQuery);
router.get('/admin/contact-queries', authMiddleware, contactController.getAllContactQueries);
router.get('/admin/contact-queries/:id', authMiddleware, contactController.getContactQueryById);
router.patch('/admin/contact-queries/:id/status', authMiddleware, contactController.updateContactQueryStatus);

module.exports = router;
