"""TinyFish Browser: visual receipts. Creates a TinyFish remote browser session, connects over CDP with
Playwright (no local browser binary needed), screenshots the page, and always deletes the session."""
import asyncio
import logging
import re
import secrets
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.clients import tinyfish
from app.config import get_settings
from app.db.models import Screenshot, SessionLocal

log = logging.getLogger("vouch.screenshots")
router = APIRouter()
FILE_RE = re.compile(r"^[A-Za-z0-9_-]{1,120}$")


def shot_dir() -> Path:
    p = Path(get_settings().screenshot_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def _drive(cdp_url: str, url: str, nav_timeout_ms: int) -> bytes:
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(cdp_url, timeout=20000)
        try:
            ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
            page = ctx.pages[0] if ctx.pages else await ctx.new_page()
            await page.set_viewport_size({"width": 1280, "height": 800})
            await page.goto(url, wait_until="domcontentloaded", timeout=nav_timeout_ms)
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:  # noqa: BLE001
                pass
            return await page.screenshot(type="png", full_page=False, timeout=15000)
        finally:
            try:
                await browser.close()
            except Exception:  # noqa: BLE001
                pass


async def capture(check_id: str, signal: str, url: str) -> dict | None:
    """Screenshot `url` in a TinyFish browser; saves PNG + DB row. Returns item dict or None. Never raises."""
    s = get_settings()
    if not s.tinyfish_enable_browser or not re.match(r"^https?://", url or ""):
        return None
    t0 = time.monotonic()
    budget = s.tinyfish_browser_budget_s
    sess = await tinyfish.browser_session_create(timeout_seconds=int(budget) + 30)
    if not sess or not sess.get("cdp_url"):
        return None
    try:
        remaining = max(5.0, budget - (time.monotonic() - t0))
        png = await asyncio.wait_for(_drive(sess["cdp_url"], url, int(min(30, remaining - 3) * 1000)), timeout=remaining)
    except Exception as e:  # noqa: BLE001
        log.warning("screenshot %s %s failed: %s: %s", signal, url, type(e).__name__, str(e)[:200])
        return None
    finally:
        await tinyfish.browser_session_close(sess.get("session_id", ""))
    if not png:
        return None
    name = f"{check_id}_{re.sub(r'[^A-Za-z0-9]', '', signal)[:8]}_{secrets.token_hex(4)}"
    path = shot_dir() / f"{name}.png"
    await asyncio.to_thread(path.write_bytes, png)
    async with SessionLocal() as db:
        row = Screenshot(check_id=check_id, signal=signal, url=url[:2000], file=name, bytes=len(png))
        db.add(row)
        await db.commit()
        await db.refresh(row)
    log.info("screenshot %s %s -> %s (%d bytes, %.1fs)", signal, url, name, len(png), time.monotonic() - t0)
    return {"signal": signal, "url": url, "file": name, "bytes": len(png), "taken_at": row.taken_at.isoformat()}


async def capture_for_check(check_id: str, targets: list[tuple[str, str]]) -> list[dict]:
    """Fire-and-forget hook for the orchestrator: targets = [(signal_code, url), ...]. Never raises."""
    if not get_settings().tinyfish_enable_browser:
        return []
    seen: set[str] = set()
    jobs = []
    for sig, url in targets[:4]:
        if url and url not in seen:
            seen.add(url)
            jobs.append(capture(check_id, sig, url))
    try:
        res = await asyncio.gather(*jobs, return_exceptions=True)
    except Exception:  # noqa: BLE001
        return []
    return [r for r in res if isinstance(r, dict)]


@router.get("/api/checks/{check_id}/screenshots")
async def list_screenshots(check_id: str, request: Request):
    async with SessionLocal() as db:
        rows = (await db.execute(select(Screenshot).where(Screenshot.check_id == check_id).order_by(Screenshot.taken_at))).scalars().all()
    base = str(request.base_url).rstrip("/")
    return {"items": [{"signal": r.signal, "url": r.url, "image_url": f"{base}/api/screenshots/{r.file}.png",
                       "taken_at": r.taken_at.isoformat() if r.taken_at else None} for r in rows]}


@router.get("/api/screenshots/{file}.png")
async def get_screenshot(file: str):
    if not FILE_RE.match(file):
        raise HTTPException(404, "Not found")
    path = shot_dir() / f"{file}.png"
    if not path.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})
