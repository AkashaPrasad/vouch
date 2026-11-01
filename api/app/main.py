import asyncio
import json
import logging
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, text as sql_text

from app import account, auth, monitor, research, screenshots, watches
from app import company_research
from app.clients import tinyfish
from app.clients.http import close_http
from app.config import get_settings
from app.db.models import iso_utc, Check, Feedback, Identifier, SessionLocal, SignalRow, User, init_db
from app.events import buses
from app.logging_setup import setup_logging
from app.pipeline import extract as ex
from app.pipeline.orchestrator import RUNS, CheckRun, run_check

setup_logging()
log = logging.getLogger("vouch.api")
settings = get_settings()
TASKS: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    screenshots.shot_dir()
    scheduler = asyncio.create_task(watches.scheduler_loop())  # in-process fallback when TinyFish Monitor is unavailable
    yield
    scheduler.cancel()
    await close_http()


app = FastAPI(title="Vouch API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origin_regex=r'https://[a-z0-9-]+\.vouch-web\.pages\.dev', allow_origins=settings.cors_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth.router)
app.include_router(research.router)
app.include_router(screenshots.router)
app.include_router(monitor.router)
app.include_router(account.router)
app.include_router(watches.router)
app.include_router(company_research.router)

_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(request: Request) -> None:
    ip = (request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
          or (request.client.host if request.client else "?"))
    now = time.monotonic()
    q = _hits[ip]
    while q and q[0] < now - settings.rate_limit_window_s:
        q.popleft()
    if len(q) >= settings.rate_limit_checks:
        raise HTTPException(429, "Too many checks. Please wait a few minutes.")
    q.append(now)


class CheckIn(BaseModel):
    text: str | None = Field(default=None, max_length=20000)
    url: str | None = Field(default=None, max_length=2000)
    channel: str = "web"

    @model_validator(mode="after")
    def need_one(self):
        if not (self.text or "").strip() and not (self.url or "").strip():
            raise ValueError("Provide text or url")
        return self


def mask_company(name: str) -> str:
    return name if name else "Unknown company"


async def persist(run: CheckRun) -> None:
    async with SessionLocal() as db:
        c = await db.get(Check, run.check_id)
        if c is None:
            return
        c.status, c.extraction, c.verdict, c.explanation = run.status, run.public_extraction, run.verdict, run.explanation
        c.company_name = (run.extraction.get("company_name") or "")[:300]
        c.score = run.verdict["score"] if run.verdict else None
        c.band = run.verdict["band"] if run.verdict else None
        c.duration_ms = run.duration_ms
        for s in run.public_signals():
            db.add(SignalRow(check_id=run.check_id, code=s["code"], status=s["status"], weight_applied=s["weight_applied"], data=s))
        e = run.extraction
        for p in e.get("sender_phones", []):
            db.add(Identifier(check_id=run.check_id, kind="phone", value_hash=ex.sha(p), display_masked=ex.mask_phone(p)))
        for m in e.get("sender_emails", []):
            db.add(Identifier(check_id=run.check_id, kind="email", value_hash=ex.sha(m), display_masked=ex.mask_email(m)))
        for u in e.get("upi_ids", []):
            db.add(Identifier(check_id=run.check_id, kind="upi", value_hash=ex.sha(u), display_masked=ex.mask_upi(u)))
        await db.commit()


@app.post("/api/checks")
async def create_check(body: CheckIn, request: Request, user: User | None = Depends(auth.optional_user)):
    rate_limit(request)
    check_id = secrets.token_hex(8)
    async with SessionLocal() as db:
        db.add(Check(id=check_id, user_id=user.id if user else None, channel=body.channel or "web",
                     input_kind="url" if body.url and not body.text else "text"))
        await db.commit()
    bus = buses.create(check_id)
    run = CheckRun(check_id, bus, body.text or "", (body.url or "").strip() or None)
    RUNS[check_id] = run
    if len(RUNS) > 300:
        for k in [k for k, r in RUNS.items() if r.status == "done"][:100]:
            RUNS.pop(k, None)
    task = asyncio.create_task(run_check(run, persist))
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)
    return {"check_id": check_id}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


@app.get("/api/checks/{check_id}/stream")
async def stream_check(check_id: str):
    bus = buses.get(check_id)
    if bus is None:
        snap = await _load_snapshot(check_id)
        if snap is None:
            raise HTTPException(404, "Check not found")

        async def replay():
            yield _sse("check.created", {"check_id": check_id, "created_at": snap["created_at"]})
            if snap["extraction"]:
                yield _sse("extraction.done", snap["extraction"])
            for s in snap["signals"]:
                yield _sse("signal.update", s)
            if snap["verdict"]:
                yield _sse("verdict.final", {"verdict": snap["verdict"], "explanation": snap["explanation"]})
            yield _sse("done", {})
        gen = replay()
    else:
        async def tail():
            async for ev, data in bus.tail():
                if ev == "ping":
                    yield ": ping\n\n"
                else:
                    yield _sse(ev, data)
        gen = tail()
    return StreamingResponse(gen, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


async def _load_snapshot(check_id: str) -> dict | None:
    async with SessionLocal() as db:
        c = await db.get(Check, check_id)
        if c is None:
            return None
        sigs = (await db.execute(select(SignalRow).where(SignalRow.check_id == check_id))).scalars().all()
    order = {f"S{i}": i for i in range(1, 13)}
    return {"check_id": c.id, "status": c.status, "created_at": iso_utc(c.created_at),
            "duration_ms": c.duration_ms, "extraction": c.extraction,
            "signals": sorted([s.data for s in sigs], key=lambda d: order.get(d["code"], 99)),
            "verdict": c.verdict, "explanation": c.explanation}


@app.get("/api/checks/{check_id}")
async def get_check(check_id: str):
    run = RUNS.get(check_id)
    if run is not None:
        return run.snapshot()
    snap = await _load_snapshot(check_id)
    if snap is None:
        raise HTTPException(404, "Check not found")
    return snap


class FeedbackIn(BaseModel):
    correct: bool
    note: str | None = Field(default=None, max_length=2000)


@app.post("/api/checks/{check_id}/feedback")
async def feedback(check_id: str, body: FeedbackIn):
    async with SessionLocal() as db:
        if await db.get(Check, check_id) is None:
            raise HTTPException(404, "Check not found")
        db.add(Feedback(check_id=check_id, correct=body.correct, note=body.note or ""))
        await db.commit()
    return {"ok": True}


@app.get("/api/recent")
async def recent():
    async with SessionLocal() as db:
        rows = (await db.execute(select(Check).where(Check.status == "done").order_by(Check.created_at.desc()).limit(20))).scalars().all()
    return {"items": [{"check_id": c.id, "company_name": mask_company(c.company_name), "band": c.band, "score": c.score,
                       "created_at": iso_utc(c.created_at)} for c in rows]}


@app.get("/healthz")
async def healthz():
    db_ok = True
    try:
        async with SessionLocal() as db:
            await db.execute(sql_text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_ok = False
    return {"ok": db_ok, "db": db_ok, "tinyfish_key_present": bool(settings.tinyfish_api_key),
            "anthropic_key_present": bool(settings.anthropic_api_key), "agent_enabled": settings.tinyfish_enable_agent,
            "products": await tinyfish.products()}
