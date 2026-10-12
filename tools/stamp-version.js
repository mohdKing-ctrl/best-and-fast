/* stamp-version.js - gives every css / js file in index.html and bill.html a version stamp that changes
   whenever the file changes:   js/app.js  ->  js/app.js?v=3fa91c2e

   Why: Hostinger's CDN and browsers keep .js / .css files for days. A changed file with the same
   address can then be served OLD (or mixed with new files). A new address cannot.

   Run from the project folder before every push:   node tools/stamp-version.js
   (Claude runs it for you whenever a change is pushed.)                                    */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const root = path.join(__dirname, '..');
let changed = 0, total = 0;

for (const page of ['index.html', 'bill.html']) {
  const htmlPath = path.join(root, page);
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html.replace(/(<script src=|<link rel="stylesheet" href=)"((?:js|css)\/[A-Za-z0-9._-]+\.(?:js|css))(?:\?v=[A-Za-z0-9]+)?"/g, (m, tag, file) => {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) throw new Error(page + ' refers to a missing file: ' + file);
    // hash the text with Unix line endings, so Windows and Linux copies give the same stamp
    const text = fs.readFileSync(abs).toString('utf8').replace(/\r\n/g, '\n');
    const v = crypto.createHash('sha1').update(text).digest('hex').slice(0, 8);
    const out = tag + '"' + file + '?v=' + v + '"';
    total++; if (out !== m) changed++;
    return out;
  });
  fs.writeFileSync(htmlPath, html);
}
console.log('version stamps: ' + total + ' files checked, ' + changed + ' updated');