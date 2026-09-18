function parseExpRange(text) {
  // e.g. "2-5 Yrs", "4 Yrs", "0-1 Yrs"
  if (!text) return null;
  const m = String(text).match(/(\d+)(?:\s*-\s*(\d+))?\s*yrs?/i);
  if (!m) return null;
  return { min: Number(m[1]), max: m[2] ? Number(m[2]) : Number(m[1]) };
}

function expFits(postedExpText, userYears) {
  const r = parseExpRange(postedExpText);
  if (!r) return true; // unknown -> don't filter out
  return userYears >= r.min - 1 && userYears <= r.max + 2;
}

function freshnessOk(postedText, maxDays) {
  if (!maxDays || maxDays <= 0) return true;
  if (!postedText) return true;
  const t = postedText.toLowerCase();
  if (t.includes('today') || t.includes('hour') || t.includes('just now')) return true;
  if (t.includes('yesterday') || /\b1 day/.test(t)) return 1 <= maxDays;
  const m = t.match(/(\d+)\s*days?/);
  if (m) return Number(m[1]) <= maxDays;
  if (t.includes('30+')) return 30 <= maxDays;
  return true;
}

module.exports = { parseExpRange, expFits, freshnessOk };
