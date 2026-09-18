// One-time manual login into the DEDICATED agent profile.
// Run: npm run login -> browser opens -> YOU login to naukri.com -> wait -> auto-detects -> closes.
const { launchSession } = require('./browser');
const { isLoggedIn } = require('../pages/LoginPage');

(async () => {
  console.log('Opening dedicated agent browser...');
  console.log('Please LOGIN to naukri.com manually in the opened window.');
  const { context, page } = await launchSession({ headless: false });
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(5000);
    try {
      if (await isLoggedIn(page)) {
        console.log('Login detected! Session saved to the persistent profile. You can close and run `npm run dry-run`.');
        await context.close();
        process.exit(0);
      }
    } catch {}
    console.log('...waiting for login (up to 10 min). Current URL: ' + page.url());
  }
  console.log('Timed out. Please try again: npm run login');
  await context.close();
  process.exit(1);
})();
