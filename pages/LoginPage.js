// Login state checks — we NEVER store your Naukri password.
// You login once manually via `npm run login`; the persistent profile keeps cookies.
//
// Strategy: the public homepage (www.naukri.com/) renders Login links even for
// logged-in users, so we verify against the authenticated area instead.
async function isLoggedIn(page) {
  const url = page.url();

  // Definitely logged out: sitting on the login page.
  if (/\/nlogin(\/|$|\?)/.test(url)) return false;

  // Definitely logged in: inside the authenticated area.
  if (/\/mnjuser\//.test(url)) return true;

  try {
    const marker = page
      .locator(
        'a[href*="mnjuser"], a:has-text("My Naukri"), a:has-text("Logout"), ' +
          'img[class*="avatar" i], div[class*="user-name" i], a[href*="/mnjuser/profile"]'
      )
      .first();
    if (await marker.isVisible({ timeout: 3000 }).catch(() => false)) return true;

    const headerLogin = page
      .locator('header a:has-text("Login"), div.nI-gNb-header a:has-text("Login")')
      .first();
    if (await headerLogin.isVisible({ timeout: 2000 }).catch(() => false)) return false;
  } catch {
    // fall through
  }
  return false;
}

// Go somewhere that forces Naukri to reveal auth state, then check.
async function gotoAuthArea(page) {
  await page
    .goto('https://www.naukri.com/mnjuser/homepage', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    .catch(() => {});
  await page.waitForTimeout(4000);
  return isLoggedIn(page);
}

module.exports = { isLoggedIn, gotoAuthArea };
