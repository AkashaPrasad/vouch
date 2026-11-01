"""Check pipeline. Stage 0 extract -> Stage 1 parallel evidence -> preliminary -> Stage 2 agents -> final.
Never raises to the client; every failure degrades a signal to `unknown`."""
import asyncio
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path

from app.clients import anthropic_client as haiku
from app.clients import doh, rdap, tinyfish, urlhaus
from app.events import CheckBus
from app.pipeline import domains as dm
from app.pipeline import extract as ex
from app.pipeline.lookalike import compare, is_free_mail, label, registrable
from app.pipeline.scoring import compute_verdict
from app.pipeline.weights import SIGNAL_NAMES, W

log = logging.getLogger("vouch.pipeline")
GOALS = Path(__file__).resolve().parent.parent / "goals"
AGGREGATORS = ("linkedin.", "naukri.", "glassdoor.", "indeed.", "ambitionbox.", "justdial.", "facebook.", "instagram.",
               "zaubacorp.", "tofler.", "thecompanycheck.", "wikipedia.", "youtube.", "quora.", "reddit.", "twitter.",
               "x.com", "crunchbase.", "internshala.", "foundit.", "shine.", "apna.", "medium.", "economictimes.")
SHORTENERS = ("forms.gle", "docs.google.com", "t.me", "wa.me", "bit.ly", "tinyurl.com", "chat.whatsapp.com")
SCAM_WORDS = re.compile(r"\b(scam|fraud|fake|cheat|duped|complaint|beware|warning|alert)\b", re.I)
REGISTRY_SITES = ("zaubacorp.com", "tofler.in", "thecompanycheck.com")

# in-memory registry of runs for GET /api/checks/{id}
RUNS: dict[str, "CheckRun"] = {}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CheckRun:
    def __init__(self, check_id: str, bus: CheckBus, text: str, url: str | None):
        self.check_id, self.bus, self.text, self.url = check_id, bus, text or "", url
        self.t0 = time.monotonic()
        self.created_at = now_iso()
        self.status = "running"
        self.extraction: dict = {}
        self.public_extraction: dict | None = None
        self.signals: dict[str, dict] = {}
        self.verdict: dict | None = None
        self.explanation: dict | None = None
        self.tf_success = False
        self.tf_attempted = False
        self.official_domain = ""
        self.duration_ms: int | None = None
        self.search_hits: dict[str, list[dict] | None] = {}
        self.resolved_shorteners: dict[str, str] = {}

    def elapsed_ms(self) -> int:
        return int((time.monotonic() - self.t0) * 1000)

    @property
    def limited(self) -> bool:
        return self.tf_attempted and not self.tf_success or (not self.tf_attempted and tinyfish.state["search_ok"] is False)

    async def emit(self, event: str, data: dict) -> None:
        await self.bus.emit(event, data)

    async def pending(self, code: str) -> None:
        sig = {"code": code, "name": SIGNAL_NAMES[code], "status": "pending", "weight_applied": 0, "summary": "Checking…",
               "evidence": [], "source": "regex", "started_at": now_iso(), "finished_at": None, "elapsed_ms": 0, "tags": [], "_t": time.monotonic()}
        self.signals[code] = sig
        await self.emit("signal.update", self.public_signal(sig))

    async def resolve(self, code: str, status: str, weight: int, summary: str, source: str,
                      evidence: list[dict] | None = None, tags: list[str] | None = None) -> None:
        prev = self.signals.get(code) or {}
        t = prev.get("_t", time.monotonic())
        sig = {"code": code, "name": SIGNAL_NAMES[code], "status": status,
               "weight_applied": int(weight) if status in ("pass", "fail") else 0, "summary": summary,
               "evidence": [{"title": e.get("title", "")[:200], "url": e.get("url", ""), "snippet": (e.get("snippet") or "")[:400],
                             "fetched_at": e.get("fetched_at") or now_iso()} for e in (evidence or [])][:5],
               "source": source, "started_at": prev.get("started_at", now_iso()), "finished_at": now_iso(),
               "elapsed_ms": int((time.monotonic() - t) * 1000), "tags": tags or [], "_t": t}
        self.signals[code] = sig
        await self.emit("signal.update", self.public_signal(sig))

    @staticmethod
    def public_signal(sig: dict) -> dict:
        return {k: v for k, v in sig.items() if not k.startswith("_")}

    def signal_list(self) -> list[dict]:
        return [self.signals[c] for c in SIGNAL_NAMES if c in self.signals]

    def public_signals(self) -> list[dict]:
        return [self.public_signal(s) for s in self.signal_list()]

    def evidence_urls(self) -> set[str]:
        return {e["url"] for s in self.signals.values() for e in s.get("evidence", []) if e.get("url")}

    def compute(self, is_final: bool) -> dict:
        return compute_verdict(self.signal_list(), is_final=is_final, elapsed_ms=self.elapsed_ms(), limited=self.limited)

    def snapshot(self) -> dict:
        return {"check_id": self.check_id, "status": self.status, "created_at": self.created_at,
                "duration_ms": self.duration_ms if self.duration_ms is not None else self.elapsed_ms(),
                "extraction": self.public_extraction, "signals": self.public_signals(),
                "verdict": self.verdict, "explanation": self.explanation}

    # -------- TinyFish helpers that track availability --------
    async def tf_search(self, key: str, query: str, **kw) -> list[dict] | None:
        self.tf_attempted = True
        res = await tinyfish.search(query, **kw)
        if res is not None:
            self.tf_success = True
        self.search_hits[key] = res
        return res

    async def tf_fetch(self, urls: list[str], **kw) -> dict[str, dict] | None:
        self.tf_attempted = True
        res = await tinyfish.fetch(urls, **kw)
        if res:
            self.tf_success = True
        return res


# ---------------------------------------------------------------- stage 0
async def stage0(run: CheckRun) -> None:
    text = run.text
    if run.url and len(text) < 40:
        fetched = await run.tf_fetch([run.url], purpose="read a job posting to verify whether the offer is genuine")
        if fetched:
            page = next(iter(fetched.values()))
            text = f"{text}\n\nURL: {run.url}\nTitle: {page.get('title', '')}\n{page.get('text', '')[:8000]}"
        else:
            text = f"{text}\nURL: {run.url}"
    run.text = text
    regex = ex.regex_extract(text)
    h = await haiku.extract(text)
    run.extraction = ex.merge(regex, h, run.url)
    run.extraction["_haiku_ok"] = h is not None
    run.public_extraction = ex.public_extraction(run.extraction)
    await run.emit("extraction.done", run.public_extraction)

    e = run.extraction
    src = "haiku" if h is not None else "regex"
    m = e["money_requested"]
    if m["asked"]:
        amt = f" ({m['amount']})" if m.get("amount") else ""
        purpose = f" for {m['purpose']}" if m.get("purpose") else ""
        await run.resolve("S1", "fail", W["S1_money"], f"The message asks you to pay{amt}{purpose}. Genuine employers never charge candidates.", src)
    else:
        await run.resolve("S1", "pass", 0, "No payment request found in the message.", src)

    ch = set(e["contact_channels"])
    off = ch & ex.ONLY_PLATFORM_CHANNELS
    corp_mail = [m for m in e["sender_emails"] if not is_free_mail(ex.domain_of(m))]
    if off and not e["sender_emails"]:
        await run.resolve("S9", "fail", W["S9_offplatform"], f"Contact only via {', '.join(sorted(off))}; no email address at all.", src, tags=["platform_only"])
    elif off and not corp_mail:
        await run.resolve("S9", "fail", W["S9_offplatform"], f"Contact via {', '.join(sorted(off))} plus a free-mail address; no company email.", src, tags=["platform_only"])
    elif off:
        await run.resolve("S9", "pass", 0, f"Uses {', '.join(sorted(off))} but also gives a company email address.", src)
    else:
        await run.resolve("S9", "pass", 0, "Uses normal contact channels.", src)

    pats = e.get("patterns") or {}
    reasons, tags, weight = [], [], 0
    if pats.get("task_scam"):
        reasons.append(f"task-scam pattern: \"{pats['task_scam'][0]}\"")
        tags.append("task_scam"); weight = max(weight, W["S10_task_scam"])
    if pats.get("money_mule"):
        reasons.append(f"asks you to receive and forward money (\"{pats['money_mule'][0]}\")")
        tags.append("money_mule"); weight = max(weight, W["S10_money_mule"])
    if e.get("urgency_phrases"):
        reasons.append(f"pressure: \"{e['urgency_phrases'][0]}\"")
        tags.append("urgency"); weight = max(weight, W["S10_pressure"])
    if e.get("unrealistic_pay"):
        reasons.append("pay looks unrealistic for the role")
        tags.append("unrealistic_pay"); weight = max(weight, W["S10_pressure"])
    if re.search(r"without (an )?interview|no interview|selected directly|directly selected|no (test|assessment)|without (any )?(test|assessment|application)", text, re.I):
        reasons.append("selected without an interview")
        tags.append("no_interview"); weight = max(weight, W["S10_pressure"])
    if pats.get("overseas"):
        reasons.append(f"overseas-job pattern (\"{pats['overseas'][0]}\")")
        tags.append("overseas"); weight = max(weight, W["S10_pressure"])
    if pats.get("gov_job") and e["money_requested"]["asked"]:
        reasons.append("government job offered for a fee (official recruitment never charges)")
        tags.append("gov_job_fee"); weight = max(weight, W["S10_task_scam"])
    if pats.get("personal_data"):
        reasons.append(f"asks for sensitive data up front (\"{pats['personal_data'][0]}\")")
        tags.append("personal_data"); weight = max(weight, W["S10_personal_data"])
    if reasons:
        await run.resolve("S10", "fail", weight, "Too-good-to-be-true signs: " + "; ".join(reasons) + ".", src, tags=tags)
    else:
        await run.resolve("S10", "pass", 0, "No urgency, task-scam or unrealistic promises detected.", src)


# ---------------------------------------------------------------- stage 1
def _sender_domain(e: dict) -> str:
    doms = [ex.domain_of(m) for m in e["sender_emails"]]
    corp = [d for d in doms if not is_free_mail(d)]
    return corp[0] if corp else (doms[0] if doms else "")


def _claimed_site(e: dict) -> str:
    """The company-category domain the message links to (never a job board, form, shortener or free host)."""
    sender = _sender_domain(e)
    for d in dm.company_domains(e):
        if d != registrable(sender or "-"):
            return d
    return ""


def _free_host_site(e: dict) -> str:
    """First free-site-builder host (wixsite.com, github.io ...) used as the 'company site'."""
    return next((h["host"] for h in e.get("hosts", []) if h["category"] == "free_host"), "")


def _pick_official(company: str, hits: list[dict] | None, claimed: str) -> str:
    comp = re.sub(r"\b(pvt|private|ltd|limited|llp|inc|technologies|technology|solutions|services|india|software|tech|infotech)\b\.?", "", company.lower())
    comp_key = re.sub(r"[^a-z0-9]", "", comp)
    for h in hits or []:
        d = ex.domain_of(h["url"])
        if not d or dm.is_platform(d):
            continue
        lbl = re.sub(r"[^a-z0-9]", "", label(d))
        if comp_key and len(lbl) >= 3 and (lbl in comp_key or comp_key in lbl):
            return registrable(d)
    return ""


async def s2_s3_s4(run: CheckRun, official: str) -> None:
    e = run.extraction
    sender = _sender_domain(e)
    claimed = _claimed_site(e)
    free_host = _free_host_site(e)
    brand = e.get("known_brand")
    platforms = dm.platform_hosts(e)
    plat_desc = ", ".join(dm.describe(h["host"]) for h in platforms[:3])
    ev_official = [{"title": f"Official site: {official}", "url": f"https://{official}",
                    "snippet": "Well-known employer; official domain from Vouch's brand list" if brand else "Found via TinyFish Search"}] if official else []

    # ---------------- S2: who is really writing to you?
    if sender and is_free_mail(sender):
        if brand:
            await run.resolve("S2", "fail", W["S2_impersonation"],
                              f"Claims to be {brand['name']} but writes from {sender}. {brand['name']} recruits only from @{brand['official_domains'][0]}.",
                              "haiku", ev_official, ["impersonation", "free_mail", "known_brand"])
        else:
            await run.resolve("S2", "fail", W["S2_freemail"], f"Recruiter uses a free email ({sender}) instead of a company domain.", "haiku", ev_official, ["free_mail"])
    elif sender:
        rel = compare(sender, official)
        if not official:
            if brand:
                await run.resolve("S2", "fail", W["S2_impersonation"], f"Claims to be {brand['name']} but {sender} is not one of its domains.",
                                  "haiku", [], ["impersonation", "known_brand"])
            else:
                await run.resolve("S2", "unknown", 0, f"Sender domain {sender}; could not confirm the company's official domain.", "tinyfish_search")
        elif rel in ("exact", "subdomain"):
            await run.resolve("S2", "pass", W["S2_exact"], f"Sender domain {sender} matches the official site {official}.", "tinyfish_search", ev_official, ["exact"])
        elif rel == "lookalike" or (brand and dm.brand_in_label(sender, brand)):
            await run.resolve("S2", "fail", W["S2_lookalike"], f"Sender domain {sender} imitates the official {official}.", "tinyfish_search", ev_official, ["lookalike"])
        elif brand:
            await run.resolve("S2", "fail", W["S2_impersonation"], f"Claims to be {brand['name']} but writes from {sender}, not {official}.",
                              "tinyfish_search", ev_official, ["impersonation", "known_brand"])
        else:
            await run.resolve("S2", "fail", W["S2_freemail"], f"Sender domain {sender} is not the official {official}.", "tinyfish_search", ev_official, ["mismatch"])
    else:
        # no email at all: judge by what the message links to
        cats = {h["category"] for h in platforms}
        if claimed and official and compare(claimed, official) in ("exact", "subdomain"):
            await run.resolve("S2", "pass", W["S2_exact"], f"No sender email, but the message links to the official site {official}.", "tinyfish_search", ev_official, ["exact"])
        elif claimed and brand and dm.brand_in_label(claimed, brand) and registrable(claimed) not in brand["official_domains"]:
            await run.resolve("S2", "fail", W["S2_lookalike"], f"Linked site {claimed} imitates {brand['name']} (official: {brand['official_domains'][0]}).",
                              "haiku", ev_official, ["lookalike", "known_brand"])
        elif free_host or (platforms and cats & {"shortener", "form_or_doc", "messaging", "free_host"} and not claimed):
            what = dm.describe(free_host) if free_host else plat_desc
            await run.resolve("S2", "fail", W["S2_no_company_domain"], f"No company email or website; the offer only points to {what}.",
                              "regex", [], ["platform_only"] + (["free_host"] if free_host else []))
        elif platforms and not claimed:
            await run.resolve("S2", "unknown", 0, f"Listing is hosted on {plat_desc}, which is a platform, not the employer. No recruiter email to compare.",
                              "regex", [], ["platform_only"])
        else:
            await run.resolve("S2", "unknown", 0, "No sender email address in the message.", "regex")

    # ---------------- S3 / S4 target: a real company domain only
    target = sender if sender and not is_free_mail(sender) else claimed
    if free_host and not target:
        await run.resolve("S3", "fail", W["S3_free_host"], f"The 'company site' is a page on {dm.describe(free_host)}; anyone can create one for free.",
                          "regex", [], ["free_host"])
        await run.resolve("S4", "unknown", 0, f"{dm.describe(free_host)} is shared hosting; its mail records say nothing about the employer.", "dns")
        return
    if not target:
        if platforms:
            await run.resolve("S3", "unknown", 0, f"Only platform domains found ({plat_desc}); nothing company-owned to age-check.", "rdap", [], ["platform_only"])
            await run.resolve("S4", "unknown", 0, f"{plat_desc} belongs to the platform, not the employer; no company mail records to check.", "dns", [], ["platform_only"])
        elif sender and is_free_mail(sender):
            await run.resolve("S3", "unknown", 0, "No company domain to look up.", "rdap")
            await run.resolve("S4", "unknown", 0, "Sender uses free email; no company mail records to check.", "dns")
        else:
            await run.resolve("S3", "unknown", 0, "No company domain to look up.", "rdap")
            await run.resolve("S4", "unknown", 0, "No company domain to check.", "dns")
        return
    is_official = bool(official) and compare(target, official) in ("exact", "subdomain")
    r, d = await asyncio.gather(rdap.lookup(target), doh.records(target))
    if r is None or r.get("age_days") is None:
        if d is not None and not d["a"] and not d["mx"]:
            await run.resolve("S3", "fail", W["S3_lt30"], f"{target} has no registration record and does not resolve.", "rdap",
                              [{"title": f"DNS for {target}", "url": d["url"], "snippet": "NXDOMAIN / no records"}])
        else:
            await run.resolve("S3", "unknown", 0, f"Registration date for {target} unavailable.", "rdap")
    else:
        age = r["age_days"]
        evd = [{"title": f"RDAP {target}", "url": r["url"], "snippet": f"Registered {r['registered_at']} via {r['registrar'] or 'unknown registrar'}"}]
        if age < 30:
            await run.resolve("S3", "fail", W["S3_lt30"], f"{target} was registered only {age} days ago.", "rdap", evd)
        elif age < 180:
            await run.resolve("S3", "fail", W["S3_lt180"], f"{target} is new: registered {age} days ago.", "rdap", evd)
        elif age > 3 * 365 and (is_official or not official):
            await run.resolve("S3", "pass", W["S3_gt3y"], f"{target} has existed for {age // 365} years.", "rdap", evd)
        elif age > 3 * 365:
            await run.resolve("S3", "pass", 0, f"{target} is {age // 365} years old, but it is not the official {official}; age alone proves nothing.", "rdap", evd, ["mismatch"])
        else:
            await run.resolve("S3", "pass", 0, f"{target} registered {age} days ago.", "rdap", evd)
    if d is None:
        await run.resolve("S4", "unknown", 0, f"DNS lookup for {target} failed.", "dns")
    else:
        evd = [{"title": f"DNS MX {target}", "url": d["url"], "snippet": f"MX: {', '.join(d['mx'][:3]) or 'none'}; A: {', '.join(d['a'][:2]) or 'none'}"}]
        if not d["mx"]:
            await run.resolve("S4", "fail", W["S4_no_mx"], f"{target} has no mail (MX) records" + ("" if d["a"] else " and no website") + ".", "dns", evd)
        else:
            await run.resolve("S4", "pass", 0, f"{target} has working mail records.", "dns", evd)


async def s12(run: CheckRun) -> None:
    e = run.extraction
    urls = [u if u.startswith("http") else "http://" + u for u in e["urls"] if not u.lower().startswith("upi://")][:3]
    short = dm.shortener_urls(e["urls"])
    pay = (e.get("patterns") or {}).get("payment_links") or []
    if not urls:
        await run.resolve("S12", "unknown", 0, "No links in the message to check.", "urlhaus")
        return
    res = await asyncio.gather(*(urlhaus.check_url(u) for u in urls))
    listed = [r for r in res if r and r["listed"]]
    resolved = run.resolved_shorteners
    if listed:
        await run.resolve("S12", "fail", W["S12_hit"], f"{listed[0]['url']} is listed for malware/abuse ({listed[0]['threat']}).", "urlhaus",
                          [{"title": "URLhaus listing", "url": listed[0]["reference"] or "https://urlhaus.abuse.ch", "snippet": listed[0]["threat"]}])
    elif pay:
        await run.resolve("S12", "fail", W["S12_shortener"], f"The message contains a payment link ({dm.describe(pay[0])}). Employers never send candidates payment links.",
                          "regex", [], ["payment_link"])
    elif short:
        dest = resolved.get(short[0])
        if dest:
            await run.resolve("S12", "fail", W["S12_shortener"], f"Shortened link {dm.describe(short[0])} hides its destination: it leads to {dm.describe(dest)}.",
                              "tinyfish_fetch", [{"title": "Resolved destination", "url": dest, "snippet": f"{short[0]} -> {dest}"}], ["shortener"])
        else:
            await run.resolve("S12", "fail", W["S12_shortener"], f"Shortened link {dm.describe(short[0])} hides the real destination.", "regex", [], ["shortener"])
    elif any(r is not None for r in res):
        await run.resolve("S12", "pass", 0, "Links are not on known abuse lists.", "urlhaus")
    else:
        await run.resolve("S12", "unknown", 0, "URL reputation service unavailable; no shortened or payment links found.", "urlhaus")


def _mentions(h: dict, needles: list[str]) -> bool:
    blob = (h.get("title", "") + " " + h.get("snippet", "")).lower()
    return any(n and n.lower() in blob for n in needles)


async def stage1(run: CheckRun) -> dict:
    e = run.extraction
    company = (e.get("company_name") or "").strip()
    purpose = f"verify whether a job offer from {company or 'a recruiter'} is genuine"
    phone = e["sender_phones"][0] if e["sender_phones"] else ""
    email = e["sender_emails"][0] if e["sender_emails"] else ""

    searches = []
    if company:
        searches += [
            ("official", f"\"{company}\" official website careers", {}),
            ("scam", f"\"{company}\" scam OR fraud OR \"fake offer letter\"", {}),
            ("registry", f"\"{company}\" CIN zaubacorp OR tofler", {}),
            ("news", f"\"{company}\" job scam", {"domain_type": "news", "recency_minutes": 525600}),
        ]
    if phone:
        searches.append(("phone", f"\"{phone}\" scam OR fraud OR job", {}))
    if email:
        searches.append(("email", f"\"{email}\" scam OR fraud", {}))
    results = await asyncio.gather(*(run.tf_search(k, q, purpose=purpose, **kw) for k, q, kw in searches))
    hits = {k: r for (k, _, _), r in zip(searches, results)}

    claimed = _claimed_site(e)
    brand = e.get("known_brand")
    official = ""
    if brand:
        # a well-known employer: its official domain is known without searching
        official = brand["official_domains"][0]
        if claimed and registrable(claimed) in brand["official_domains"]:
            official = registrable(claimed)
    if not official:
        official = _pick_official(company, hits.get("official"), claimed) if company else ""
    if not official and e.get("claimed_official_domain") and e.get("_haiku_ok"):
        # only trust Haiku's domain if it's not a platform/free-mail and not a lookalike of the sender
        cod = e["claimed_official_domain"]
        if not is_free_mail(cod) and not dm.is_platform(cod) and compare(_sender_domain(e), cod) != "lookalike":
            official = registrable(cod)
    run.official_domain = official

    # resolve shortened links through TinyFish Fetch so we can see where they really go
    short = dm.shortener_urls(e["urls"])[:2]
    if short:
        fixed = [u if u.startswith("http") else "https://" + u for u in short]
        got = await run.tf_fetch(fixed, purpose=purpose, ttl=0)
        for u, fu in zip(short, fixed):
            page = (got or {}).get(fu)
            final = (page or {}).get("final_url") or ""
            if final and ex.domain_of(final) != ex.domain_of(fu):
                run.resolved_shorteners[u] = final
                if final not in e["urls"]:
                    e["urls"].append(final)
        e["hosts"] = dm.hosts_of(e)
        if run.public_extraction is not None:
            run.public_extraction["urls"], run.public_extraction["hosts"] = e["urls"], e["hosts"]
        claimed = _claimed_site(e)

    # Fetch batch: registry page, top scam hits, careers page, claimed site
    fetch_urls: list[str] = []
    reg_hit = next((h for h in hits.get("registry") or [] if any(s in h["url"] for s in REGISTRY_SITES)), None)
    if reg_hit:
        fetch_urls.append(reg_hit["url"])
    careers_url = ""
    if official:
        careers_url = next((h["url"] for h in hits.get("official") or [] if registrable(ex.domain_of(h["url"])) == official
                            and re.search(r"career|jobs|join", h["url"], re.I)), "") or f"https://{official}/careers"
        fetch_urls.append(careers_url)
    claimed_url = ""
    if claimed and registrable(claimed) != official and not dm.is_platform(claimed):
        claimed_url = next((u for u in e["urls"] if ex.domain_of(u) == claimed), f"https://{claimed}")
        if not claimed_url.startswith("http"):
            claimed_url = "https://" + claimed_url
        fetch_urls.append(claimed_url)

    async def do_fetch():
        return await run.tf_fetch(fetch_urls, purpose=purpose) if fetch_urls else {}

    fetched, *_ = await asyncio.gather(do_fetch(), s2_s3_s4(run, official), s12(run))
    fetched = fetched or {}

    # S5 scam reports
    needles = [company, phone, email]
    scam_hits = [h for k in ("scam", "news", "phone", "email") for h in (hits.get(k) or [])
                 if SCAM_WORDS.search(h.get("title", "") + " " + h.get("snippet", "")) and _mentions(h, needles)]
    if scam_hits:
        await run.resolve("S5", "fail", W["S5_reports"], f"Found {len(scam_hits)} public report(s) linking this offer to scams/fraud.",
                          "tinyfish_search", scam_hits[:3])
    elif not searches:
        await run.resolve("S5", "unknown", 0, "No company, phone or email to search for.", "tinyfish_search")
    elif all(r is None for r in results):
        await run.resolve("S5", "unknown", 0, "Web search unavailable right now.", "tinyfish_search")
    else:
        await run.resolve("S5", "pass", 0, "No public scam reports found for this company or contact.", "tinyfish_search")

    # S7 registry fast path
    if not company:
        await run.resolve("S7", "unknown", 0, "No company name to look up.", "tinyfish_search")
    elif reg_hit:
        page = fetched.get(reg_hit["url"])
        blob = ((page or {}).get("text", "") + " " + reg_hit.get("snippet", "")).lower()
        evd = [{"title": reg_hit["title"], "url": reg_hit["url"], "snippet": reg_hit["snippet"]}]
        if re.search(r"strike off|struck off|under process of striking|dissolved", blob):
            await run.resolve("S7", "fail", W["S7_struck_off"], f"Registry shows {company} as struck off / closed.", "tinyfish_fetch", evd, ["struck_off"])
        elif re.search(r"\bactive\b", blob):
            await run.resolve("S7", "pass", W["S7_active"], f"{company} is listed as an active registered company.", "tinyfish_fetch", evd)
        else:
            await run.resolve("S7", "unknown", 0, "Registry page found but status unclear.", "tinyfish_fetch", evd)
    else:
        await run.resolve("S7", "unknown", 0, "No registry record found via search.", "tinyfish_search")

    # S8 careers fast path
    role = (e.get("role_title") or "").strip()
    if not official or not role:
        await run.resolve("S8", "unknown", 0, "Official careers page or role title not available.", "tinyfish_fetch")
    else:
        page = fetched.get(careers_url)
        words = [w for w in re.findall(r"[a-z]+", role.lower()) if len(w) > 3]
        text = (page or {}).get("text", "").lower()
        if page and words and all(w in text for w in words):
            await run.resolve("S8", "pass", W["S8_listed"], f"\"{role}\" appears on the official careers page.", "tinyfish_fetch",
                              [{"title": page.get("title") or "Careers", "url": page.get("final_url") or careers_url, "snippet": role}])
        else:
            await run.resolve("S8", "unknown", 0, f"\"{role}\" not seen on the careers landing page; deep check pending.", "tinyfish_fetch")

    # S11 site consistency
    free_host = _free_host_site(e)
    platforms = dm.platform_hosts(e)
    if not claimed_url:
        if claimed and official and registrable(claimed) == official:
            await run.resolve("S11", "pass", 0, f"Linked site is the official {official}.", "tinyfish_fetch")
        elif free_host:
            await run.resolve("S11", "fail", W["S11_inconsistent"], f"The linked 'company site' is a free {dm.describe(free_host)} page, not a company domain.",
                              "regex", [], ["free_host"])
        elif platforms:
            boards = [h for h in platforms if h["category"] == "job_board"]
            if boards and official:
                await run.resolve("S11", "unknown", 0, f"Listing is on {dm.describe(boards[0]['host'])}. Platforms do not verify employers; compare with the official {official} (see S8).",
                                  "regex", [], ["platform_only"])
            else:
                await run.resolve("S11", "unknown", 0, f"No company website linked; only {', '.join(dm.describe(h['host']) for h in platforms[:3])}.", "regex", [], ["platform_only"])
        else:
            await run.resolve("S11", "unknown", 0, "No company website linked in the message.", "tinyfish_fetch")
    else:
        page = fetched.get(claimed_url) or next((v for k, v in fetched.items() if ex.domain_of(k) == claimed), None)
        rel = compare(claimed, official) if official else "different"
        brand_fake = bool(brand) and dm.brand_in_label(claimed, brand) and registrable(claimed) not in brand["official_domains"]
        if not page and run.tf_success:
            await run.resolve("S11", "fail", W["S11_inconsistent"], f"Linked site {claimed} could not be loaded.", "tinyfish_fetch")
        elif page and official and (rel in ("lookalike", "different") or brand_fake):
            await run.resolve("S11", "fail", W["S11_inconsistent"], f"Linked site {claimed} is not the official {official}.", "tinyfish_fetch",
                              [{"title": page.get("title", claimed), "url": page.get("final_url") or claimed_url, "snippet": page.get("text", "")[:200]}],
                              ["lookalike"] if (rel == "lookalike" or brand_fake) else ["mismatch"])
        elif page:
            await run.resolve("S11", "unknown", 0, f"Linked site {claimed} loads; no official site to compare with.", "tinyfish_fetch",
                              [{"title": page.get("title", claimed), "url": page.get("final_url") or claimed_url, "snippet": page.get("text", "")[:200]}])
        else:
            await run.resolve("S11", "unknown", 0, "Could not load the linked site.", "tinyfish_fetch")
    return {"careers_url": careers_url, "company": company, "role": role}


# ---------------------------------------------------------------- stage 2 agents
async def agent_s6(run: CheckRun) -> None:
    e = run.extraction
    if e["sender_phones"]:
        ident, kind, shown = e["sender_phones"][0], "Mobile", ex.mask_phone(e["sender_phones"][0])
    elif e["sender_emails"]:
        ident, kind, shown = e["sender_emails"][0], "Email", ex.mask_email(e["sender_emails"][0])
    elif e["upi_ids"]:
        ident, kind, shown = e["upi_ids"][0], "UPI ID / Bank Account", ex.mask_upi(e["upi_ids"][0])
    else:
        await run.resolve("S6", "unknown", 0, "No phone, email or UPI ID to check.", "tinyfish_agent")
        return
    if not tinyfish.agent_available():
        await run.resolve("S6", "unknown", 0, "Deep checks temporarily unavailable.", "tinyfish_agent")
        return
    goal = (GOALS / "i4c_suspect.txt").read_text().format(identifier=ident, kind=kind)

    async def prog(t: str):
        await run.emit("agent.progress", {"signal": "S6", "text": t})

    res = await tinyfish.agent_run("https://cybercrime.gov.in/", goal, prog, cache_key=f"i4c:{ex.sha(ident)}")
    src_ev = [{"title": "I4C Suspect Repository (cybercrime.gov.in)", "url": "https://cybercrime.gov.in/", "snippet": (res or {}).get("page_text", "")[:300]}]
    st = (res or {}).get("status")
    if st == "found":
        await run.resolve("S6", "fail", W["S6_hit"], f"{shown} appears in the national cybercrime suspect registry.", "tinyfish_agent", src_ev)
    elif st == "not_found":
        await run.resolve("S6", "pass", W["S6_clean"], f"{shown} has no reports in the cybercrime suspect registry.", "tinyfish_agent", src_ev)
    else:
        await run.resolve("S6", "unknown", 0, "Cybercrime registry check could not complete (site blocked or timed out).", "tinyfish_agent")


async def agent_s7(run: CheckRun, company: str) -> None:
    goal = (GOALS / "mca_master_data.txt").read_text().format(company=company)

    async def prog(t: str):
        await run.emit("agent.progress", {"signal": "S7", "text": t})

    res = await tinyfish.agent_run("https://www.mca.gov.in/", goal, prog, cache_key=f"registry:{ex.sha(company)}", cache_ttl=7 * 86400)
    st = (res or {}).get("status")
    ev = [{"title": "MCA master data", "url": "https://www.mca.gov.in/", "snippet": f"{(res or {}).get('company_name', '')} {(res or {}).get('status_text', '')} {(res or {}).get('cin', '')}".strip()}]
    if st == "found":
        stx = str(res.get("status_text", "")).lower()
        if "strike" in stx or "struck" in stx or "dissolved" in stx:
            await run.resolve("S7", "fail", W["S7_struck_off"], f"MCA lists {company} as {res.get('status_text')}.", "tinyfish_agent", ev)
        elif "active" in stx:
            await run.resolve("S7", "pass", W["S7_active"], f"MCA lists {company} as Active (CIN {res.get('cin', '?')}).", "tinyfish_agent", ev)
        else:
            await run.resolve("S7", "unknown", 0, f"MCA record found; status '{res.get('status_text', '')}'.", "tinyfish_agent", ev)
    elif st == "not_found":
        await run.resolve("S7", "fail", W["S7_not_found"], f"No company named {company} found in MCA records.", "tinyfish_agent", ev)
    else:
        await run.resolve("S7", "unknown", 0, "Company registry check could not complete.", "tinyfish_agent")


async def agent_s8(run: CheckRun, careers_url: str, role: str) -> None:
    goal = (GOALS / "careers_role.txt").read_text().format(role=role, location=run.extraction.get("location") or "")

    async def prog(t: str):
        await run.emit("agent.progress", {"signal": "S8", "text": t})

    res = await tinyfish.agent_run(careers_url, goal, prog, cache_key=f"careers:{ex.sha(careers_url + role)}", cache_ttl=3600)
    if res and res.get("status") == "ok" and isinstance(res.get("found"), bool):
        roles = res.get("matching_roles") or []
        if res["found"]:
            first = roles[0] if roles else {}
            await run.resolve("S8", "pass", W["S8_listed"], f"\"{role}\" is listed on the official careers site.", "tinyfish_agent",
                              [{"title": first.get("title", role), "url": first.get("url") or careers_url, "snippet": "Found via careers search"}])
        else:
            await run.resolve("S8", "fail", W["S8_not_listed"], f"\"{role}\" is not listed on the official careers site.", "tinyfish_agent",
                              [{"title": "Official careers search", "url": careers_url, "snippet": "No matching openings"}])
    else:
        await run.resolve("S8", "unknown", 0, "Careers page deep check could not complete.", "tinyfish_agent")


# ---------------------------------------------------------------- explanation
def template_explanation(run: CheckRun, verdict: dict) -> dict:
    fails = sorted([s for s in run.signal_list() if s["status"] == "fail"], key=lambda s: -s["weight_applied"])
    passes = sorted([s for s in run.signal_list() if s["status"] == "pass" and s["weight_applied"] < 0], key=lambda s: s["weight_applied"])
    top = (fails + passes)[:5]
    company = run.extraction.get("company_name") or "this offer"
    headline = {"red": f"High risk: multiple scam signals for {company}", "amber": f"Be careful: some risk signals for {company}",
                "green": f"Likely genuine: {company} checks out so far"}[verdict["band"]]
    reasons = "; ".join(s["summary"].rstrip(".") for s in top[:2]) or "few signals could be verified"
    summary = f"Vouch rated this offer {verdict['label']} with a risk score of {verdict['score']}/100. Key findings: {reasons}."
    steps = ["Never pay any fee, deposit or 'refundable' amount to get a job.",
             f"Contact the company only through its official website{(' ' + run.official_domain) if run.official_domain else ''} or verified careers page.",
             "If you were asked for money or personal documents, report at cybercrime.gov.in or call 1930."]
    if verdict["band"] == "green":
        steps[2] = "Still verify the offer letter with HR from the official domain before sharing documents."
    receipts = [{"signal": s["code"], "finding": s["summary"], "source_url": (s["evidence"][0]["url"] if s["evidence"] else "")} for s in top]
    share = f"Vouch check: {verdict['label']} ({verdict['score']}/100)\n" + "\n".join(f"- {s['summary']}" for s in top[:3])
    return {"headline": headline, "summary": summary, "receipts": receipts, "next_steps": steps, "share_text": share[:600]}


def _validate_explanation(run: CheckRun, data: dict, verdict: dict) -> dict:
    allowed = run.evidence_urls()
    fallback = template_explanation(run, verdict)
    receipts = []
    for r in data.get("receipts") or []:
        if not isinstance(r, dict) or not r.get("finding"):
            continue
        url = r.get("source_url") or ""
        if url and url not in allowed:
            url = ""  # drop hallucinated URLs
        receipts.append({"signal": str(r.get("signal", "")), "finding": str(r["finding"]), "source_url": url})
    steps = [str(s) for s in (data.get("next_steps") or []) if s][:3]
    if len(steps) < 3:
        steps = (steps + fallback["next_steps"])[:3]
    share = str(data.get("share_text") or fallback["share_text"])
    share = f"{share}\nCheck yours: {_public_url()}"[:900]
    return {"headline": str(data.get("headline") or fallback["headline"])[:120],
            "summary": str(data.get("summary") or fallback["summary"]),
            "receipts": receipts or fallback["receipts"], "next_steps": steps, "share_text": share}


def _public_url() -> str:
    from app.config import get_settings
    return get_settings().public_web_url


async def explain(run: CheckRun, verdict: dict, stream: bool) -> dict:
    payload = {"verdict": {k: verdict[k] for k in ("score", "band", "label", "confidence")},
               "extraction": {k: v for k, v in (run.public_extraction or {}).items()},
               "signals": [{"code": s["code"], "name": s["name"], "status": s["status"], "summary": s["summary"],
                            "evidence": [{"title": x["title"], "url": x["url"], "snippet": x["snippet"][:200]} for x in s["evidence"][:2]]}
                           for s in run.signal_list()]}

    async def on_tok(t: str):
        await run.emit("explanation.token", {"text": t})

    data = await haiku.explain(payload, on_tok if stream else None)
    if not data:
        fb = template_explanation(run, verdict)
        if stream:
            await run.emit("explanation.token", {"text": fb["summary"]})
        fb["share_text"] = f"{fb['share_text']}\nCheck yours: {_public_url()}"[:900]
        return fb
    return _validate_explanation(run, data, verdict)


# ---------------------------------------------------------------- main entry
async def run_check(run: CheckRun, persist) -> None:
    from app.config import get_settings
    s = get_settings()
    try:
        await run.emit("check.created", {"check_id": run.check_id, "created_at": run.created_at})
        for code in SIGNAL_NAMES:
            await run.pending(code)
        try:
            await asyncio.wait_for(stage0(run), timeout=25)
        except Exception as e:  # noqa: BLE001
            log.exception("stage0 failed: %s", e)
            if not run.extraction:
                run.extraction = ex.merge(ex.regex_extract(run.text), None, run.url)
                run.public_extraction = ex.public_extraction(run.extraction)
                await run.emit("extraction.done", run.public_extraction)
            for c in ("S1", "S9", "S10"):
                if run.signals[c]["status"] == "pending":
                    await run.resolve(c, "unknown", 0, "Could not analyse the message.", "regex")

        s6_task = asyncio.create_task(agent_s6(run))
        s6_task._vouch_code = "S6"
        try:
            ctx = await asyncio.wait_for(stage1(run), timeout=35)
        except Exception as e:  # noqa: BLE001
            log.exception("stage1 failed: %s", e)
            ctx = {"careers_url": "", "company": run.extraction.get("company_name", ""), "role": ""}
        for c in ("S2", "S3", "S4", "S5", "S7", "S8", "S11", "S12"):
            if run.signals[c]["status"] == "pending":
                await run.resolve(c, "unknown", 0, "Check timed out.", run.signals[c]["source"])

        agent_tasks = [s6_task]
        if tinyfish.agent_available():
            if run.signals["S7"]["status"] == "unknown" and ctx.get("company"):
                t7 = asyncio.create_task(agent_s7(run, ctx["company"]))
                t7._vouch_code = "S7"
                agent_tasks.append(t7)
            if run.signals["S8"]["status"] == "unknown" and ctx.get("careers_url") and ctx.get("role"):
                t8 = asyncio.create_task(agent_s8(run, ctx["careers_url"], ctx["role"]))
                t8._vouch_code = "S8"
                agent_tasks.append(t8)

        prelim = run.compute(is_final=False)
        run.verdict = prelim
        await run.emit("verdict.preliminary", prelim)
        run.explanation = await explain(run, prelim, stream=True)

        remaining = max(1.0, s.final_deadline_s - (time.monotonic() - run.t0))
        done, pending = await asyncio.wait(agent_tasks, timeout=remaining)
        for t in pending:
            t.cancel()
        timed_out = {getattr(t, "_vouch_code", "") for t in pending}
        for code in ("S6", "S7", "S8"):
            if run.signals[code]["status"] == "pending" or (code in timed_out and run.signals[code]["status"] == "unknown"):
                await run.resolve(code, "unknown", 0, "Deep check did not finish in time.", "tinyfish_agent")

        final = run.compute(is_final=True)
        if final["score"] != prelim["score"] or final["band"] != prelim["band"]:
            run.explanation = await explain(run, final, stream=False)
        run.verdict = final
        run.status = "done"
        run.duration_ms = run.elapsed_ms()
        await run.emit("verdict.final", {"verdict": final, "explanation": run.explanation})
    except Exception as e:  # noqa: BLE001
        log.exception("pipeline crashed: %s", e)
        for code, sig in run.signals.items():
            if sig["status"] == "pending":
                await run.resolve(code, "unknown", 0, "Check failed.", sig["source"])
        run.verdict = run.compute(is_final=True)
        run.explanation = run.explanation or template_explanation(run, run.verdict)
        run.status = "done"
        run.duration_ms = run.elapsed_ms()
        await run.emit("error", {"message": "Some checks failed; showing partial results."})
        await run.emit("verdict.final", {"verdict": run.verdict, "explanation": run.explanation})
    finally:
        try:
            await persist(run)
        except Exception:  # noqa: BLE001
            log.exception("persist failed")
        await run.emit("done", {})
