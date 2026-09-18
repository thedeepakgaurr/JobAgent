const mysql = require('mysql2/promise');
const config = require('./config');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }
  return pool;
}

async function logEvent(runId, level, message) {
  try {
    await getPool().execute('INSERT INTO events (run_id, level, message) VALUES (?,?,?)', [
      runId || null,
      level,
      String(message).slice(0, 4000),
    ]);
  } catch {
    // logging must never crash a run
  }
}

async function startRun(keywords, location) {
  const [r] = await getPool().execute(
    'INSERT INTO search_runs (keywords, location) VALUES (?,?)',
    [keywords.join(', '), location || '']
  );
  return r.insertId;
}

async function finishRun(runId, { found, fresh, applied }) {
  await getPool().execute(
    'UPDATE search_runs SET found_count=?, new_count=?, applied_count=?, finished_at=NOW() WHERE id=?',
    [found, fresh, applied, runId]
  );
}

async function upsertJob(job) {
  await getPool().execute(
    `INSERT INTO jobs (job_id, url, title, company, location, posted_text)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE url=VALUES(url), title=VALUES(title),
       company=VALUES(company), location=VALUES(location), posted_text=VALUES(posted_text)`,
    [job.jobId, job.url, job.title || '', job.company || '', job.location || '', job.posted || '']
  );
}

// Returns true if this job_id has NO application row yet (i.e. fresh).
async function isFresh(jobId) {
  const [rows] = await getPool().execute('SELECT 1 FROM applications WHERE job_id=? LIMIT 1', [
    jobId,
  ]);
  return rows.length === 0;
}

// Count of real applies since midnight (DB server date). Dry-runs are 'skipped', so excluded.
async function countAppliedToday() {
  const [rows] = await getPool().execute(
    "SELECT COUNT(*) AS c FROM applications WHERE status='applied' AND applied_at >= CURDATE()"
  );
  return rows[0]?.c ?? 0;
}

async function recordApplication({ jobId, score, status, answers, screenshot, error, llm }) {
  await getPool().execute(
    `INSERT INTO applications (job_id, score, status, answers_json, screenshot_path, error, llm_score, llm_verdict, llm_reason)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE score=VALUES(score), status=VALUES(status),
       answers_json=VALUES(answers_json), screenshot_path=VALUES(screenshot_path), error=VALUES(error),
       llm_score=VALUES(llm_score), llm_verdict=VALUES(llm_verdict), llm_reason=VALUES(llm_reason)`,
    [
      jobId,
      score || 0,
      status,
      answers ? JSON.stringify(answers) : null,
      screenshot || '',
      (error || '').slice(0, 1000),
      llm?.score ?? null,
      llm?.verdict || '',
      (llm?.reason || '').slice(0, 1000),
    ]
  );
}

async function seedAnswers(answers) {
  const entries = Object.entries(answers);
  for (const [k, v] of entries) {
    await getPool().execute(
      'INSERT INTO questionnaire_answers (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
      [k, String(v)]
    );
  }
}

module.exports = {
  getPool,
  logEvent,
  startRun,
  finishRun,
  upsertJob,
  isFresh,
  countAppliedToday,
  recordApplication,
  seedAnswers,
};
