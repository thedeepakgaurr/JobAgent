# JobAgent — Naukri Auto-Apply (Node + Playwright + MySQL)

Fixed-session agent: you login **once** in a dedicated Chrome profile, then the
orchestrator runs 4 sub-agents sharing that one session:

- **Scout** — searches `JOB_KEYWORDS × JOB_LOCATIONS`, paginates, collects job cards
- **Matcher** — scores fit (skills overlap + exp + freshness + title), threshold `MIN_SCORE`
- **Applier** — opens only fresh jobs, clicks in-Naukri Apply, answers known questionnaire items, screenshots everything
- **Auditor** — MySQL dedupe (`UNIQUE(job_id)`), run logs, `.xlsx` reports

## 1. Setup

```powershell
cd D:\JobAgent
npm install
npx playwright install chromium
# edit .env directly -> DB creds + keywords + skills + CTC/notice answers
npm run db:init
npm run login     # browser opens -> YOU login to naukri.com -> auto-detects -> closes
```

## 2. Safe first runs (do in order)

```powershell
npm run dry-run   # clicks NOTHING, logs what WOULD be applied
npm run once      # real applies, capped by MAX_APPLICATIONS_PER_RUN (default 25)
npm run schedule  # repeats every RUN_INTERVAL_MINUTES (default 60)
```

## 3. How dedupe works

`extractJobId(url)` pulls the numeric Naukri job id (fallback: URL hash).
`jobs` + `applications(job_id UNIQUE)` mean an id is **never opened twice**,
even across crashes — Scout checks `isFresh(jobId)` before visiting.

## 4. Safety model (Full auto-apply with guardrails)

- `EASY_APPLY_ONLY=true` (default): "Apply on company site" links are logged as
  `manual`, never auto-opened.
- Unknown questionnaire items → `needs_review` + screenshot + modal closed, never guessed.
- CAPTCHA / logout / 4 consecutive failures → run aborts.
- Random 2.5–7s delays, headful Chrome, real UA, webdriver flag hidden.
- Every apply/failure writes screenshot to `reports/screenshots/`.

## 5. Useful queries

```sql
SELECT status, COUNT(*) FROM jobagent.applications GROUP BY status;
SELECT j.title, j.company, a.score, a.status, a.applied_at
FROM jobagent.applications a JOIN jobagent.jobs j ON j.job_id=a.job_id
ORDER BY a.applied_at DESC LIMIT 50;
```

## 6. Notes / risks

- Automation must respect Naukri ToS — keep caps low (25/day), prefer Easy Apply.
- Selectors target the 2026 redesign (`div.srp-jobtuple-wrapper`, `a.title`) with
  fallbacks to legacy markup; if Naukri changes DOM, fix `pages/`.
- Never commit `.env` or `.profile/` (login cookies).
