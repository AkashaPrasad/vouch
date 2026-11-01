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
