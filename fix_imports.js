const fs = require('fs');

const fixImports = (file) => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/const db = require\('\.\.\/config\/db'\);/, 'const db = require("../../config/db");');
  
  if (!content.includes('NodeCache')) {
    const importStr = `const NodeCache = require("node-cache");\nconst blogCache = new NodeCache({ stdTTL: 300 });\n`;
    content = content.replace("const { v4: uuidv4 } = require('uuid');", "const { v4: uuidv4 } = require('uuid');\n" + importStr);
  }
  
  fs.writeFileSync(file, content);
};

fixImports('src/controllers/blog/publicBlogController.js');
fixImports('src/controllers/blog/adminBlogController.js');
