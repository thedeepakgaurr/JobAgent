const { extractJobId } = require('../utils/helpers');

// 2026 Naukri redesign selectors with fallbacks to older markup.
const CARD = [
  'div.srp-jobtuple-wrapper div.cust-job-tuple',
  'div.srp-jobtuple-wrapper',
  'article.jobTuple',
  'div.jobTuple',
].join(', ');
const TITLE_LINK = ['a.title', 'a.title.fw500.ellipsis', 'h2 a', 'a[href*="job-listings"]'].join(', ');

async function collectJobsFromPage(page) {
  await page.waitForSelector(CARD, { timeout: 20000 }).catch(() => {});
  const cards = await page.$$(CARD);
  const out = [];
  for (const card of cards) {
    try {
      const link = await card.$(TITLE_LINK);
      const href = link ? await link.getAttribute('href') : null;
      const title = link ? ((await link.innerText().catch(() => '')) || '').trim() : '';
      if (!href) continue;
      const url = href.startsWith('http') ? href : new URL(href, 'https://www.naukri.com').href;
      const whole = ((await card.innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
      const company =
        (await card.$eval('.comp-name, a.comp-name, span.comp-name', (e) => e.innerText).catch(
          () => ''
        )) || '';
      const location =
        (await card.$eval('.loc, span.locWdth, .location', (e) => e.innerText).catch(() => '')) ||
        '';
      const posted =
        (await card
          .$eval('.job-post-day, span.job-post-day, .type-br2', (e) => e.innerText)
          .catch(() => '')) || '';
      out.push({
        jobId: extractJobId(url),
        url,
        title: title || whole.slice(0, 120),
        company: (company || '').trim(),
        location: (location || '').trim(),
        posted: (posted || '').trim(),
        snippet: whole.slice(0, 2000),
      });
    } catch {
      // skip bad card
    }
  }
  // de-dupe within page
  const seen = new Set();
  return out.filter((j) => (seen.has(j.jobId) ? false : (seen.add(j.jobId), true)));
}

async function gotoNextPage(page) {
  // Try aria-labelled Next, then text Next/», returns false when absent/disabled.
  const candidates = [
    page.getByRole('button', { name: /next/i }),
    page.getByRole('link', { name: /next/i }),
    page.locator('a:has-text("Next")').last(),
    page.locator('button:has-text("Next")').last(),
  ];
  for (const c of candidates) {
    try {
      if (await c.isVisible({ timeout: 1500 })) {
        if (await c.isDisabled().catch(() => false)) return false;
        await c.click({ timeout: 5000 }).catch(() => {});
        await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2500);
        return true;
      }
    } catch {
      // try next
    }
  }
  return false;
}

module.exports = { collectJobsFromPage, gotoNextPage };
