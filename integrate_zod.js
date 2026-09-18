const fs = require('fs');

let iotRoutes = fs.readFileSync('src/routes/iotRoutes.js', 'utf8');
if (!iotRoutes.includes('const validate = require(\'../middleware/validate\');')) {
  iotRoutes = iotRoutes.replace("const { authLimiter } = require('../middleware/rateLimiter');", 
    "const { authLimiter } = require('../middleware/rateLimiter');\nconst validate = require('../middleware/validate');\nconst { registerStudentSchema, loginStudentSchema, createCourseSchema } = require('../validations/iotValidations');");
  iotRoutes = iotRoutes.replace("router.post('/iot/auth/register', authLimiter, ", "router.post('/iot/auth/register', authLimiter, validate(registerStudentSchema), ");
  iotRoutes = iotRoutes.replace("router.post('/iot/auth/login', authLimiter, ", "router.post('/iot/auth/login', authLimiter, validate(loginStudentSchema), ");
  iotRoutes = iotRoutes.replace("router.post('/admin/iot/courses', authMiddleware, ", "router.post('/admin/iot/courses', authMiddleware, validate(createCourseSchema), ");
  fs.writeFileSync('src/routes/iotRoutes.js', iotRoutes);
  console.log("Integrated zod in iotRoutes.js");
}

let adminRoutes = fs.readFileSync('src/routes/adminRoutes.js', 'utf8');
if (!adminRoutes.includes('const validate = require(\'../middleware/validate\');')) {
  adminRoutes = adminRoutes.replace("const { authLimiter } = require('../middleware/rateLimiter');", 
    "const { authLimiter } = require('../middleware/rateLimiter');\nconst validate = require('../middleware/validate');\nconst { adminLoginSchema } = require('../validations/iotValidations');");
  adminRoutes = adminRoutes.replace("router.post('/admin/login', authLimiter, ", "router.post('/admin/login', authLimiter, validate(adminLoginSchema), ");
  fs.writeFileSync('src/routes/adminRoutes.js', adminRoutes);
  console.log("Integrated zod in adminRoutes.js");
}
