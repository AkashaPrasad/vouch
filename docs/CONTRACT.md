# Vouch — shared build contract (backend <-> frontend <-> infra)

Product name: **Vouch**. Tagline: "Know before you say yes." Verifies whether a job/internship offer is real in ~30 s using live web evidence from TinyFish (Search/Fetch/Agent) + free RDAP/DNS, scored by a deterministic rule engine, explained by Claude Haiku 5.5.

## Repo layout
vouch/
  api/        FastAPI (Python 3.12), Dockerfile, pyproject.toml, app/...
  web/        Vite + React + TS + Tailwind, deploys to Cloudflare Pages
  infra/      EC2 deploy scripts, Caddyfile, docker-compose.yml
  demo/       sample inputs

## Backend HTTP API (all JSON, CORS open to configured origins)
POST /api/checks            body {text?: string, url?: string, channel?: "web"}  -> {check_id}
                            (at least one of text|url). Auth optional: Bearer <vouch session JWT>; if present, check is linked to user.
GET  /api/checks/{id}/stream  SSE (text/event-stream). Each event: `event: <type>\ndata: <json>\n\n`. Ends after verdict.final with event `done`.
GET  /api/checks/{id}       full JSON: {check_id, status:"running"|"done", created_at, duration_ms, extraction, signals:[Signal], verdict: Verdict|null, explanation: Explanation|null}
POST /api/checks/{id}/feedback  {correct: bool, note?: string} -> {ok}
GET  /api/recent            {items:[{check_id, company_name (masked if unknown), band, score, created_at}]}  last 20
GET  /api/me                 (Bearer) -> {id, email, name, picture, checks_count}
GET  /api/me/checks          (Bearer) -> {items:[...same as recent + status]}
POST /api/auth/google       {credential: "<google id token>"} -> {token: "<vouch jwt>", user:{id,email,name,picture}}
GET  /healthz               {ok, db, tinyfish_key_present, anthropic_key_present, agent_enabled}

## SSE event types (data payloads)
check.created        {check_id, created_at}
extraction.done      {company_name, claimed_official_domain, role_title, location, salary_text, sender_emails[], sender_phones_masked[], upi_ids_masked[], urls[], money_requested:{asked,amount,purpose}, contact_channels[], urgency_phrases[], interview_claimed, red_flag_quotes[]}
signal.update        Signal (see below) — fires once per signal when it resolves; may fire again (unknown -> final) for S6/S7/S8 agent signals
agent.progress       {signal: "S6"|"S7"|"S8", text: "<step text from TinyFish agent>"}
verdict.preliminary  Verdict
explanation.token    {text}           (streamed Haiku tokens for the summary)
verdict.final        {verdict: Verdict, explanation: Explanation}
error                {message}
done                 {}

Signal = {code:"S1".."S12", name, status:"pass"|"fail"|"unknown"|"pending", weight_applied:int (signed; negative = green), summary:string (one line human readable), evidence:[{title, url, snippet, fetched_at}], source:"haiku"|"regex"|"tinyfish_search"|"tinyfish_fetch"|"tinyfish_agent"|"rdap"|"dns"|"urlhaus", started_at, finished_at, elapsed_ms}
Verdict = {score:0-100, band:"green"|"amber"|"red", label:"LIKELY GENUINE"|"BE CAREFUL"|"HIGH RISK", confidence:"low"|"medium"|"high", resolved:int, total:12, is_final:bool, elapsed_ms, limited:bool (true when TinyFish was unavailable)}
Explanation = {headline, summary, receipts:[{signal, finding, source_url}], next_steps:[string x3], share_text}

## 12 signals (names shown in UI)
S1 Money asked · S2 Sender domain · S3 Domain age · S4 Mail & web records · S5 Scam reports · S6 Cybercrime suspect registry (Agent) · S7 Company registry (MCA) · S8 Role on careers page · S9 Contact channel · S10 Pressure & too-good-to-be-true · S11 Site consistency · S12 URL reputation
Score = clamp(50 + Σred − Σgreen, 0, 100). Bands: 0–29 green, 30–59 amber, 60–100 red. Hard rules: S1 fail => at least amber; S1 fail + (S2 lookalike | S5 fail | S6 fail) => red.

## Google auth
Google client id: 908727741603-i1m08dkm436q3tcigan76sqleq1511gm.apps.googleusercontent.com (frontend uses Google Identity Services `google.accounts.id` with this id; backend verifies the ID token with google-auth and mints an HS256 JWT with SECRET_KEY, 7 days). Frontend stores token in localStorage `vouch_token`. Auth is optional for running a check; signed-in users get a "My checks" history page.

## Brand kit (Vouch)
Dark-first. Tokens (CSS vars):
  --bg #09090B · --surface #111114 · --surface-2 #18181B · --border #27272A · --border-strong #3F3F46
  --text #FAFAFA · --text-muted #A1A1AA · --text-faint #71717A
  --accent #C6F135 (lime; primary CTA, focus rings, brand) · --accent-ink #0B0F00 (text on accent)
  --green #4ADE80 · --amber #FBBF24 · --red #F87171 (verdict colours; also -soft variants at 12% alpha for backgrounds)
Font: Inter (UI), JetBrains Mono (numbers, timers, domains, codes). Radius 12px cards / 8px inputs / 999px pills. 1px borders, no heavy shadows. Lime glow only on primary CTA hover and verdict badge.
Logo: SVG wordmark "vouch" lowercase (Inter 700, tight tracking) + mark: a rounded square with a bold check whose right stroke is a lime "V" — i.e. the checkmark IS the V. Provide `web/src/brand/Logo.tsx` (mark + wordmark, sizes) and `web/public/favicon.svg`, `web/public/og.png` optional.
Iconography: lucide-react only, 1.5px stroke. Never emoji as icons.
Voice: calm, factual, student-friendly. "Risk signals", never accusations.

## Frontend env
VITE_API_BASE_URL, VITE_GOOGLE_CLIENT_ID

## v2 additions (2026-11-01, second pass)

### Signal / extraction additions (backend emits, frontend may use)
- Signal gains `tags: string[]` in the public payload. Known tags: `lookalike`, `impersonation`, `free_mail`, `mismatch`, `exact`, `platform_only`, `free_host`, `shortener`, `struck_off`, `known_brand`.
- extraction.done gains `hosts: [{host, category}]` where category ∈ `company | job_board | social | messaging | form_or_doc | shortener | free_host | payment | reference | free_mail`, and `known_brand: {name, official_domains[]} | null`.
- Verdict unchanged. The UI computes the score ledger from signals: start 50, add each resolved signal's weight_applied in S1..S12 order, clamp 0..100; hard-rule floors (30 / 60) shown as a marker when `verdict.score` > arithmetic sum.

### TinyFish Research (deep dossier) — on demand, minutes
POST /api/checks/{id}/research              (optional Bearer) -> {status:"running"|"done"|"failed"}  (idempotent; starts once)
GET  /api/checks/{id}/research              -> {status:"idle"|"running"|"done"|"failed", started_at, finished_at, progress:[{at, text}], report: {summary, findings:[{title, detail, sources:[url]}], sources:[{title,url}]} | null}
SSE on the main stream (if still open) and on GET /api/checks/{id}/research/stream: events `research.progress {text}`, `research.done {report}`, `research.error {message}`, `done`.

### TinyFish Browser (visual receipt) — optional
GET  /api/checks/{id}/screenshots            -> {items:[{signal, url, image_url, taken_at}]}  (PNG served at /api/screenshots/{file}.png). Produced for the claimed site (S11) and the official careers page (S8) when TINYFISH_ENABLE_BROWSER=true.

### TinyFish Monitor (beta, per-account) — optional
POST /api/checks/{id}/watch   (Bearer required) -> {ok, monitor_id|null, message}   watches the official careers page for the role; if the account lacks Monitor access returns {ok:false, message:"Monitor not enabled for this account"}.

### Health
GET /healthz adds `products: {search, fetch, agent, research, browser, monitor, highlights}` each `true|false|"beta"`.

## v3 — company watches and resume match

A signed-in user watches companies (careers page, ATS board, LinkedIn jobs page). Vouch reads each source on a schedule and on demand (TinyFish Fetch; TinyFish Agent fallback for JS-only or login-walled pages), diffs postings against the last snapshot, scores each NEW posting (max 20 per run) with Claude Haiku, and raises an alert when `score >= preferences.match_threshold` (default 70, set via PUT /api/me/settings `preferences.match_threshold`). **Job preferences are the primary matching input; the resume is optional** and only adds skill overlap. With neither, checks still snapshot and report new postings but create no alerts (`needs_preferences: true`).

All routes need `Authorization: Bearer <vouch jwt | vk_ api key>` except the webhook.

### Preferences (primary) and presets
GET  /api/presets                 -> {fields:[{key, label, roles:[string]}]}   (15 fields, 8–16 roles each; no auth)
GET  /api/me/preferences          -> Preferences | 404
PUT  /api/me/preferences          {fields?: [field key], roles?: [string], free_text?: string(<=2000)} -> Preferences   (omitted keys keep old values; 422 if all empty; 502 if Claude fails)
Preferences = {fields:[], roles:[], free_text, parsed:{titles[] (chosen roles + synonyms), skills[], locations[], seniority:"any"|"intern"|"fresher"|"entry"|"mid"|"senior"|"lead"|"executive", remote:"any"|"remote"|"onsite"|"hybrid", exclude[]}, updated_at}

### Resume (optional)
PUT  /api/me/resume               {text: string(30..20000)} -> {summary: ResumeSummary, updated_at, chars}   (502 if Claude fails)
POST /api/me/resume/file          multipart `file` = PDF (<=10 MB) -> same as PUT   (415 if not a readable PDF)
GET  /api/me/resume               -> {text_excerpt (first 400 chars), chars, summary: ResumeSummary, updated_at} | 404
ResumeSummary = {skills[], roles[], seniority:"student"|"intern"|"entry"|"mid"|"senior"|"lead"|"executive", locations[], years:number}

### Watches
GET    /api/watches               -> {items:[Watch]}
POST   /api/watches               {company_or_url: string, cadence?: "daily"|"twice_daily"|"hourly" (default daily)} -> Watch
                                  (company name -> TinyFish Search for the careers page; linkedin.com/company/<slug> -> https://www.linkedin.com/jobs/<slug>-jobs (company jobs tab as fallback); 422 if nothing found; max 10 per user; same URL returns the existing watch). Starts the first check in the background.
POST   /api/watches/{id}/check    -> CheckResult   (waits up to 300 s; joins a check already in progress; 504 on timeout)
PATCH  /api/watches/{id}          {cadence?, status?: "active"|"paused"} -> Watch
DELETE /api/watches/{id}          -> {ok}
GET    /api/watches/{id}/postings -> {watch_id, taken_at, method:"fetch"|"agent"|null, items:[Posting & {match: Match|null}]}
Watch = {id, company_name, source_url, source_kind:"careers"|"ats"|"linkedin_public"|"linkedin_session"|"other", cadence, status:"active"|"paused"|"error", last_checked_at, postings_count, new_last_run, monitor_id|null, scheduler:"tinyfish_monitor"|"in_process", last_error|null, created_at}
Posting = {title, url, location, posted, fingerprint, company, initial?: true (first-run alerts only)}
Match = {score:0-100, reasons:[<=3, each names the preference that matched or not], missing:[<=2]}
CheckResult = {new_postings:[Posting & {match}], alerts_created:int, postings_count:int, first_run:bool, method, threshold:int, needs_preferences:bool, matched_with:["preferences"?, "resume"?], note:string|null}
First run: the snapshot is stored and the top matches (>= threshold, max 5; else the single best >= 50) are alerted with `posting.initial = true`.

### Alerts
GET  /api/alerts                  -> {items:[{id, watch_id, company_name, posting: Posting, match_score, match_reasons:{reasons[], missing[]}, created_at, read_at|null}]}  newest first, max 200
GET  /api/alerts/unread_count     -> {count}
POST /api/alerts/{id}/read        -> {ok, read_at}

### Scheduling
When `PUBLIC_API_URL` is set and Monitor is enabled, each watch gets a TinyFish Monitor (fetch, cron from cadence: daily `0 3 * * *`, twice_daily `0 3,15 * * *`, hourly `0 * * * *`) whose webhook is:
POST /api/webhooks/tinyfish-monitor?secret=<WATCH_WEBHOOK_SECRET or derived from SECRET_KEY>&watch_id=<id>  (body may carry monitor_id) -> {ok, watch_id}; 403 bad secret.
Otherwise (or on 402/403) an in-process scheduler sweeps every 10 min and runs active watches whose cadence has elapsed (monitor-backed watches only after 2x cadence, in case a webhook was missed).

### LinkedIn session (TinyFish browser-context profile)
GET  /api/me/linkedin             -> {status:"none"|"pending"|"connected"|"unavailable"|"error", profile_id|null, message, updated_at|null}
POST /api/me/linkedin/connect     -> {setup_url, profile_id, session_id, expires_at}   (501 {detail:"LinkedIn connect is not available on this TinyFish plan"} when the account cannot create profile setup sessions)
POST /api/me/linkedin/complete    -> same shape as GET (saves the signed-in session into the profile)
Watches with source_kind `linkedin_session` run the agent with `use_profile=true, profile_id`; without a connected profile they fall back to the public jobs page.

### Stats
GET /api/me/stats adds `company_watches`, `unread_alerts`; `active_watches` now counts check watches + active company watches.

## v3 — company profile research

A sourced dossier on what it is like to work at a company (for a student about to join). Every quote and URL in the report is validated server-side against the pages actually searched/fetched; anything else is dropped.

POST /api/company-research  {company: string (2..120), website?: string}   (optional Bearer)
  -> {id, status: "running"|"done"}
  Idempotent per lower(company) for 24h (returns the existing running/done job). 3 new jobs per IP per hour (429 after).
GET  /api/company-research/sample   -> same shape as GET by id, plus {sample: true, live_id: string|null}. Served instantly from app/data/company_sample.json (Zomato).
GET  /api/company-research/{id}     -> {id, company, website, status: "running"|"done"|"failed", started_at, finished_at, progress: [{text, at}], report: Report|null, error?}
GET  /api/company-research/{id}/stream   SSE replay + tail: `company.progress {text, at}`, `company.done {report}`, `company.error {message}`, then `done`.

Typical run: 3-5 minutes (search ~5 s, fetch ~5-20 s, reviews agent up to 150 s, deep research capped at 4 min from start, Claude ~15 s).

Report:
{
  company, website, as_of: "YYYY-MM-DD",
  overall: {verdict_text, score_0_100: int|null, confidence: "low"|"medium"|"high"},
  dimensions: [  // always all 8, in this order
    {key: "culture"|"work_life_balance"|"compensation"|"management"|"stability_layoffs"|"freshers_treatment"|"growth"|"hiring_process",
     label, score_0_100: int|null, summary,   // null + "Not enough public evidence." when no verified evidence
     evidence: [{quote (<=240 chars, verbatim), source_url, platform, sentiment: "positive"|"negative"|"mixed", date?}]}
  ],
  layoffs_timeline: [{date, what, source_url}],
  red_flags: [{text, source_url}], green_flags: [{text, source_url}],
  platforms_covered: [{platform, label, items, reachable: bool, fetched_ok, fetch_attempted, evidence_items, note}],
  sources: [{title, url, platform}],
  stats: {kept_quotes, dropped_quotes, dropped_urls, elapsed_s, documents}
}
platform ∈ reddit | ambitionbox | glassdoor | blind | x | linkedin | news | official | web.
`reachable: false` means only search snippets were usable (login wall / bot block); the UI should label that platform "snippets only".
