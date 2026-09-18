const cron = require('node-cron');
const config = require('./config');
const { launchSession } = require('./browser');
const { gotoAuthArea } = require('../pages/LoginPage');
const { scout } = require('./scout');
const { applyToJob } = require('./applier');
const { exportReports, printSummary } = require('./auditor');
const { humanDelay } = require('../utils/helpers');
const db = require('./db');

const args = process.argv.slice(2);
if (args.includes('--dry-run')) config.dryRun = true;
const once = args.includes('--once') || !args.includes('--schedule');

function say(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// Graceful Ctrl+C: finish the in-flight search_runs row instead of leaving it open.
let current = null;
process.on('SIGINT', async () => {
  console.log('\nInterrupted — closing current run...');
  try {
    if (current && current.runId) {
      await db.finishRun(current.runId, {
        found: current.found || 0,
        fresh: current.fresh || 0,
        applied: current.applied || 0,
      });
    }
  } catch {}
  process.exit(130);
});

async function runOnce() {
  const profile = {
    keywords: config.keywords,
    coreSkills: config.coreSkills,
    titleBlocklist: config.titleBlocklist,
    minSkillMatch: config.minSkillMatch,
    minScore: config.minScore,
    experienceYears: config.experienceYears,
    freshnessDays: config.freshnessDays,
  };
  say(
    `Starting run (dryRun=${config.dryRun}, easyApplyOnly=${config.easyApplyOnly}, runCap=${config.maxApplicationsPerRun}, dayCap=${config.maxApplicationsPerDay})`
  );
  say(`Keywords: ${profile.keywords.join(' | ')} | Locations: ${config.locations.join(' | ')}`);

  const { context, page } = await launchSession();
  let appliedTotal = 0;
  let failures = 0;
  try {
    const loggedIn = await gotoAuthArea(page);
    if (!loggedIn) {
      say('NOT LOGGED IN. Run `npm run login` first and login manually. Aborting.');
      await db.logEvent(null, 'error', 'not logged in — abort').catch(() => {});
      return;
    }
    say('Session OK (logged in).');
    await db.seedAnswers(config.answers).catch((e) => say('DB seed warning: ' + e.message));
    let todayApplied = 0;
    try {
      todayApplied = await db.countAppliedToday();
    } catch (e) {
      say('Day-cap check warning: ' + e.message);
    }
    say(`Applied today so far: ${todayApplied}/${config.maxApplicationsPerDay}`);
    if (todayApplied >= config.maxApplicationsPerDay) {
      say(`Daily cap (${config.maxApplicationsPerDay}) already reached — aborting run.`);
      await db.logEvent(null, 'info', 'daily cap reached — abort').catch(() => {});
      return;
    }

    for (const kw of config.keywords) {
      for (const loc of config.locations) {
        if (appliedTotal >= config.maxApplicationsPerRun) break;
        if (todayApplied + appliedTotal >= config.maxApplicationsPerDay) break;
        const runId = await db.startRun([kw], loc).catch(() => null);
        current = { runId, found: 0, fresh: 0, applied: 0 };
        let found = [];
        try {
          found = await scout(page, { keyword: kw, location: loc, maxPages: config.maxPagesPerSearch, onLog: say });
        } catch (e) {
          say('Scout error: ' + e.message);
          await db.logEvent(runId, 'error', 'scout: ' + e.message).catch(() => {});
          continue;
        }
        // Persist + dedupe via MySQL
        let fresh = [];
        for (const j of found) {
          try {
            await db.upsertJob(j);
            if (await db.isFresh(j.jobId)) fresh.push(j);
          } catch (e) {
            say('DB warning: ' + e.message);
          }
        }
        say(`Found ${found.length}, fresh (never touched) ${fresh.length}`);
        if (current) {
          current.found = found.length;
          current.fresh = fresh.length;
        }
        let applied = 0;
        for (const job of fresh) {
          if (appliedTotal >= config.maxApplicationsPerRun) {
            say(`Run cap (${config.maxApplicationsPerRun}) reached, stopping.`);
            break;
          }
          if (todayApplied + appliedTotal >= config.maxApplicationsPerDay) {
            say(`Daily cap (${config.maxApplicationsPerDay}) reached, stopping.`);
            break;
          }
          try {
            const r = await applyToJob(
              page,
              job,
              profile,
              { dryRun: config.dryRun, easyApplyOnly: config.easyApplyOnly, answers: config.answers },
              say
            );
            if (r.outcome === 'applied') {
              applied++;
              appliedTotal++;
              failures = 0;
              if (current) current.applied = applied;
            } else if (r.outcome === 'failed') {
              failures++;
            }
            say(`-> ${r.outcome}: ${job.title} (${job.url})`);
          } catch (e) {
            failures++;
            say('Apply error: ' + e.message);
            await db.recordApplication({ jobId: job.jobId, score: 0, status: 'failed', error: e.message }).catch(() => {});
            if (/CAPTCHA/i.test(e.message) || failures >= 4) {
              say('Too many failures — aborting run for safety.');
              if (runId) await db.finishRun(runId, { found: found.length, fresh: fresh.length, applied }).catch(() => {});
              throw e;
            }
          }
          await humanDelay();
        }
        if (runId) await db.finishRun(runId, { found: found.length, fresh: fresh.length, applied }).catch(() => {});
        current = null;
        if (runId) await printSummary(runId);
      }
    }
    const rep = await exportReports().catch(() => null);
    if (rep) say('Report: ' + rep);
    say(`Done. Applied this run: ${appliedTotal}`);
  } finally {
    await context.close().catch(() => {});
    if (once) await db.getPool().end().catch(() => {}); // avoid noisy socket warnings on exit
  }
}

(async () => {
  if (once) {
    await runOnce().catch((e) => {
      console.error('Run failed:', e.message);
      process.exitCode = 1;
    });
  } else {
    say(`Scheduler ON: every ${config.runIntervalMinutes} min. Press Ctrl+C to stop.`);
    await runOnce().catch((e) => console.error(e.message));
    cron.schedule(`*/${config.runIntervalMinutes} * * * *`, () => {
      runOnce().catch((e) => console.error(e.message));
    });
  }
})();
