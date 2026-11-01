# Vouch

**Know before you say yes.** Vouch checks whether a job or internship offer is real in about 30 seconds, using live web evidence gathered through TinyFish and scored by a deterministic rule engine. Claude Haiku 5.5 only reads the message and explains the result; it never decides the verdict.

Live: https://vouch.spacesdrive.cc · API: https://api.vouch.spacesdrive.cc/healthz

## How it works

```mermaid
flowchart LR
  U[Student pastes message / link] --> W[Vouch web<br/>Cloudflare Pages]
  W -->|POST /api/checks| A[Vouch API<br/>FastAPI on AWS EC2]
  A -->|SSE stream| W
  A --> H[Claude Haiku 5.5<br/>extract + explain]
  A --> S[TinyFish Search]
  A --> F[TinyFish Fetch]
  A --> G[TinyFish Agent<br/>cybercrime.gov.in · mca.gov.in · careers portals]
  A --> R[RDAP + DNS-over-HTTPS + URLhaus<br/>free, no key]
  A --> D[(SQLite<br/>checks · signals · hashed identifiers)]
```

1. **Extract.** Haiku reads the pasted text or link and pulls out company, role, sender emails, phones, UPI ids, URLs and any money request. A regex pass runs in parallel as a safety net.
2. **Verify, all in parallel.** Each of the 12 signals has its own time budget. TinyFish Search finds the official site, scam reports, registry pages and news; TinyFish Fetch reads them; RDAP and DNS answer domain age and mail records. Slow checks (the three TinyFish Agent runs) are enqueued at once and land whenever they finish.
3. **Verdict with receipts.** Score = clamp(50 + Σ red − Σ green, 0, 100). Green 0–29, amber 30–59, red 60–100. A preliminary verdict appears in under 8 s; the final one after the Agent checks, capped at 75 s. Every receipt links to the page it came from.

## The 12 signals and where TinyFish does the work

| # | Signal | Source |
|---|--------|--------|
| S1 | Money asked | Haiku extraction + regex |
| S2 | Sender domain vs official domain | TinyFish Search (official site) + lookalike check |
| S3 | Domain age & registrar | RDAP |
| S4 | Mail & web records | DNS over HTTPS |
| S5 | Scam reports | TinyFish Search (web + news) + TinyFish Fetch |
| S6 | Cybercrime suspect registry | TinyFish Agent on cybercrime.gov.in |
| S7 | Company registry (MCA) | TinyFish Search → Fetch; Agent fallback on mca.gov.in |
| S8 | Role on official careers page | TinyFish Fetch; Agent fallback inside the careers portal |
| S9 | Contact channel | Haiku extraction |
| S10 | Pressure / too good to be true | Haiku extraction |
| S11 | Site consistency | TinyFish Fetch both sites, Haiku compares |
| S12 | URL reputation | URLhaus |

Hard rules: a money request alone forces at least **BE CAREFUL**; a money request plus a lookalike domain, a credible scam report or a suspect-registry hit forces **HIGH RISK**.

## Run it

```bash
cp api/.env.example api/.env   # fill TINYFISH_API_KEY, ANTHROPIC_API_KEY, SECRET_KEY, GOOGLE_CLIENT_ID
make dev-api                    # http://localhost:8000
make dev-web                    # http://localhost:5173
make test
```

Deploy: `make deploy-api` (EC2 via infra/deploy.sh) and `make deploy-web` (Cloudflare Pages). See `infra/README.md`.

## Limitations

- A clean result is not a guarantee. Vouch reports risk signals, never accusations.
- Government portals sometimes show captchas; those checks resolve as "unknown" rather than "pass".
- Phone numbers, emails and UPI ids are stored hashed; only a masked form is displayed.

## Built on the day

Everything in this repository was built on 1 November 2026 during the hackathon. Nothing existed beforehand except the written plan.
