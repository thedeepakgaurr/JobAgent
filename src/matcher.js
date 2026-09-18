const { expFits, freshnessOk } = require('../utils/experienceHelper');

// MATCHER v1: transparent keyword rules (no LLM cost).
// Each CORE_SKILLS entry matches itself + its aliases below (word-boundary match,
// so "excel" never matches "excellent", "mis" never matches "promise").
// score = min(55, hits*HIT_POINTS) + 20*expFit + 15*freshness + 10*titleRelevance, capped 100.
// Per-hit (not fractional) scoring: growing the skill list never dilutes the score.

const HIT_POINTS = 16;
const MAX_SKILL_POINTS = 55;

const SKILL_ALIASES = {
  'advanced excel': ['advanced excel', 'ms excel', 'microsoft excel', 'excel'],
  'google sheets': ['google sheets', 'gsheets', 'g sheets', 'spreadsheet', 'spreadsheets'],
  'apps script': ['apps script', 'app script', 'google apps script', 'vba', 'macro', 'macros'],
  'looker studio': ['looker studio', 'looker', 'data studio'],
  'data visualization': [
    'data visualization',
    'data visualisation',
    'data viz',
    'dashboard',
    'dashboards',
    'power bi',
    'tableau',
  ],
  sql: ['sql', 'mysql', 'postgresql', 'postgres', 'ms sql', 't-sql', 'plsql', 'pl/sql'],
  'mis reporting': ['mis', 'reporting', 'management reporting', 'report', 'reports'],
  'process automation': [
    'process automation',
    'workflow automation',
    'process excellence',
    'zapier',
    'power automate',
    'uipath',
    'rpa',
    'automation',
  ],
  'operations management': [
    'operations management',
    'operations',
    'team management',
    'team lead',
    'team handling',
    'stakeholder management',
    'people management',
  ],
  'team management': [
    'team management',
    'team lead',
    'team handling',
    'people management',
    'leading a team',
  ],
  crm: ['crm', 'salesforce', 'hubspot', 'zoho', 'sales pipeline', 'lead management'],
  'data analysis': [
    'data analysis',
    'data analytics',
    'data analyst',
    'analysis',
    'analytical',
    'insights',
    'etl',
    'data cleaning',
    'a/b testing',
  ],
  'api testing': ['api testing', 'rest assured', 'rest api', 'postman'],
};

function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentions(hay, term) {
  if (!term) return false;
  return new RegExp(`\\b${esc(term.trim().toLowerCase())}\\b`).test(hay);
}

function skillHits(hay, coreSkills) {
  const hits = [];
  for (const raw of coreSkills) {
    const skill = String(raw || '').trim().toLowerCase();
    if (!skill) continue;
    const terms = [skill, ...(SKILL_ALIASES[skill] || [])];
    if (terms.some((t) => mentions(hay, t))) hits.push(String(raw).trim());
  }
  return hits;
}

function blockedTerm(title, blocklist) {
  const t = String(title || '').toLowerCase();
  return (blocklist || []).map((b) => String(b || '').trim()).find((b) => b && mentions(t, b));
}

function scoreJob(job, profile, jdText = '') {
  const hay = `${job.title} ${job.snippet} ${jdText}`.toLowerCase();
  const hits = skillHits(hay, profile.coreSkills || []);

  const kwHit = (profile.keywords || []).some(
    (k) => k && job.title.toLowerCase().includes(String(k).toLowerCase())
  );
  const expOk = expFits(`${job.snippet} ${jdText}`.slice(0, 500), profile.experienceYears);
  const freshOk = freshnessOk(job.posted, profile.freshnessDays);
  const blocked = blockedTerm(job.title, profile.titleBlocklist);
  // Deterministic backstop: the LLM judge is unreliable on walk-ins, so catch them here too.
  const walkin = /\bwalk[-\s]?in\b/i.test(`${job.title} ${job.snippet} ${jdText}`);

  const skillPts = Math.min(MAX_SKILL_POINTS, hits.length * HIT_POINTS);
  let score = Math.round(skillPts + (expOk ? 20 : 0) + (freshOk ? 15 : 0) + (kwHit ? 10 : 0));
  score = Math.max(0, Math.min(100, score));
  const hardFail = walkin
    ? 'walk-in interview (online apply useless)'
    : blocked
      ? `title-blocklist: "${blocked}"`
      : hits.length < profile.minSkillMatch || !expOk
        ? `skills ${hits.length}/${profile.minSkillMatch}, expFit=${expOk}`
        : null;
  return { score, hits, hardFail, expOk, freshOk, blocked: blocked || null };
}

function shouldApply(scored, profile) {
  if (scored.hardFail) return { ok: false, reason: 'hard-filter: ' + scored.hardFail };
  if (scored.score < profile.minScore)
    return { ok: false, reason: `score ${scored.score} < ${profile.minScore}` };
  return { ok: true, reason: `score ${scored.score} >= ${profile.minScore}` };
}

module.exports = { scoreJob, shouldApply, skillHits, blockedTerm, SKILL_ALIASES };
