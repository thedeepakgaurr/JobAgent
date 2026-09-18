// Fast session check: launches the fixed profile, reports logged-in or not.
// Run: npm run check-login
const { launchSession } = require('./browser');
const { gotoAuthArea } = require('../pages/LoginPage');

(async () => {
  const { context, page } = await launchSession({ headless: true });
  try {
    const ok = await gotoAuthArea(page);
    console.log(ok ? 'LOGGED IN as: ' + page.url() : 'NOT LOGGED IN: ' + page.url());
    process.exitCode = ok ? 0 : 1;
  } finally {
    await context.close().catch(() => {});
  }
})();
