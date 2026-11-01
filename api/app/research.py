"""TinyFish Research: on-demand deep dossier for a check (minutes, not seconds).

POST /api/checks/{id}/research starts once (idempotent), GET returns status + report,
GET /api/checks/{id}/research/stream replays research events then tails until done.
Research events also go to the main check stream while it is still open (never `done` there)."""
import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app import auth
from app.clients import tinyfish
from app.config import get_settings
from app.db.models import Check, ResearchRow, SessionLocal, SignalRow, User
from app.events import BusRegistry, buses
from app.preview import extract_preview

log = logging.getLogger("vouch.research")
router = APIRouter()
research_buses = BusRegistry()
JOBS: dict[str, asyncio.Task] = {}
PREVIEWS: dict[str, str] = {}  # check_id -> latest live-view URL seen in research events (if any)
_lock = asyncio.Lock()
MAX_PROGRESS = 200
URL_RE = re.compile(r"https?://[^\s)\]>\"'<,]+")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime | None) -> str | None:
    if d is None:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.isoformat()


# ---------------------------------------------------------------- check snapshot helpers
async def get_snapshot(check_id: str) -> dict | None:
    """Live run snapshot if in memory, else the persisted one. Adds `official_domain` when known."""
    from app.pipeline.orchestrator import RUNS

    run = RUNS.get(check_id)
    if run is not None:
        snap = run.snapshot()
        snap["official_domain"] = getattr(run, "official_domain", "") or official_from_signals(snap.get("signals") or [])
        return snap
    async with SessionLocal() as db:
        c = await db.get(Check, check_id)
        if c is None:
            return None
        sigs = (await db.execute(select(SignalRow).where(SignalRow.check_id == check_id))).scalars().all()
    signals = [s.data for s in sigs]
    return {"check_id": c.id, "status": c.status, "extraction": c.extraction, "signals": signals,
            "verdict": c.verdict, "official_domain": official_from_signals(signals)}


def _host(url: str) -> str:
    m = re.match(r"https?://([^/:?#]+)", url or "")
    return (m.group(1).lower() if m else "").removeprefix("www.")


def official_from_signals(signals: list[dict]) -> str:
    for s in signals:
        for e in s.get("evidence") or []:
            if str(e.get("title", "")).startswith("Official site:"):
                return str(e["title"]).split(":", 1)[1].strip()
    return ""


def careers_url_from_snapshot(snap: dict) -> str:
    for s in snap.get("signals") or []:
        if s.get("code") == "S8":
            for e in s.get("evidence") or []:
                if e.get("url"):
                    return e["url"]
    off = snap.get("official_domain") or ""
    return f"https://{off}/careers" if off else ""


def build_query(snap: dict) -> str:
    e = snap.get("extraction") or {}
    company = (e.get("company_name") or "").strip() or "the company named in this message"
    role = (e.get("role_title") or "").strip()
    official = (snap.get("official_domain") or "").strip()
    claimed = (e.get("claimed_official_domain") or "").strip()
    sender_domains = sorted({m.rsplit("@", 1)[1].lower() for m in e.get("sender_emails") or [] if "@" in m})
    phones = e.get("sender_phones_masked") or []
    parts = [f"Is a job offer from {company}" + (f" for the role '{role}'" if role else "") + " genuine?"]
    ctx = []
    if e.get("location"):
        ctx.append(f"location {e['location']}")
    if sender_domains:
        ctx.append(f"sent from email domain {', '.join(sender_domains[:3])}")
    if phones:
        ctx.append(f"contact phone {phones[0]}")
    if claimed:
        ctx.append(f"the message links to {claimed}")
    if official and official != claimed:
        ctx.append(f"the company's official site appears to be {official}")
    if ctx:
        parts.append("Context: " + "; ".join(ctx) + ".")
    parts.append("Find the company's official website, its company registry status (e.g. MCA / ROC in India), "
                 "recent scam or fraud reports about it or its recruiters, and whether this role is advertised on "
                 "the official careers page or reputable job boards. State clearly whether the sender domain belongs "
                 "to the company. Cite URLs for every claim.")
    return " ".join(parts)[:1800]


# ---------------------------------------------------------------- normalisation
def _clean(text: str) -> str:
    text = re.sub(r"\[(\d+)\]", "", text or "")
    text = re.sub(r"\*\*|__|`", "", text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def _first_paragraph(md: str) -> str:
    fallback = ""
    for block in re.split(r"\n\s*\n", md or ""):
        b = block.strip()
        if not b or b.startswith("#") or b.startswith("|") or b.startswith("---"):
            # skip heading-only blocks; but keep text after a heading line
            lines = [ln for ln in b.splitlines() if ln.strip() and not ln.strip().startswith("#")]
            b = "\n".join(lines).strip()
            if not b or b.startswith("|"):
                continue
        txt = _clean(re.sub(r"^\s*[-*]\s+", "", b, flags=re.M))
        if len(txt) < 40 or ("|" in txt and len(txt) < 120):  # title/date lines like "Decision Memo | Prepared ..."
            fallback = fallback or txt
            continue
        return txt[:900]
    return fallback[:900]


def _refs(text: str, citations: list[str], allowed: set[str]) -> list[str]:
    out: list[str] = []
    for m in re.finditer(r"\[(\d+)\]", text or ""):
        i = int(m.group(1)) - 1
        if 0 <= i < len(citations) and citations[i] in allowed:
            out.append(citations[i])
    for u in URL_RE.findall(text or ""):
        u = u.rstrip(".;:")
        if u in allowed:
            out.append(u)
    return list(dict.fromkeys(out))


SKIP_SECTIONS = re.compile(r"^(summary|executive summary|overview|sources|references|citations|bibliography|conclusion|verdict|bottom line|tl;?dr)\b", re.I)


def normalise(detail: dict[str, Any]) -> dict:
    """ResearchRunDetail (as dict) -> {summary, findings:[{title, detail, sources:[url]}], sources:[{title, url}]}.
    Every URL in the output comes from the research output (citations, evidence, or URLs in the report text)."""
    deep = detail.get("deep_result") or {}
    quick = detail.get("quick_result") or {}
    report_md = deep.get("result") or ""
    citations = [c for c in (deep.get("citations") or []) if isinstance(c, str) and c.startswith("http")]
    evidence = [ev for ev in (detail.get("evidence") or []) if isinstance(ev, dict) and str(ev.get("url", "")).startswith("http")]
    titles = {ev["url"]: (ev.get("title") or "").strip() for ev in evidence}
    allowed = set(citations) | set(titles) | {u for u in (quick.get("citations") or []) if isinstance(u, str) and u.startswith("http")}
    allowed |= {u.rstrip(".;:") for u in URL_RE.findall(report_md)}

    summary = _first_paragraph(report_md) or _clean(quick.get("answer") or detail.get("quick_result_summary") or "")[:900]

    findings: list[dict] = []
    sections = re.split(r"^#{2,4}\s+(.+)$", report_md, flags=re.M)
    # sections = [preamble, title1, body1, title2, body2, ...]
    for i in range(1, len(sections) - 1, 2):
        title, body = _clean(sections[i]).strip(" :"), sections[i + 1]
        if not title or SKIP_SECTIONS.match(title):
            continue
        detail_txt = _first_paragraph(body) or _clean(body)[:600]
        if not detail_txt:
            continue
        findings.append({"title": title[:160], "detail": detail_txt[:700], "sources": _refs(body, citations, allowed)[:5]})
    if len(findings) < 2:
        rank = {"primary": 0, "secondary": 1, "low": 2}
        conf = {"high": 0, "medium": 1, "low": 2}
        seen: set[str] = set()
        claims = []
        for ev in evidence:
            for c in ev.get("claims") or []:
                claims.append((conf.get(c.get("confidence", "low"), 2), rank.get(ev.get("source_quality", "low"), 2), ev["url"], c))
        for _, _, url, c in sorted(claims, key=lambda t: (t[0], t[1])):
            key = (c.get("claim") or "").strip().lower()[:120]
            if not key or key in seen:
                continue
            seen.add(key)
            findings.append({"title": _clean(c["claim"])[:160], "detail": _clean(c.get("snippet") or c["claim"])[:700], "sources": [url]})
            if len(findings) >= 8:
                break
    findings = findings[:10]

    order = list(dict.fromkeys(citations + [u for f in findings for u in f["sources"]] + list(titles)))
    sources = [{"title": titles.get(u) or _host(u), "url": u} for u in order if u in allowed][:30]
    if not summary and findings:
        summary = findings[0]["detail"][:400]
    return {"summary": summary, "findings": findings, "sources": sources,
            "termination_reason": deep.get("termination_reason"), "research_run_id": detail.get("research_run_id")}


# ---------------------------------------------------------------- progress text
def describe(ev: Any) -> str | None:
    """Human line for a research progress event; None to skip (heartbeats, token deltas)."""
    name = getattr(ev, "event", "")
    if name in ("heartbeat", "synthesis_delta", "session", "evidence_snapshot", "run_stats", "synthesis_discarded"):
        return None
    d = {k: v for k, v in (ev.model_dump() if hasattr(ev, "model_dump") else dict(ev)).items() if k != "event"}

    def pick(*keys: str) -> Any:
        for k in keys:
            v = d.get(k)
            if v:
                return v
            data = d.get("data") if isinstance(d.get("data"), dict) else {}
            if data.get(k):
                return data[k]
        return None

    if name == "run_status":
        st = pick("status")
        return f"Research {str(st).lower()}" if st else None
    if name == "plan_updated":
        subs = pick("subquestions") or []
        summ = pick("summary")
        if subs and isinstance(subs, list):
            qs = [s.get("question", "") if isinstance(s, dict) else str(s) for s in subs][:3]
            return f"Planned {len(subs)} questions: " + "; ".join(q for q in qs if q)[:200]
        return f"Plan: {str(summ)[:200]}" if summ else "Planning research"
    if name == "sources_searching":
        q = pick("queries", "query")
        if isinstance(q, list):
            q = "; ".join(map(str, q[:3]))
        return f"Searching the web: {str(q)[:200]}" if q else "Searching the web"
    if name == "sources_searched":
        n = pick("count", "result_count", "num_results", "results")
        if isinstance(n, list):
            n = len(n)
        return f"Found {n} candidate sources" if n else "Search results in"
    if name in ("sources_fetching", "source_fetched", "site_mapped"):
        u = pick("url", "title", "domain")
        if isinstance(u, list):
            u = ", ".join(map(str, u[:3]))
        verb = {"sources_fetching": "Reading", "source_fetched": "Read", "site_mapped": "Mapped site"}[name]
        return f"{verb} {str(u)[:200]}" if u else None
    if name == "agent_run_started":
        u = pick("url", "goal")
        return f"Browsing {str(u)[:200]}" if u else "Started a browsing agent"
    if name == "agent_run_completed":
        return "Browsing agent finished"
    if name == "partial_summary":
        t = pick("summary", "text", "content")
        return f"Interim: {_clean(str(t))[:240]}" if t else None
    if name in ("plan_awaiting_approval", "plan_review_resolved"):
        return None
    t = pick("message", "text", "summary")
    return f"{name.replace('_', ' ')}: {str(t)[:200]}" if t else None


# ---------------------------------------------------------------- runner
async def _emit(check_id: str, event: str, data: dict) -> None:
    rb = research_buses.get(check_id)
    if rb is not None:
        await rb.emit(event, data)
    if event != "done":
        mb = buses.get(check_id)
        if mb is not None and not mb.closed:
            await mb.emit(event, data)


async def _save(check_id: str, **fields: Any) -> None:
    async with SessionLocal() as db:
        row = await db.get(ResearchRow, check_id)
        if row is None:
            return
        for k, v in fields.items():
            setattr(row, k, v)
        await db.commit()


async def _wait_for_extraction(check_id: str, snap: dict, limit_s: float = 30) -> dict:
    t0 = time.monotonic()
    while not (snap.get("extraction") or {}).get("company_name") and snap.get("status") == "running" and time.monotonic() - t0 < limit_s:
        await asyncio.sleep(2)
        snap = await get_snapshot(check_id) or snap
    return snap


async def _run(check_id: str, snap: dict, resume_run_id: str | None = None) -> None:
    s = get_settings()
    progress: list[dict] = []
    run_id = resume_run_id or ""
    final: dict | None = None
    err: str | None = None
    last_save = time.monotonic()

    async def add_progress(text: str) -> None:
        nonlocal last_save
        item = {"at": utcnow().isoformat(), "text": text}
        progress.append(item)
        del progress[:-MAX_PROGRESS]
        payload = {"text": text, "at": item["at"]}
        if PREVIEWS.get(check_id):
            payload["preview_url"] = PREVIEWS[check_id]
        await _emit(check_id, "research.progress", payload)
        if time.monotonic() - last_save > 5:
            last_save = time.monotonic()
            await _save(check_id, progress_json=list(progress))

    async def body() -> None:
        nonlocal run_id, final, err
        if not resume_run_id:
            snap2 = await _wait_for_extraction(check_id, snap)
            query = build_query(snap2)
            await add_progress("Starting TinyFish Research (deep)")
            stream = tinyfish.client().research.stream(query=query, mode=s.tinyfish_research_mode)  # type: ignore[arg-type]
        else:
            await add_progress("Reconnecting to research run")
            stream = tinyfish.client().research.events(resume_run_id)
        async with stream as st:
            async for ev in st:
                name = getattr(ev, "event", "")
                pv = extract_preview(ev)
                if pv:
                    PREVIEWS[check_id] = pv
                if name == "created":
                    run_id = ev.research_run_id
                    await _save(check_id, research_run_id=run_id)
                elif name == "final_result":
                    final = {"result": ev.result, "citations": list(ev.citations or []),
                             "termination_reason": getattr(ev, "termination_reason", None)}
                elif name == "error":
                    err = getattr(ev, "message", "Research failed")
                elif name == "done":
                    break
                else:
                    text = describe(ev)
                    if text and (not progress or progress[-1]["text"] != text):
                        await add_progress(text)

    try:
        await asyncio.wait_for(body(), timeout=s.tinyfish_research_timeout_s)
        detail: dict[str, Any] = {}
        if run_id:
            try:
                detail = (await tinyfish.client().research.get(run_id)).model_dump(mode="json")
            except Exception as e:  # noqa: BLE001
                log.warning("research get failed: %s", str(e)[:200])
        if final and not (detail.get("deep_result") or {}).get("result"):
            detail["deep_result"] = final
        status = str(detail.get("status", "")).upper()
        report = normalise(detail) if (detail.get("deep_result") or {}).get("result") or detail.get("evidence") else None
        if report and (report["summary"] or report["findings"]):
            await _save(check_id, status="done", finished_at=utcnow(), report_json=report, progress_json=progress)
            await _emit(check_id, "research.done", {"report": report})
        else:
            msg = err or (detail.get("error") or {}).get("message") or f"Research ended without a report ({status or 'no status'})"
            raise RuntimeError(msg)
    except Exception as e:  # noqa: BLE001
        timed_out = isinstance(e, asyncio.TimeoutError)
        msg = "Research timed out after 8 minutes" if timed_out else str(e)[:300] or type(e).__name__
        log.warning("research %s failed: %s", check_id, msg)
        if timed_out and run_id:
            try:
                await tinyfish.client().research.cancel(run_id)
            except Exception:  # noqa: BLE001
                pass
        await _save(check_id, status="failed", finished_at=utcnow(), error=msg, progress_json=progress)
        await _emit(check_id, "research.error", {"message": msg})
    finally:
        await _emit(check_id, "done", {})
        JOBS.pop(check_id, None)


def _spawn(check_id: str, snap: dict, resume_run_id: str | None = None) -> None:
    rb = research_buses.get(check_id)
    if rb is None or rb.closed:
        research_buses.create(check_id)
    JOBS[check_id] = asyncio.create_task(_run(check_id, snap, resume_run_id))


async def start_research(check_id: str, run_snapshot: dict) -> str:
    """Idempotent: starts once; returns current status. A failed run may be restarted."""
    async with _lock:
        async with SessionLocal() as db:
            row = await db.get(ResearchRow, check_id)
            if row is not None and row.status == "done":
                return "done"
            if row is not None and row.status == "running":
                if check_id in JOBS:
                    return "running"
                # process restarted mid-run: reconnect if we have the run id, else restart
                if row.research_run_id:
                    _spawn(check_id, run_snapshot, row.research_run_id)
                    return "running"
            if row is None:
                db.add(ResearchRow(check_id=check_id, status="running", started_at=utcnow(), progress_json=[]))
            else:
                row.status, row.started_at, row.finished_at, row.report_json, row.error = "running", utcnow(), None, None, ""
                row.progress_json, row.research_run_id = [], ""
            await db.commit()
        _spawn(check_id, run_snapshot)
        return "running"


async def research_state(check_id: str) -> dict:
    async with SessionLocal() as db:
        row = await db.get(ResearchRow, check_id)
    if row is None:
        return {"status": "idle", "started_at": None, "finished_at": None, "progress": [], "report": None}
    progress = row.progress_json or []
    rb = research_buses.get(check_id)
    if row.status == "running" and rb is not None:  # fresher than the DB copy
        progress = [{"at": d.get("at"), "text": d.get("text")} for ev, d in rb.events if ev == "research.progress"][-MAX_PROGRESS:]
    out = {"status": row.status, "started_at": _iso(row.started_at), "finished_at": _iso(row.finished_at),
           "progress": progress, "report": row.report_json,
           "preview_url": PREVIEWS.get(check_id) if row.status == "running" else None}
    if row.status == "failed" and row.error:
        out["error"] = row.error
    return out


# ---------------------------------------------------------------- routes
def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@router.post("/api/checks/{check_id}/research")
async def post_research(check_id: str, user: User | None = Depends(auth.optional_user)):
    if not get_settings().tinyfish_enable_research:
        raise HTTPException(503, "Research is disabled")
    snap = await get_snapshot(check_id)
    if snap is None:
        raise HTTPException(404, "Check not found")
    return {"status": await start_research(check_id, snap)}


@router.get("/api/checks/{check_id}/research")
async def get_research(check_id: str):
    if await get_snapshot(check_id) is None:
        raise HTTPException(404, "Check not found")
    return await research_state(check_id)


@router.get("/api/checks/{check_id}/research/stream")
async def stream_research(check_id: str):
    rb = research_buses.get(check_id)
    if rb is not None:
        async def tail():
            async for ev, data in rb.tail():
                yield ": ping\n\n" if ev == "ping" else _sse(ev, data)
        gen = tail()
    else:
        st = await research_state(check_id)
        if st["status"] == "idle" and await get_snapshot(check_id) is None:
            raise HTTPException(404, "Check not found")

        async def replay():
            for p in st["progress"]:
                yield _sse("research.progress", p)
            if st["status"] == "done" and st["report"]:
                yield _sse("research.done", {"report": st["report"]})
            elif st["status"] == "failed":
                yield _sse("research.error", {"message": st.get("error") or "Research failed"})
            yield _sse("done", {})
        gen = replay()
    return StreamingResponse(gen, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
