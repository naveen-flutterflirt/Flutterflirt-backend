const fs = require('fs');

// Update iotRoutes.js
let iotRoutes = fs.readFileSync('src/routes/iotRoutes.js', 'utf8');
if (!iotRoutes.includes('const { authLimiter } = require(\'../middleware/rateLimiter\');')) {
  iotRoutes = iotRoutes.replace("const authMiddleware = require('../middleware/auth');", 
    "const authMiddleware = require('../middleware/auth');\nconst { authLimiter } = require('../middleware/rateLimiter');");
  iotRoutes = iotRoutes.replace("router.post('/iot/auth/register', ", "router.post('/iot/auth/register', authLimiter, ");
  iotRoutes = iotRoutes.replace("router.post('/iot/auth/login', ", "router.post('/iot/auth/login', authLimiter, ");
  fs.writeFileSync('src/routes/iotRoutes.js', iotRoutes);
  console.log("Updated iotRoutes.js");
}

// Update adminRoutes.js
let adminRoutes = fs.readFileSync('src/routes/adminRoutes.js', 'utf8');
if (!adminRoutes.includes('const { authLimiter } = require(\'../middleware/rateLimiter\');')) {
  adminRoutes = adminRoutes.replace("const adminController = require('../controllers/adminController');", 
    "const adminController = require('../controllers/adminController');\nconst { authLimiter } = require('../middleware/rateLimiter');");
  adminRoutes = adminRoutes.replace("router.post('/admin/login', ", "router.post('/admin/login', authLimiter, ");
  fs.writeFileSync('src/routes/adminRoutes.js', adminRoutes);
  console.log("Updated adminRoutes.js");
}
