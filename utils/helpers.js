function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Human-like random delay between actions (anti-detection)
function humanDelay(minMs = 2500, maxMs = 7000) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return sleep(ms);
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSearchUrl(keyword, location) {
  const k = slug(keyword);
  const l = slug(location);
  if (k && l && l !== 'remote' && l !== 'anywhere' && l !== 'india') {
    return `https://www.naukri.com/${k}-jobs-in-${l}`;
  }
  return `https://www.naukri.com/${k}-jobs`;
}

// Extract stable Naukri jobId from URL; fallback to hash of URL.
function extractJobId(url) {
  if (!url) return null;
  const m = String(url).match(/(\d{10,})/);
  if (m) return m[1];
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) >>> 0;
  }
  return 'urlhash-' + h.toString(16);
}

module.exports = { sleep, humanDelay, slug, buildSearchUrl, extractJobId };
