const path = require('path');
const { writeReport } = require('../utils/excelHelper');
const db = require('./db');

// AUDITOR: run summaries + xlsx exports.
async function exportReports() {
  const pool = db.getPool();
  const [apps] = await pool.query(
    `SELECT a.job_id, a.score, a.status, a.applied_at, a.llm_score, a.llm_verdict, a.llm_reason, j.title, j.company, j.location, j.url
     FROM applications a JOIN jobs j ON j.job_id=a.job_id
     ORDER BY a.applied_at DESC LIMIT 1000`
  );
  if (!apps.length) return null;
  const out = path.join(__dirname, '..', 'reports', `report-${Date.now()}.xlsx`);
  writeReport(apps, out);
  return out;
}

async function printSummary(runId) {
  try {
    const pool = db.getPool();
    const [[run]] = await pool.query('SELECT * FROM search_runs WHERE id=?', [runId]);
    // Scope counts to this run's window so old history (e.g. QA-era rows) doesn't pollute it.
    const since = run?.started_at || new Date(0);
    const [counts] = await pool.query(
      'SELECT status, COUNT(*) c FROM applications WHERE applied_at >= ? GROUP BY status',
      [since]
    );
    console.log('\n===== RUN SUMMARY (this run only) =====');
    console.log(`run #${runId} found=${run?.found_count} new=${run?.new_count} applied=${run?.applied_count}`);
    for (const r of counts) console.log(`  ${r.status}: ${r.c}`);
    console.log('=======================\n');
  } catch (e) {
    console.log('(summary unavailable: ' + e.message + ')');
  }
}

module.exports = { exportReports, printSummary };
