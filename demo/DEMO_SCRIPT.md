# Vouch — 2-minute demo script

Before the demo: free the TinyFish agent queue (`cd api && TINYFISH_API_KEY=... uv run python ../scripts/cancel_agent_runs.py`) and run one check so caches are warm. Run checks one at a time: the account allows two concurrent agent runs.

**Problem (15 s).** Students get "you're selected" messages every week. Fake HR mail, lookalike domains, a ₹2,950 "verification fee". Vouch checks an offer in about 30 seconds with live web evidence and shows the receipts.

**Scam message (40 s).** Open https://vouch.spacesdrive.cc/app/new. Paste `demo/samples/fake_it_offer.txt`. Click **Check this offer**. The ledger fills: S1 money asked (+40), S2 free-mail sender, S3 domain registered weeks ago, S10 pressure. The preliminary verdict appears within ~20 s: **HIGH RISK**. Scroll to "Reasoned read of the evidence": Claude's second opinion cites the exact signals. Click **Preview** on the cybercrime-registry row to show the live TinyFish browser.

**Real listing (40 s).** Paste a LinkedIn job link from a verified employer (e.g. a Navi role). The hosts strip shows `linkedin.com · job board` and `navi.com · company domain`. S2 "Employer identity confirmed", S3 "navi.com has existed 30 years", S8 "role advertised on the official site". Verdict: **LIKELY GENUINE**. Point out that platform-only rows sit at the bottom and carry no weight.

**Honesty (10 s).** Paste an expired link: Vouch says **COULD NOT VERIFY** instead of guessing.

**Close (15 s).** Every web fact came from TinyFish Search, Fetch, Agent, Research and Browser. The rule engine scores; Claude reasons over the evidence within bounds. A clean result is not a guarantee, and the page says so.
