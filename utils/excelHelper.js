const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeReport(rows, outPath) {
  ensureDir(path.dirname(outPath));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'jobs');
  XLSX.writeFile(wb, outPath);
}

module.exports = { ensureDir, writeReport };
