const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "db", "migrations");
const dest = path.join(__dirname, "..", "dist", "db", "migrations");

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(src, dest);
console.log("Migrations copied to dist/db/migrations");
