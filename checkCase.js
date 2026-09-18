const fs = require('fs');
const path = require('path');
function checkDir(dir) {
  let hasError = false;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      hasError = checkDir(fullPath) || hasError;
    } else if (fullPath.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const regex = /require\(['"](\.[^'"]+)['"]\)/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const reqPath = match[1];
        let target = path.resolve(dir, reqPath);
        if (!target.endsWith('.js') && !target.endsWith('.json')) target += '.js';
        const targetDir = path.dirname(target);
        const targetBase = path.basename(target);
        if (fs.existsSync(targetDir)) {
          const actualFiles = fs.readdirSync(targetDir);
          if (!actualFiles.includes(targetBase)) {
            if (actualFiles.includes(path.basename(reqPath, '.js'))) {
               const p = path.join(targetDir, path.basename(reqPath, '.js'));
               if (fs.statSync(p).isDirectory()) {
                  if (!fs.readdirSync(p).includes('index.js')) {
                     console.error('Case mismatch or missing index: ' + reqPath + ' in ' + fullPath);
                     hasError = true;
                  }
                  continue;
               }
            }
            console.error('Case mismatch or missing: ' + reqPath + ' in ' + fullPath + ' (Looking for ' + targetBase + ')');
            hasError = true;
          }
        }
      }
    }
  }
  return hasError;
}
if (!checkDir('./src')) console.log('All local requires match case perfectly.');
