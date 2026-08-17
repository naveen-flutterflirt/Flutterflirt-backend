const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

router.post('/admin/login', adminController.loginAdmin);

module.exports = router;
