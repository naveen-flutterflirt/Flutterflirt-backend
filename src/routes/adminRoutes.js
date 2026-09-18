const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { adminLoginSchema } = require('../validations/iotValidations');

router.post('/admin/login', authLimiter, validate(adminLoginSchema), adminController.loginAdmin);

module.exports = router;
