const { humanDelay } = require('../utils/helpers');
const { detectState, clickApply, answerQuestions, saveShot, fetchJD, isBlocked } = require('../pages/JobsPage');
const { scoreJob, shouldApply } = require('./matcher');
const llm = require('./llm');
const config = require('./config');
const db = require('./db');

// APPLIER: open job -> dedupe already done upstream -> score -> click apply -> handle modal.
async function applyToJob(page, job, profile, opts, onLog) {
  const say = onLog || (() => {});
  const { dryRun, easyApplyOnly, answers } = opts;

  await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  if (await isBlocked(page)) {
    say('Rate-block (Access Denied) — backing off 25s and reloading once...');
    await page.waitForTimeout(25000);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  if (await isBlocked(page)) {
    await rec({ jobId: job.jobId, score: 0, status: 'failed', error: 'access-denied rate block' });
    throw new Error('Access Denied rate block — aborting run to protect the account');
  }
  const jd = await fetchJD(page);
  if (jd) {
    try {
      await db.getPool().execute('UPDATE jobs SET jd_text=? WHERE job_id=?', [jd, job.jobId]);
    } catch {}
  }

  const scored = scoreJob(job, profile, jd);
  const decision = shouldApply(scored, profile);
  say(`Matcher: "${job.title}" @ ${job.company} -> score ${scored.score} [${scored.hits.join('|')}] jd=${jd.length} :: ${decision.reason}`);
  let finalScore = scored.score;
  let L = undefined; // LLM record for this job (set by the LLM stage below)
  const rec = (fields) => db.recordApplication({ llm: L, ...fields });
  if (!decision.ok) {
    await rec({ jobId: job.jobId, score: finalScore, status: 'skipped', error: decision.reason });
    return { outcome: 'skipped', score: finalScore, reason: decision.reason };
  }

  // LLM STAGE (final decider, fail-closed). Only judges rules survivors to save quota.
  if (config.llm.enabled && finalScore >= config.llm.minRulesScore) {
    const v = await llm.judgeJob(job, { rulesScore: finalScore, rulesHits: scored.hits, jd });
    if (!v.ok) {
      say(`LLM-ERROR (fail-closed, skipping): ${job.title} :: ${v.error}`);
      await rec({
        jobId: job.jobId,
        score: finalScore,
        status: 'skipped',
        error: 'llm-error: ' + v.error,
        llm: { score: null, verdict: 'error', reason: v.error },
      });
      return { outcome: 'skipped', score: finalScore, reason: 'llm-error' };
    }
    say(`LLM: "${job.title}" -> score ${v.score} ${v.apply ? 'APPLY' : 'SKIP'} [${(v.flags || []).join('|')}] (${v.ms}ms) :: ${v.reason}`);
    if (!v.apply || v.score < config.llm.threshold) {
      await rec({
        jobId: job.jobId,
        score: v.score,
        status: 'skipped',
        error: 'llm: ' + v.reason,
        llm: { score: v.score, verdict: 'skip', reason: v.reason },
      });
      return { outcome: 'skipped', score: v.score, reason: 'llm: ' + v.reason };
    }
    finalScore = v.score;
    L = { score: v.score, verdict: 'apply', reason: v.reason };
  }

  if (dryRun) {
    say(`DRY-RUN: would apply ${job.url}`);
    await rec({ jobId: job.jobId, score: finalScore, status: 'skipped', error: 'dry-run' });
    return { outcome: 'skipped', score: finalScore, reason: 'dry-run' };
  }

  const state = await detectState(page);
  if (state === 'already_applied') {
    await rec({ jobId: job.jobId, score: finalScore, status: 'already_applied' });
    return { outcome: 'already_applied', score: finalScore };
  }
  if (state === 'captcha') {
    const shot = await saveShot(page, job.jobId);
    await rec({ jobId: job.jobId, score: finalScore, status: 'failed', screenshot: shot, error: 'captcha' });
    throw new Error('CAPTCHA detected — aborting run');
  }
  if (state === 'external') {
    if (easyApplyOnly) {
      await rec({ jobId: job.jobId, score: finalScore, status: 'manual', error: 'company-site redirect (EASY_APPLY_ONLY)' });
      return { outcome: 'manual', score: finalScore };
    }
    // else fall through and click anyway (user opted out of the guard)
  }
  if (state === 'unknown') {
    const shot = await saveShot(page, job.jobId);
    await rec({ jobId: job.jobId, score: finalScore, status: 'needs_review', screenshot: shot, error: 'no apply button found' });
    return { outcome: 'needs_review', score: finalScore };
  }

  await clickApply(page);
  await humanDelay(2000, 4000);

  // Post-click: success toast? questionnaire? already-applied flip?
  const body = ((await page.content().catch(() => '')) || '').toLowerCase();
  if (/successfully applied|application submitted|applied successfully/.test(body)) {
    const shot = await saveShot(page, job.jobId);
    await rec({ jobId: job.jobId, score: finalScore, status: 'applied', answers: { auto: true }, screenshot: shot });
    return { outcome: 'applied', score: finalScore };
  }

  const { answered, unknowns } = await answerQuestions(page, answers);
  if (unknowns.length > 0 && answered === 0) {
    const shot = await saveShot(page, job.jobId);
    await page.keyboard.press('Escape').catch(() => {});
    await rec({ jobId: job.jobId, score: finalScore, status: 'needs_review', answers: { answered }, screenshot: shot, error: 'unknown questions: ' + unknowns.join('; ') });
    return { outcome: 'needs_review', score: finalScore, reason: unknowns.join('; ') };
  }

  // Try final submit button in modal (Apply / Submit / Confirm)
  const submit = page.locator('button:has-text("Submit"), button:has-text("Confirm"), button:has-text("Apply")').last();
  if (await submit.isVisible().catch(() => false)) {
    await submit.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  const body2 = ((await page.content().catch(() => '')) || '').toLowerCase();
  const shot = await saveShot(page, job.jobId);
  if (/successfully applied|application submitted|applied successfully|already applied/.test(body2)) {
    const st = /already applied/.test(body2) ? 'already_applied' : 'applied';
    await rec({ jobId: job.jobId, score: finalScore, status: st, answers: { answered }, screenshot: shot });
    return { outcome: st, score: finalScore };
  }
  await rec({ jobId: job.jobId, score: finalScore, status: 'needs_review', answers: { answered }, screenshot: shot, error: 'submit unclear — check screenshot' });
  return { outcome: 'needs_review', score: finalScore };
}

module.exports = { applyToJob };
