"""Company profile research: an organised, sourced dossier on what it is like to work at a company.

POST /api/company-research {company, website?} -> {id, status}   (idempotent per company for 24h; 3 new jobs/IP/hour)
GET  /api/company-research/sample           -> precomputed sample report (app/data/company_sample.json)
GET  /api/company-research/{id}             -> {id, company, website, status, started_at, finished_at, progress, report}
GET  /api/company-research/{id}/stream      -> SSE: company.progress {text, at}, company.done {report}, company.error {message}, done

Pipeline: TinyFish Search per platform (parallel) -> one TinyFish Fetch batch of the best readable hits ->
optional TinyFish Agent on a reviews page -> optional TinyFish Research (deep, never blocks past its budget) ->
Claude organises into a fixed schema -> server-side validation drops any URL that was not searched/fetched and any
quote that is not found in the cited source's text."""
import asyncio
import json
import logging
import re
import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse, urlunparse

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app import auth
from app.clients import anthropic_client, tinyfish
from app.clients.cache import cache
from app.company_models import CompanyResearchRow
from app.config import get_settings
from app.db.models import SessionLocal, User, iso_utc
from app.events import BusRegistry

log = logging.getLogger("vouch.company")
router = APIRouter()
company_buses = BusRegistry()
JOBS: dict[str, asyncio.Task] = {}
_lock = asyncio.Lock()
MAX_PROGRESS = 200
APP_DIR = Path(__file__).resolve().parent
SAMPLE_PATH = APP_DIR / "data" / "company_sample.json"
GOAL_PATH = APP_DIR / "goals" / "company_reviews.txt"
PROMPT_PATH = APP_DIR / "prompts" / "company_report.md"

RESEARCH_BUDGET_S = 240      # deep research gets 4 minutes from job start, then we finish without it
AGENT_BUDGET_S = 150
JOB_BUDGET_S = 400           # hard safety net for the whole job
AGENT_CACHE_TTL = 7 * 86400
NEWS_RECENCY_MIN = 24 * 30 * 24 * 60  # ~24 months
RESULTS_PER_QUERY = 8
MAX_FETCH = 10
Progress = Callable[[str], Awaitable[None]]

PLATFORMS = ["reddit", "ambitionbox", "glassdoor", "blind", "x", "linkedin", "news", "official"]
PLATFORM_LABELS = {"reddit": "Reddit", "ambitionbox": "AmbitionBox", "glassdoor": "Glassdoor", "blind": "Blind",
                   "x": "X (Twitter)", "linkedin": "LinkedIn", "news": "News", "official": "Official site", "web": "Other web"}
DIMENSIONS = [
    ("culture", "Work culture"),
    ("work_life_balance", "Work-life balance"),
    ("compensation", "Compensation & appraisals"),
    ("management", "Management quality"),
    ("stability_layoffs", "Layoffs & firing practice"),
    ("freshers_treatment", "Freshers & interns"),
    ("growth", "Growth & learning"),
    ("hiring_process", "Hiring & onboarding"),
]
DIM_KEYS = [k for k, _ in DIMENSIONS]
NO_EVIDENCE = "Not enough public evidence."
SENTIMENTS = ("positive", "negative", "mixed")
NEWS_HOSTS = ("economictimes.indiatimes.com", "livemint.com", "moneycontrol.com", "inc42.com", "business-standard.com",
              "thehindu.com", "thehindubusinessline.com", "ndtv.com", "hindustantimes.com", "entrackr.com", "techcrunch.com",
              "reuters.com", "bloomberg.com", "yourstory.com", "indianexpress.com", "timesofindia.indiatimes.com",
              "financialexpress.com", "cnbctv18.com", "businesstoday.in", "news18.com", "the-ken.com", "medianama.com",
              "deccanherald.com", "theprint.in", "scroll.in", "outlookbusiness.com", "forbesindia.com", "businessinsider.in")
WALL_MARKERS = ("sign in", "log in", "login", "join now", "create an account", "captcha", "verify you are human",
                "access denied", "enable javascript", "are you a robot", "security check", "just a moment")
BOT_WALL = re.compile(r"security check|captcha|verify you are human|just a moment|access denied|are you a robot", re.I)
KEYWORDS = re.compile(
    r"layoff|laid off|fired|firing|terminat|notice period|severance|\bpip\b|culture|toxic|work[- ]?life|\bwlb\b|hours|"
    r"overtime|weekend|salary|\bpay\b|\bctc\b|hike|appraisal|bonus|esop|manag|\bboss|leadership|fresher|intern|graduate|"
    r"campus|onboard|interview|hiring|growth|learn|promotion|attrition|resign|stress|pressure|benefit|leave|\bwfh\b|"
    r"remote|review|rating|pros|cons|employee|restructur", re.I)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- queries & platform tagging
def queries_for(company: str) -> list[dict]:
    c = company.replace('"', "").strip()
    return [
        {"platform": "reddit", "q": f'site:reddit.com "{c}" (work culture OR layoffs OR interview OR salary OR toxic OR wlb)',
         "fallback": f"{c} reddit work culture layoffs salary"},
        {"platform": "ambitionbox", "q": f'site:ambitionbox.com "{c}" reviews', "fallback": f"{c} ambitionbox reviews"},
        {"platform": "glassdoor", "q": f'site:glassdoor.com OR site:glassdoor.co.in "{c}" reviews', "fallback": f"{c} glassdoor reviews"},
        {"platform": "blind", "q": f'site:teamblind.com "{c}"', "fallback": f"{c} teamblind"},
        {"platform": "x", "q": f'site:x.com OR site:twitter.com "{c}" (layoffs OR fired OR culture OR employees)',
         "fallback": f"{c} employees layoffs twitter"},
        {"platform": "linkedin", "q": f'site:linkedin.com/posts "{c}" (layoff OR culture OR joined OR left)',
         "fallback": f"{c} linkedin post layoff culture"},
        {"platform": "news", "q": f'"{c}" layoffs OR restructuring OR "laid off" OR attrition OR "work culture"',
         "domain_type": "news", "recency_minutes": NEWS_RECENCY_MIN, "fallback": f"{c} layoffs employees"},
        {"platform": "official", "q": f'"{c}" careers culture benefits site', "fallback": f"{c} careers"},
    ]


def host_of(url: str) -> str:
    try:
        h = (urlparse(url or "").hostname or "").lower()
    except ValueError:
        return ""
    return h.removeprefix("www.")


def _hmatch(host: str, dom: str) -> bool:
    return host == dom or host.endswith("." + dom)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def is_company_host(host: str, company: str, official_host: str = "") -> bool:
    if not host:
        return False
    if official_host and _hmatch(host, official_host):
        return True
    sl = slug(company)
    labels = host.split(".")[:-1]  # drop TLD
    return bool(sl) and len(sl) >= 3 and any(re.sub(r"[^a-z0-9]", "", lab) == sl for lab in labels)


def platform_for(url: str, query_platform: str = "", company: str = "", official_host: str = "") -> str:
    """Tag a URL by its host first (a reddit link found by the news query is still reddit), then by the query."""
    h = host_of(url)
    if _hmatch(h, "reddit.com") or _hmatch(h, "redd.it"):
        return "reddit"
    if _hmatch(h, "ambitionbox.com"):
        return "ambitionbox"
    if re.search(r"(^|\.)glassdoor\.[a-z.]+$", h):
        return "glassdoor"
    if _hmatch(h, "teamblind.com"):
        return "blind"
    if _hmatch(h, "x.com") or _hmatch(h, "twitter.com"):
        return "x"
    if _hmatch(h, "linkedin.com"):
        return "linkedin"
    if is_company_host(h, company, official_host):
        return "official"
    if query_platform == "news" or any(_hmatch(h, d) for d in NEWS_HOSTS):
        return "news"
    return "web"


def reddit_fetch_url(url: str) -> str:
    """Normalise Reddit thread URLs for Fetch. Verified live (2026-11-01): old.reddit.com now answers Fetch with
    `login_required` / HTTP errors, while www.reddit.com threads return the post + comments as text. So we rewrite
    old./np./m. hosts to www.reddit.com and drop tracking query strings."""
    h = host_of(url)
    if _hmatch(h, "reddit.com"):
        p = urlparse(url)
        return urlunparse(p._replace(netloc="www.reddit.com", query=""))
    return url


def url_key(url: str) -> str:
    """Canonical comparison key: scheme/www/old.reddit/trailing slash/fragment/query-insensitive."""
    u = (url or "").strip()
    if not u.lower().startswith("http"):
        return ""
    p = urlparse(u)
    h = (p.hostname or "").lower().removeprefix("www.")
    if _hmatch(h, "reddit.com"):
        h = "reddit.com"
    if h in ("twitter.com", "mobile.twitter.com", "mobile.x.com"):
        h = "x.com"
    path = re.sub(r"/+$", "", p.path or "")
    return f"{h}{path}".lower()


# ---------------------------------------------------------------- text helpers
def clean_text(md: str) -> str:
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md or "")
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"https?://\S+", "", t)
    out: list[str] = []
    seen: set[str] = set()
    for ln in t.splitlines():
        s = re.sub(r"[#>*_`|]+", " ", ln)
        s = re.sub(r"\s+", " ", s).strip()
        if len(s) < 25 and not re.search(r"[.!?]$", s):
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return "\n".join(out)


def relevant_excerpt(text: str, limit: int) -> str:
    """Opening of the page plus the lines that talk about work life, in original order, up to `limit` chars."""
    lines = (text or "").splitlines()
    keep: list[str] = []
    n = 0
    for i, ln in enumerate(lines):
        if n >= limit:
            break
        if n < 600 or KEYWORDS.search(ln):
            keep.append(ln[:1200])
            n += len(keep[-1]) + 1
    return "\n".join(keep)[:limit]


def readable(text: str) -> bool:
    t = text or ""
    if len(t) < 600:
        return False
    low = t[:3000].lower()
    hits = sum(m in low for m in WALL_MARKERS)
    return hits == 0 or (len(t) >= 2500 and hits <= 2)


def _norm(s: str) -> str:
    s = (s or "").lower().replace("’", "'").replace("‘", "'")
    s = re.sub(r"['\"`“”]", "", s)
    s = re.sub(r"[^a-z0-9%₹$]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def quote_in(quote: str, corpus_norm: str) -> bool:
    """True when the quote (or each '...'-separated part) is verbatim in the corpus, modulo case/punctuation;
    falls back to >=80% of word trigrams present to tolerate tiny copy differences."""
    if not quote or not corpus_norm:
        return False
    parts = [_norm(p) for p in re.split(r"\.\.\.|…", quote)]
    parts = [p for p in parts if len(p) >= 12]
    whole = _norm(quote)
    if not parts:
        return len(whole) >= 8 and whole in corpus_norm
    if all(p in corpus_norm for p in parts):
        return True
    words = whole.split()
    if len(words) < 6:
        return False
    tri = {" ".join(words[i:i + 3]) for i in range(len(words) - 2)}
    return sum(1 for t in tri if t in corpus_norm) / len(tri) >= 0.8


def trim_quote(q: str, limit: int = 240) -> str:
    q = re.sub(r"\s+", " ", (q or "")).strip().strip('"').strip()
    if len(q) <= limit:
        return q
    cut = q[: limit - 1].rsplit(" ", 1)[0]
    return cut + "…"


# ---------------------------------------------------------------- evidence store
class Doc(dict):
    """One source: {id, url, platform, title, kind, snippet, text, readable, fetch_attempted, agent_ok, date}."""

    def corpus(self) -> str:
        if "_corpus" not in self:
            self["_corpus"] = _norm(" ".join([self.get("title", ""), self.get("snippet", ""), self.get("text", ""),
                                              self.get("agent_text", ""), self.get("research_text", "")]))
        return self["_corpus"]


class Evidence:
    def __init__(self, company: str, official_host: str = ""):
        self.company = company
        self.official_host = official_host
        self.docs: dict[str, Doc] = {}
        self.by_key: dict[str, str] = {}

    def add(self, url: str, *, platform: str, title: str = "", snippet: str = "", kind: str = "snippet") -> Doc | None:
        k = url_key(url)
        if not k:
            return None
        if k in self.by_key:
            d = self.docs[self.by_key[k]]
            if snippet and snippet not in d.get("snippet", ""):
                d["snippet"] = (d.get("snippet", "") + " " + snippet).strip()
                d.pop("_corpus", None)
            if title and not d.get("title"):
                d["title"] = title
            return d
        did = f"S{len(self.docs) + 1}"
        d = Doc(id=did, url=url, platform=platform, title=title or host_of(url), kind=kind, snippet=snippet or "",
                text="", readable=False, fetch_attempted=False, agent_ok=False)
        self.docs[did] = d
        self.by_key[k] = did
        return d

    def alias(self, url: str, did: str) -> None:
        k = url_key(url)
        if k and k not in self.by_key:
            self.by_key[k] = did

    def resolve(self, ref: Any) -> Doc | None:
        r = str(ref or "").strip()
        m = re.fullmatch(r"\[?(S\d+)\]?", r)
        if m:
            return self.docs.get(m.group(1))
        did = self.by_key.get(url_key(r))
        return self.docs.get(did) if did else None

    def allowed_urls(self) -> set[str]:
        return {d["url"] for d in self.docs.values()}


def tag_hits(raw: dict[str, list[dict]], company: str, official_host: str = "") -> list[dict]:
    """{query_platform: [search results]} -> flat de-duplicated hits with `platform` from host/query and `query_platform`."""
    out: list[dict] = []
    seen: set[str] = set()
    sl = slug(company)
    for qp, results in raw.items():
        for r in (results or [])[:RESULTS_PER_QUERY]:
            url = r.get("url") or ""
            k = url_key(url)
            if not k or k in seen:
                continue
            blob = slug(" ".join([r.get("title", ""), r.get("snippet", ""), url]))
            if sl and sl not in blob:
                continue  # result does not mention the company at all
            seen.add(k)
            out.append({**r, "query_platform": qp, "platform": platform_for(url, qp, company, official_host)})
    return out


def infer_official_host(raw: dict[str, list[dict]], company: str, website: str = "") -> str:
    if website:
        h = host_of(website if "//" in website else "https://" + website)
        if h:
            return h
    for qp in ("official", "news", "reddit"):
        for r in raw.get(qp) or []:
            h = host_of(r.get("url", ""))
            if is_company_host(h, company):
                parts = h.split(".")
                return ".".join(parts[-2:]) if not h.endswith((".co.in", ".com.au", ".co.uk")) else ".".join(parts[-3:])
    return ""


def pick_fetch_urls(hits: list[dict], limit: int = MAX_FETCH) -> list[str]:
    """Readable sources first (Reddit threads, AmbitionBox reviews, news, Blind, official careers/about), then one
    Glassdoor page to probe the wall, then extras. Returns canonical URLs."""
    by: dict[str, list[str]] = defaultdict(list)
    for h in hits:
        by[h["platform"]].append(h["url"])
    picks: list[str] = []

    def take(pf: str, n: int, pred: Callable[[str], bool] = lambda u: True) -> None:
        for u in by.get(pf, []):
            if len(picks) >= limit or n <= 0:
                return
            if u in picks or not pred(u):
                continue
            picks.append(u)
            n -= 1

    thread = lambda u: "/comments/" in u  # noqa: E731
    take("reddit", 3, thread)
    take("ambitionbox", 2, lambda u: "review" in u.lower())
    take("news", 2)
    take("blind", 1)
    take("official", 1, lambda u: bool(re.search(r"career|about|culture|life|jobs|benefit|people|team", u, re.I)))
    if not any(platform_for(u) == "official" or u in by.get("official", []) for u in picks):
        take("official", 1)
    take("glassdoor", 1, lambda u: "review" in u.lower())
    take("ambitionbox", 2)
    take("reddit", 2, thread)
    take("news", 2)
    take("blind", 1)
    take("linkedin", 1)
    take("x", 1)
    take("web", 2)
    return picks[:limit]


# ---------------------------------------------------------------- organise (Claude) + validation
REPORT_TOOL = {
    "name": "record_company_report",
    "description": "Record the organised, sourced company profile. Cite documents by their id (e.g. S3).",
    "input_schema": {
        "type": "object",
        "properties": {
            "overall": {"type": "object", "properties": {
                "verdict_text": {"type": "string"},
                "score_0_100": {"type": ["integer", "null"], "minimum": 0, "maximum": 100},
                "confidence": {"type": "string", "enum": ["low", "medium", "high"]}},
                "required": ["verdict_text", "score_0_100", "confidence"]},
            "dimensions": {"type": "array", "items": {"type": "object", "properties": {
                "key": {"type": "string", "enum": DIM_KEYS},
                "score_0_100": {"type": ["integer", "null"], "minimum": 0, "maximum": 100},
                "summary": {"type": "string"},
                "evidence": {"type": "array", "items": {"type": "object", "properties": {
                    "quote": {"type": "string", "description": "Verbatim from the cited document, <= 240 chars"},
                    "source_id": {"type": "string"},
                    "sentiment": {"type": "string", "enum": list(SENTIMENTS)},
                    "date": {"type": "string"}},
                    "required": ["quote", "source_id", "sentiment"]}}},
                "required": ["key", "score_0_100", "summary", "evidence"]}},
            "layoffs_timeline": {"type": "array", "items": {"type": "object", "properties": {
                "date": {"type": "string"}, "what": {"type": "string"}, "source_id": {"type": "string"}},
                "required": ["date", "what", "source_id"]}},
            "red_flags": {"type": "array", "items": {"type": "object", "properties": {
                "text": {"type": "string"}, "source_id": {"type": "string"}}, "required": ["text", "source_id"]}},
            "green_flags": {"type": "array", "items": {"type": "object", "properties": {
                "text": {"type": "string"}, "source_id": {"type": "string"}}, "required": ["text", "source_id"]}},
        },
        "required": ["overall", "dimensions", "layoffs_timeline", "red_flags", "green_flags"],
    },
}


def build_payload(ev: Evidence, website: str) -> dict:
    docs = []
    for d in ev.docs.values():
        if d.get("readable") and d.get("text"):
            limit = 6000 if d["platform"] in ("reddit", "ambitionbox", "blind", "glassdoor") else 3500
            text, kind = relevant_excerpt(d["text"], limit), "fetched"
        elif d.get("agent_text"):
            text, kind = "", "agent"
        elif d.get("research_text"):
            text, kind = d["research_text"][:2500], "research"
        elif d.get("text"):
            text, kind = (d.get("snippet", "") + "\n" + d["text"][:2000]).strip(), "partial"
        else:
            text, kind = d.get("snippet", ""), "snippet"
        if d.get("agent_text"):
            text = (d["agent_text"] + "\n" + text).strip()
            kind = "agent" if kind == "snippet" else kind
        if len(text) < 40:
            continue
        docs.append({"id": d["id"], "platform": d["platform"], "kind": kind, "url": d["url"],
                     "title": d.get("title", "")[:200], "text": text})
    return {"company": ev.company, "website": website, "as_of": utcnow().date().isoformat(), "documents": docs}


async def organise_llm(payload: dict) -> dict | None:
    """Claude Haiku via forced tool use. Long output, so a per-call timeout well above the shared client's."""
    s = get_settings()
    c = anthropic_client.client().with_options(timeout=170, max_retries=1)
    system = PROMPT_PATH.read_text()
    kw: dict[str, Any] = dict(model=s.anthropic_model, max_tokens=9000, system=system, tools=[REPORT_TOOL],
                              messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
    try:
        try:
            resp = await asyncio.wait_for(c.messages.create(**kw, tool_choice={"type": "tool", "name": REPORT_TOOL["name"]}), timeout=180)
        except anthropic.BadRequestError as e:
            if "tool_choice" not in str(e).lower():
                raise
            kw["system"] = system + f"\n\nAlways answer by calling the `{REPORT_TOOL['name']}` tool exactly once."
            resp = await asyncio.wait_for(c.messages.create(**kw, tool_choice={"type": "auto"}), timeout=180)
        for block in resp.content:
            if getattr(block, "type", "") == "tool_use" and block.name == REPORT_TOOL["name"]:
                if getattr(resp, "stop_reason", "") == "max_tokens":
                    log.warning("company report hit max_tokens; using partial tool input")
                return dict(block.input)
    except Exception as e:  # noqa: BLE001
        log.warning("company organise failed: %s: %s", type(e).__name__, str(e)[:200])
    return None


def _score(v: Any) -> int | None:
    try:
        return None if v is None else max(0, min(100, int(v)))
    except (TypeError, ValueError):
        return None


def platforms_covered(ev: Evidence, evidence_counts: dict[str, int]) -> list[dict]:
    out = []
    present = {d["platform"] for d in ev.docs.values()}
    for pf in PLATFORMS + (["web"] if "web" in present else []):
        pdocs = [d for d in ev.docs.values() if d["platform"] == pf]
        read = [d for d in pdocs if d.get("readable")]
        tried = [d for d in pdocs if d.get("fetch_attempted")]
        agent_ok = any(d.get("agent_ok") for d in pdocs)
        if not pdocs:
            note = "No public results found"
        elif read:
            note = f"Read {len(read)} of {len(tried)} fetched page(s) in full" + ("; reviews also read by browsing agent" if agent_ok else "")
        elif agent_ok:
            note = "Reviews page read by browsing agent; other results are search snippets"
        elif tried:
            note = f"Login wall or block on {len(tried)} fetched page(s); search snippets kept as evidence"
        else:
            note = ("Search snippets only (not fetched)" if pf in ("web", "news", "official")
                    else "Search snippets only (pages not fetched; usually login-walled)")
        out.append({"platform": pf, "label": PLATFORM_LABELS[pf], "items": len(pdocs), "reachable": bool(read) or agent_ok,
                    "fetched_ok": len(read), "fetch_attempted": len(tried), "evidence_items": evidence_counts.get(pf, 0),
                    "note": note})
    return out


def validate_report(raw: dict | None, ev: Evidence, website: str = "") -> tuple[dict, dict]:
    """Map source ids/URLs onto searched/fetched sources, drop anything uncited or unverifiable. Returns (report, stats)."""
    raw = raw or {}
    stats = {"dropped_urls": 0, "dropped_quotes": 0, "kept_quotes": 0}
    cited: list[str] = []

    def src(ref: Any) -> Doc | None:
        d = ev.resolve(ref)
        if d is None:
            stats["dropped_urls"] += 1
            return None
        if d["id"] not in cited:
            cited.append(d["id"])
        return d

    raw_dims = {}
    for item in raw.get("dimensions") or []:
        if isinstance(item, dict) and item.get("key") in DIM_KEYS and item["key"] not in raw_dims:
            raw_dims[item["key"]] = item
    dims = []
    counts: dict[str, int] = defaultdict(int)
    for key, label in DIMENSIONS:
        item = raw_dims.get(key) or {}
        evid, seen = [], set()
        for e in item.get("evidence") or []:
            if not isinstance(e, dict):
                continue
            d = ev.resolve(e.get("source_id") or e.get("source_url"))
            if d is None:
                stats["dropped_urls"] += 1
                continue
            q = str(e.get("quote") or "")
            if not quote_in(q, d.corpus()):
                stats["dropped_quotes"] += 1
                continue
            q = trim_quote(q)
            if _norm(q) in seen:
                continue
            seen.add(_norm(q))
            src(d["id"])
            sent = e.get("sentiment") if e.get("sentiment") in SENTIMENTS else "mixed"
            entry = {"quote": q, "source_url": d["url"], "platform": d["platform"], "sentiment": sent}
            if str(e.get("date") or "").strip():
                entry["date"] = str(e["date"]).strip()[:40]
            evid.append(entry)
            counts[d["platform"]] += 1
            stats["kept_quotes"] += 1
            if len(evid) >= 6:
                break
        if evid:
            dims.append({"key": key, "label": label, "score_0_100": _score(item.get("score_0_100")),
                         "summary": str(item.get("summary") or "").strip()[:800] or NO_EVIDENCE, "evidence": evid})
        else:
            dims.append({"key": key, "label": label, "score_0_100": None, "summary": NO_EVIDENCE, "evidence": []})

    def flagged(items: Any, field: str = "text", n: int = 6) -> list[dict]:
        out = []
        for f in items or []:
            if not isinstance(f, dict) or not str(f.get(field) or "").strip():
                continue
            d = src(f.get("source_id") or f.get("source_url"))
            if d is None:
                continue
            out.append({field: str(f[field]).strip()[:300], "source_url": d["url"]})
            if len(out) >= n:
                break
        return out

    timeline = []
    for t in raw.get("layoffs_timeline") or []:
        if not isinstance(t, dict) or not str(t.get("what") or "").strip():
            continue
        d = src(t.get("source_id") or t.get("source_url"))
        if d is None:
            continue
        timeline.append({"date": str(t.get("date") or t.get("period") or "").strip()[:40], "what": str(t["what"]).strip()[:300],
                         "source_url": d["url"]})
    timeline = timeline[:10]
    red, green = flagged(raw.get("red_flags")), flagged(raw.get("green_flags"))

    ov = raw.get("overall") if isinstance(raw.get("overall"), dict) else {}
    scored = [d for d in dims if d["score_0_100"] is not None]
    if not scored:
        overall = {"verdict_text": "Not enough public evidence to profile this company yet.", "score_0_100": None, "confidence": "low"}
    else:
        conf = ov.get("confidence") if ov.get("confidence") in ("low", "medium", "high") else "low"
        if len(scored) < 3 and conf == "high":
            conf = "medium"
        sc = _score(ov.get("score_0_100"))
        if sc is None:
            sc = round(sum(d["score_0_100"] for d in scored) / len(scored))
        overall = {"verdict_text": str(ov.get("verdict_text") or "").strip()[:1200] or "See the dimensions below.",
                   "score_0_100": sc, "confidence": conf}

    order = cited + [d["id"] for d in ev.docs.values() if d.get("readable") and d["id"] not in cited]
    sources = [{"title": ev.docs[i].get("title") or host_of(ev.docs[i]["url"]), "url": ev.docs[i]["url"],
                "platform": ev.docs[i]["platform"]} for i in order][:40]
    report = {"company": ev.company, "website": website, "as_of": utcnow().date().isoformat(), "overall": overall,
              "dimensions": dims, "layoffs_timeline": timeline, "red_flags": red, "green_flags": green,
              "platforms_covered": platforms_covered(ev, counts), "sources": sources}
    return report, stats


# ---------------------------------------------------------------- gathering
async def _search_platform(spec: dict) -> list[dict]:
    res = await tinyfish.search(spec["q"], purpose="Employee reviews and work-culture evidence for a company profile",
                                domain_type=spec.get("domain_type"), recency_minutes=spec.get("recency_minutes"))
    if not res and spec.get("recency_minutes"):
        res = await tinyfish.search(spec["q"], domain_type=spec.get("domain_type"))
    if not res and spec.get("fallback"):
        res = await tinyfish.search(spec["fallback"], domain_type=spec.get("domain_type"))
    return (res or [])[:RESULTS_PER_QUERY]


def agent_text(res: dict) -> str:
    lines = []
    if res.get("rating"):
        lines.append(f"Overall rating: {res['rating']}" + (f" ({res['review_count']} reviews)" if res.get("review_count") else ""))
    if res.get("pros"):
        lines.append("Pros: " + "; ".join(str(p) for p in res["pros"][:8]))
    if res.get("cons"):
        lines.append("Cons: " + "; ".join(str(c) for c in res["cons"][:8]))
    for r in (res.get("sample_reviews") or [])[:8]:
        if isinstance(r, dict) and r.get("text"):
            meta = ", ".join(x for x in (str(r.get("role") or ""), str(r.get("date") or "")) if x)
            lines.append(f"Review: {r.get('title') or ''} - {r['text']}" + (f" ({meta})" if meta else ""))
    return "\n".join(lines)


async def run_agent(url: str, company: str, progress: Progress) -> dict | None:
    goal = GOAL_PATH.read_text().replace("{company}", company.replace('"', ""))

    async def on_prog(t: str) -> None:
        await progress(f"Reviews agent: {t[:200]}")

    return await tinyfish.agent_run(url, goal, on_progress=on_prog, cache_key=cache.key("company_reviews", company.lower().strip()),
                                    cache_ttl=AGENT_CACHE_TTL, timeout_s=AGENT_BUDGET_S)


async def deep_research(company: str, progress: Progress, box: dict) -> dict:
    """TinyFish Research (deep). Returns {citations, evidence:{url:{title,text}}}; raises on failure."""
    from app.research import describe

    s = get_settings()
    q = (f"What is it like to work at {company} in India: culture, work-life balance, pay, management, layoffs and "
         f"firing practices, treatment of freshers. Cite sources.")
    final: dict | None = None
    last = 0.0
    async with tinyfish.client().research.stream(query=q, mode=s.tinyfish_research_mode) as st:  # type: ignore[arg-type]
        async for e in st:
            name = getattr(e, "event", "")
            if name == "created":
                box["run_id"] = e.research_run_id
            elif name == "final_result":
                final = {"result": e.result, "citations": list(e.citations or [])}
            elif name == "error":
                raise RuntimeError(getattr(e, "message", "research failed"))
            elif name == "done":
                break
            else:
                text = describe(e)
                if text and time.monotonic() - last > 12:
                    last = time.monotonic()
                    await progress(f"Deep research: {text[:200]}")
    detail: dict[str, Any] = {}
    if box.get("run_id"):
        try:
            detail = (await tinyfish.client().research.get(box["run_id"])).model_dump(mode="json")
        except Exception as ex:  # noqa: BLE001
            log.info("company research get failed: %s", str(ex)[:120])
    deep = detail.get("deep_result") or final or {}
    cites = [c for c in (deep.get("citations") or (final or {}).get("citations") or []) if isinstance(c, str) and c.startswith("http")]
    evidence: dict[str, dict] = {}
    for item in detail.get("evidence") or []:
        u = str(item.get("url") or "")
        if not u.startswith("http"):
            continue
        snips = [str(c.get("snippet") or "") for c in item.get("claims") or [] if isinstance(c, dict)]
        evidence[u] = {"title": item.get("title") or "", "text": "\n".join(x for x in snips if x)}
    return {"citations": cites, "evidence": evidence}


async def build_report(company: str, website: str, progress: Progress) -> dict:
    s = get_settings()
    t0 = time.monotonic()
    box: dict = {}
    research_task: asyncio.Task | None = None
    if s.tinyfish_enable_research:
        research_task = asyncio.create_task(deep_research(company, progress, box))
        await progress("Deep research started in the background (up to 4 minutes)")

    specs = queries_for(company)
    await progress("Searching Reddit, AmbitionBox, Glassdoor, Blind, X, LinkedIn, news and the official site")
    results = await asyncio.gather(*[_search_platform(sp) for sp in specs], return_exceptions=True)
    raw = {sp["platform"]: (r if isinstance(r, list) else []) for sp, r in zip(specs, results)}
    official_host = infer_official_host(raw, company, website)
    hits = tag_hits(raw, company, official_host)
    ev = Evidence(company, official_host)
    for h in hits:
        ev.add(h["url"], platform=h["platform"], title=h.get("title", ""), snippet=h.get("snippet", ""))
    per = defaultdict(int)
    for h in hits:
        per[h["platform"]] += 1
    await progress("Found " + ", ".join(f"{PLATFORM_LABELS[p]} {per[p]}" for p in PLATFORMS + ["web"] if per.get(p)) if hits
                   else "Search returned no results")
    if not hits and not research_task:
        raise RuntimeError("No public results found for this company")

    # fetch the best readable pages (one batch) while an agent reads a reviews page
    targets = pick_fetch_urls(hits)
    fetch_map = {reddit_fetch_url(u): u for u in targets}
    agent_task: asyncio.Task | None = None
    agent_url = ""
    if tinyfish.agent_available() and not tinyfish._AGENT_SEM.locked():
        for pf in ("ambitionbox", "glassdoor"):
            cand = [h["url"] for h in hits if h["platform"] == pf and "review" in h["url"].lower()]
            if cand:
                agent_url = cand[0]
                break
        if agent_url:
            agent_task = asyncio.create_task(run_agent(agent_url, company, progress))
            await progress(f"Browsing agent reading {PLATFORM_LABELS[platform_for(agent_url)]} reviews")
    if targets:
        await progress(f"Reading {len(targets)} pages in full")
        fetched = await tinyfish.fetch(list(fetch_map), purpose="Read employee reviews / news about a company") or {}
        for furl, canon in fetch_map.items():
            d = ev.resolve(canon)
            if d is None:
                continue
            d["fetch_attempted"] = True
            item = fetched.get(furl) or fetched.get(canon)
            if not item:
                continue
            text = clean_text(item.get("text", ""))
            if item.get("final_url"):
                ev.alias(item["final_url"], d["id"])
            ev.alias(furl, d["id"])
            if readable(text):
                d["text"], d["readable"] = text[:20000], True
            elif len(text) >= 200 and not BOT_WALL.search(text):
                d["text"] = text[:4000]  # partial teaser (e.g. Blind's public post list): extra snippet evidence
            d.pop("_corpus", None)
        ok = [d for d in ev.docs.values() if d.get("readable")]
        walled = sorted({PLATFORM_LABELS[d["platform"]] for d in ev.docs.values() if d.get("fetch_attempted") and not d.get("readable")})
        await progress(f"Read {len(ok)} of {len(targets)} pages" + (f"; not readable: {', '.join(walled)} (snippets kept)" if walled else ""))

    if agent_task:
        res = await agent_task
        d = ev.resolve(agent_url)
        if res and str(res.get("status", "")).lower() == "ok" and d is not None and (res.get("pros") or res.get("cons") or res.get("sample_reviews")):
            d["agent_text"], d["agent_ok"] = agent_text(res), True
            d.pop("_corpus", None)
            await progress("Reviews agent returned ratings, pros/cons and sample reviews")
        else:
            await progress("Reviews agent could not read the page (blocked or empty); continuing without it")

    if research_task:
        remaining = RESEARCH_BUDGET_S - (time.monotonic() - t0)
        if not research_task.done() and remaining > 0:
            await progress(f"Waiting up to {int(remaining)}s for deep research")
            await asyncio.wait({research_task}, timeout=remaining)
        if research_task.done() and not research_task.cancelled() and research_task.exception() is None:
            rr = research_task.result()
            added = 0
            for u in rr["citations"] + list(rr["evidence"]):
                info = rr["evidence"].get(u) or {}
                d = ev.add(u, platform=platform_for(u, "", company, official_host), title=info.get("title", ""), kind="research")
                if d is not None and info.get("text"):
                    d["research_text"] = (d.get("research_text", "") + "\n" + info["text"]).strip()
                    d.pop("_corpus", None)
                    added += 1
            await progress(f"Deep research finished: merged {len(rr['citations'])} citations ({added} with snippets)")
        elif not research_task.done():
            await progress("Deep research still running; finishing the report without it")
            research_task.cancel()
            if box.get("run_id"):
                try:
                    await asyncio.wait_for(tinyfish.client().research.cancel(box["run_id"]), timeout=10)
                except Exception:  # noqa: BLE001
                    pass
        else:
            exc = None if research_task.cancelled() else research_task.exception()
            await progress(f"Deep research unavailable ({str(exc)[:120] or 'failed'}); continuing")

    payload = build_payload(ev, website or (f"https://{official_host}" if official_host else ""))
    if not payload["documents"]:
        raise RuntimeError("No usable public evidence found for this company")
    await progress(f"Organising {len(payload['documents'])} sources with Claude")
    raw_report = await organise_llm(payload)
    if raw_report is None:
        raise RuntimeError("Could not organise the evidence (model unavailable)")
    report, stats = validate_report(raw_report, ev, payload["website"])
    report["stats"] = {**stats, "elapsed_s": round(time.monotonic() - t0, 1), "documents": len(payload["documents"])}
    await progress(f"Checked every citation: kept {stats['kept_quotes']} quotes, dropped {stats['dropped_quotes']} not found in their source"
                   + (f" and {stats['dropped_urls']} with unknown URLs" if stats["dropped_urls"] else ""))
    return report


# ---------------------------------------------------------------- job runner
async def _emit(job_id: str, event: str, data: dict) -> None:
    b = company_buses.get(job_id)
    if b is not None:
        await b.emit(event, data)


async def _save(job_id: str, **fields: Any) -> None:
    async with SessionLocal() as db:
        row = await db.get(CompanyResearchRow, job_id)
        if row is None:
            return
        for k, v in fields.items():
            setattr(row, k, v)
        await db.commit()


async def _run(job_id: str, company: str, website: str) -> None:
    progress: list[dict] = []
    last_save = time.monotonic()

    async def add_progress(text: str) -> None:
        nonlocal last_save
        if progress and progress[-1]["text"] == text:
            return
        item = {"text": text, "at": utcnow().isoformat()}
        progress.append(item)
        del progress[:-MAX_PROGRESS]
        await _emit(job_id, "company.progress", item)
        if time.monotonic() - last_save > 5:
            last_save = time.monotonic()
            await _save(job_id, progress_json=list(progress))

    try:
        report = await asyncio.wait_for(build_report(company, website, add_progress), timeout=JOB_BUDGET_S)
        await _save(job_id, status="done", finished_at=utcnow(), report_json=report, progress_json=progress)
        await _emit(job_id, "company.done", {"report": report})
    except Exception as e:  # noqa: BLE001
        msg = "Company research timed out" if isinstance(e, asyncio.TimeoutError) else (str(e)[:300] or type(e).__name__)
        log.warning("company research %s failed: %s", job_id, msg)
        await _save(job_id, status="failed", finished_at=utcnow(), error=msg, progress_json=progress)
        await _emit(job_id, "company.error", {"message": msg})
    finally:
        await _emit(job_id, "done", {})
        JOBS.pop(job_id, None)


def _iso(d: datetime | None) -> str | None:
    return iso_utc(d) if d else None


def normalise_website(w: str | None) -> str:
    w = (w or "").strip()
    if not w:
        return ""
    if "//" not in w:
        w = "https://" + w
    h = host_of(w)
    if not h or "." not in h:
        raise HTTPException(422, "website must be a domain or http(s) URL")
    return f"https://{h}"


async def start_job(company: str, website: str, user_id: int | None, request: Request | None = None) -> dict:
    key = company.strip().lower()
    async with _lock:
        async with SessionLocal() as db:
            since = utcnow() - timedelta(hours=24)
            rows = (await db.execute(select(CompanyResearchRow).where(
                func.lower(CompanyResearchRow.company) == key, CompanyResearchRow.started_at >= since,
                CompanyResearchRow.status.in_(("done", "running"))).order_by(CompanyResearchRow.started_at.desc()))).scalars().all()
            for row in rows:
                if row.status == "done" or row.id in JOBS:
                    return {"id": row.id, "status": row.status}
                row.status, row.error, row.finished_at = "failed", "Interrupted by a restart", utcnow()  # stale running row
            await db.commit()
            if request is not None:
                _rate_limit(request)
            job_id = secrets.token_hex(8)
            db.add(CompanyResearchRow(id=job_id, user_id=user_id, company=company.strip()[:200], website=website,
                                      status="running", started_at=utcnow(), progress_json=[]))
            await db.commit()
        company_buses.create(job_id)
        JOBS[job_id] = asyncio.create_task(_run(job_id, company.strip(), website))
        return {"id": job_id, "status": "running"}


async def job_state(job_id: str) -> dict | None:
    async with SessionLocal() as db:
        row = await db.get(CompanyResearchRow, job_id)
    if row is None:
        return None
    progress = row.progress_json or []
    b = company_buses.get(job_id)
    if row.status == "running" and b is not None:
        progress = [d for ev, d in b.events if ev == "company.progress"][-MAX_PROGRESS:]
    out = {"id": row.id, "company": row.company, "website": row.website, "status": row.status,
           "started_at": _iso(row.started_at), "finished_at": _iso(row.finished_at), "progress": progress,
           "report": row.report_json}
    if row.status == "failed" and row.error:
        out["error"] = row.error
    return out


# ---------------------------------------------------------------- routes
_HITS: dict[str, list[float]] = {}


def _rate_limit(request: Request) -> None:
    """Company research is billed (search + fetch + agent + research): at most 3 new jobs per IP per hour."""
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    now = time.time()
    q = [t for t in _HITS.get(ip, []) if t > now - 3600]
    if len(q) >= 3:
        raise HTTPException(429, "Company research is limited to 3 new reports per hour. Please try again later.")
    q.append(now)
    _HITS[ip] = q


class CompanyIn(BaseModel):
    company: str = Field(min_length=2, max_length=120)
    website: str | None = Field(default=None, max_length=300)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.post("/api/company-research")
async def post_company_research(body: CompanyIn, request: Request, user: User | None = Depends(auth.optional_user)):
    company = re.sub(r"\s+", " ", body.company).strip()
    if len(company) < 2:
        raise HTTPException(422, "company is required")
    return await start_job(company, normalise_website(body.website), user.id if user else None, request)


@router.get("/api/company-research/sample")
async def get_sample():
    data = None
    try:
        data = json.loads(SAMPLE_PATH.read_text())
    except Exception:  # noqa: BLE001
        data = None
    name = ((data or {}).get("company") or "Zomato").lower()
    async with SessionLocal() as db:
        row = (await db.execute(select(CompanyResearchRow).where(
            func.lower(CompanyResearchRow.company) == name, CompanyResearchRow.status == "done")
            .order_by(CompanyResearchRow.started_at.desc()).limit(1))).scalar_one_or_none()
    if data and data.get("report"):
        return {**data, "status": "done", "sample": True, "live_id": row.id if row else None}
    if row is not None:
        return {"id": row.id, "company": row.company, "website": row.website, "status": "done", "progress": row.progress_json or [],
                "report": row.report_json, "sample": True, "live_id": row.id}
    raise HTTPException(404, "No sample report available")


@router.get("/api/company-research/{job_id}")
async def get_company_research(job_id: str):
    st = await job_state(job_id)
    if st is None:
        raise HTTPException(404, "Company research not found")
    return st


@router.get("/api/company-research/{job_id}/stream")
async def stream_company_research(job_id: str):
    b = company_buses.get(job_id)
    if b is not None:
        async def tail():
            async for ev, data in b.tail():
                yield ": ping\n\n" if ev == "ping" else _sse(ev, data)
        gen = tail()
    else:
        st = await job_state(job_id)
        if st is None:
            raise HTTPException(404, "Company research not found")

        async def replay():
            for p in st["progress"]:
                yield _sse("company.progress", p)
            if st["status"] == "done" and st["report"]:
                yield _sse("company.done", {"report": st["report"]})
            elif st["status"] == "failed":
                yield _sse("company.error", {"message": st.get("error") or "Company research failed"})
            yield _sse("done", {})
        gen = replay()
    return StreamingResponse(gen, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
