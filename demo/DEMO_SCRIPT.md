# Vouch — 2-minute demo script

**Problem (15 s).** Students get "you're selected" messages every week. Fake HR mail, lookalike domains, a ₹2,950 "verification fee". Nobody has time to verify. Vouch does it in about 30 seconds using live web evidence.

**Paste (10 s).** Open https://vouch.spacesdrive.cc. Paste `demo/samples/fake_it_offer.txt` into the hero textarea. Click **Check this offer**.

**Watch the cards flip (30 s).** The check page opens instantly. The timer starts. Within 2 seconds the extraction card lists the company, the sender domain, the UPI id (masked) and the fee. Signal cards flip from grey:
- S1 Money asked → red (+40)
- S2 Sender domain → red, lookalike of the official domain (+30)
- S3 Domain age → red, registered weeks ago (RDAP)
- S9 / S10 → red, Telegram-only contact and a 24-hour deadline
- S6 Cybercrime suspect registry → shows live TinyFish Agent steps ("Opening cybercrime.gov.in…")

**Verdict with receipts (30 s).** At ~8 s the banner shows **HIGH RISK** with the score and confidence. Every receipt links to the page the fact came from. "What to do next" gives three concrete actions, including the 1930 helpline. Click **Share** to download the PNG card a student can forward.

**Contrast (20 s).** Paste `demo/samples/legit_internship_url.txt` (a real careers-page URL). Cards flip green: exact-match domain, old domain, role listed on the official careers page. **LIKELY GENUINE**.

**Close (15 s).** Every external fact came from TinyFish Search, Fetch or Agent, plus free RDAP/DNS. The verdict is a deterministic rule engine; Claude Haiku only explains it. A clean result is not a guarantee, and we say so on every page.
