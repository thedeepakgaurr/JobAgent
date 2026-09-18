const fs = require('fs');
const path = require('path');
const { humanDelay } = require('../utils/helpers');
const { ensureDir } = require('../utils/excelHelper');

async function detectState(page) {
  const body = ((await page.content().catch(() => '')) || '').toLowerCase();
  const visible = async (loc) => loc.isVisible().catch(() => false);
  if (
    (await visible(page.getByText(/already applied/i).first())) ||
    (await visible(page.locator('button:disabled:has-text("Applied")').first())) ||
    /you have already applied/.test(body)
  ) {
    return 'already_applied';
  }
  const external = page.locator('button:has-text("Apply on company site"), a:has-text("Apply on company site")').first();
  if (await visible(external)) return 'external';
  const applyBtn = page
    .locator('button:has-text("Apply"), a:has-text("Apply")')
    .filter({ hasNotText: /company site/i })
    .first();
  if (await visible(applyBtn)) return 'applyable';
  if (/captcha/i.test(body)) return 'captcha';
  return 'unknown';
}

async function clickApply(page) {
  const btn = page
    .locator('button:has-text("Apply"), a:has-text("Apply")')
    .filter({ hasNotText: /company site/i })
    .first();
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await humanDelay(800, 2000);
  await btn.click({ timeout: 8000 });
  await page.waitForTimeout(3000);
}

// Try to answer chat/questionnaire inputs from known answers keyed by label match.
// Returns { answered: n, unknowns: [labels] }
async function answerQuestions(page, answers) {
  const unknowns = [];
  let answered = 0;
  const Norm = (s) => String(s || '').toLowerCase();

  const matchAnswer = (label) => {
    const t = Norm(label);
    if (/notice/.test(t)) return answers.notice_period_days;
    if (/expected.*ctc|expect.*salary/.test(t)) return answers.expected_ctc;
    if (/current.*ctc|current.*salary/.test(t)) return answers.current_ctc;
    if (/location|city|based/.test(t)) return answers.current_location;
    if (/relocat/.test(t)) return answers.willing_to_relocate;
    if (/authori[sz]ed|work permit|visa|eligible to work/.test(t)) return answers.work_authorization;
    if (/experience|total.*exp|years/.test(t)) return answers.experience_years;
    return undefined;
  };

  // Text inputs + textareas visible in modal/chat
  const fields = page.locator('input[type="text"], input:not([type]), textarea').filter({ visible: true });
  const n = await fields.count().catch(() => 0);
  for (let i = 0; i < Math.min(n, 15); i++) {
    const f = fields.nth(i);
    try {
      const label =
        (await f.getAttribute('placeholder').catch(() => '')) ||
        (await f.evaluate((el) => {
          const wrap = el.closest('div,li,section');
          return wrap ? wrap.innerText.slice(0, 200) : '';
        }).catch(() => ''));
      const val = matchAnswer(label);
      const cur = await f.inputValue().catch(() => '');
      if (val !== undefined && !cur) {
        await f.fill(String(val), { timeout: 5000 }).catch(() => {});
        answered++;
      } else if (val === undefined) {
        unknowns.push(label.slice(0, 80) || `field#${i}`);
      }
    } catch {
      // ignore
    }
  }

  // Radio/yes-no: click matching option when label maps cleanly
  // (kept conservative — unknown groups are left untouched and reported)
  return { answered, unknowns: [...new Set(unknowns)].slice(0, 10) };
}

async function saveShot(page, jobId) {
  ensureDir(path.join(__dirname, '..', 'reports', 'screenshots'));
  const p = path.join(__dirname, '..', 'reports', 'screenshots', `${jobId}-${Date.now()}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return p;
}

async function fetchJD(page) {
  // Verified 2026 selectors (headful): CSS-module classes, matched by substring.
  const sel = [
    'section[class*="job-desc-container"]',
    'div[class*="JDC__dang-inner-html"]',
    'section.styles_job-desc',
    'div.dang-inner-html',
    'div.job-desc',
    'section.job-desc',
  ];
  for (const s of sel) {
    const el = page.locator(s).first();
    if (await el.isVisible().catch(() => false)) {
      return ((await el.innerText().catch(() => '')) || '').slice(0, 8000);
    }
  }
  return '';
}

// Akamai rate-block page? Returns true if blocked (caller should back off).
async function isBlocked(page) {
  const t = await page.title().catch(() => '');
  return /access denied/i.test(t);
}

module.exports = { detectState, clickApply, answerQuestions, saveShot, fetchJD, isBlocked };
