const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./config');

// Single fixed session: dedicated persistent profile.
// You login ONCE via `npm run login`; cookies persist on disk after that.
async function launchSession({ headless = config.headless } = {}) {
  fs.mkdirSync(config.profileDirAbs, { recursive: true });
  const context = await chromium.launchPersistentContext(config.profileDirAbs, {
    headless,
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    args: ['--disable-blink-features=AutomationControlled'],
    acceptDownloads: true,
  });
  // Hide webdriver flag (basic anti-detection)
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

module.exports = { launchSession };
