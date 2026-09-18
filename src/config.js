require('dotenv').config();
const path = require('path');

function list(name, fallback) {
  const raw = process.env[name] ?? fallback;
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function num(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

function bool(name, fallback) {
  const raw = (process.env[name] ?? String(fallback)).toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(raw);
}

const config = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: num('DB_PORT', 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'jobagent',
  },
  keywords: list('JOB_KEYWORDS', 'QA Automation,Playwright'),
  locations: list('JOB_LOCATIONS', 'Bengaluru'),
  experienceYears: num('EXPERIENCE_YEARS', 3),
  coreSkills: list('CORE_SKILLS', 'Advanced Excel,Google Sheets,SQL'),
  titleBlocklist: list(
    'TITLE_BLOCKLIST',
    'QA,Selenium,Playwright,Manual Testing,Test Engineer,SDET,Java Developer,Software Developer,Web Developer,Automation Test'
  ),
  minSkillMatch: num('MIN_SKILL_MATCH', 3),
  minScore: num('MIN_SCORE', 70),
  freshnessDays: num('FRESHNESS_DAYS', 7),
  maxApplicationsPerRun: num('MAX_APPLICATIONS_PER_RUN', 25),
  maxApplicationsPerDay: num('MAX_APPLICATIONS_PER_DAY', 500),
  maxPagesPerSearch: num('MAX_PAGES_PER_SEARCH', 3),
  runIntervalMinutes: num('RUN_INTERVAL_MINUTES', 60),
  easyApplyOnly: bool('EASY_APPLY_ONLY', true),
  dryRun: bool('DRY_RUN', false),
  profileDir: process.env.PROFILE_DIR || '.profile/naukri-agent',
  headless: bool('HEADLESS', false),
  llm: {
    enabled: bool('LLM_ENABLED', false),
    apiKey: process.env.VERTEX_API_KEY || '',
    url:
      process.env.VERTEX_JUDGE_URL ||
      'https://aiplatform.googleapis.com/v1beta1/projects/808234498012/locations/global/publishers/google/models/gemini-2.5-flash:generateContent',
    model: process.env.LLM_MODEL || 'gemini-2.5-flash',
    minRulesScore: num('LLM_MIN_RULES_SCORE', 45),
    threshold: num('LLM_THRESHOLD', 65),
    thinkingBudget: num('LLM_THINKING_BUDGET', 0),
    maxOutputTokens: num('LLM_MAX_OUTPUT_TOKENS', 2048),
  },
  answers: {
    notice_period_days: process.env.NOTICE_PERIOD_DAYS || '30',
    current_ctc: process.env.CURRENT_CTC || '',
    expected_ctc: process.env.EXPECTED_CTC || '',
    current_location: process.env.CURRENT_LOCATION || '',
    willing_to_relocate: process.env.WILLING_TO_RELOCATE || 'yes',
    work_authorization: process.env.WORK_AUTHORIZATION || 'yes',
    experience_years: String(process.env.EXPERIENCE_YEARS || '3'),
  },
};

config.profileDirAbs = path.isAbsolute(config.profileDir)
  ? config.profileDir
  : path.join(__dirname, '..', config.profileDir);

module.exports = config;
