const { buildSearchUrl, humanDelay } = require('../utils/helpers');
const { collectJobsFromPage, gotoNextPage } = require('../pages/SearchPage');

// SCOUT: search keywords x locations, collect job cards with pagination.
async function scout(page, { keyword, location, maxPages, onLog }) {
  const url = buildSearchUrl(keyword, location);
  const say = onLog || (() => {});
  say(`Scout: ${keyword} in ${location} -> ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  let all = [];
  let lastUrl = page.url();
  for (let p = 1; p <= maxPages; p++) {
    const jobs = await collectJobsFromPage(page);
    say(`Scout: page ${p}: ${jobs.length} cards @ ${page.url()}`);
    all = all.concat(jobs);
    if (p < maxPages) {
      await humanDelay(2000, 4500);
      const moved = await gotoNextPage(page);
      if (!moved) break;
      if (page.url() === lastUrl) {
        say('Scout: URL unchanged after Next — pagination stuck, stopping.');
        break;
      }
      lastUrl = page.url();
    }
  }
  const seen = new Set();
  return all.filter((j) => (seen.has(j.jobId) ? false : (seen.add(j.jobId), true)));
}

module.exports = { scout };
