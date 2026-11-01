"""TinyFish Search / Fetch / Agent wrappers. Never raise: return None/[] on failure."""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from tinyfish import AsyncTinyFish, BrowserProfile, CompleteEvent, ProgressEvent, ProxyConfig

from app.clients.cache import cache
from app.config import get_settings

log = logging.getLogger("vouch.tinyfish")
_client: AsyncTinyFish | None = None

# health flags used for the "limited" verdict flag
state = {"search_ok": None, "fetch_ok": None}


def client() -> AsyncTinyFish:
    global _client
    if _client is None:
        _client = AsyncTinyFish(api_key=get_settings().tinyfish_api_key, timeout=150, max_retries=2)
    return _client


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def search(query: str, *, purpose: str | None = None, domain_type: str | None = None,
                 recency_minutes: int | None = None) -> list[dict] | None:
    """Returns list of {position, site_name, title, url, snippet, fetched_at}; None on failure."""
    s = get_settings()
    k = cache.key("search", query, domain_type or "", str(recency_minutes or ""))
    hit = cache.get(k)
    if hit is not None:
        return hit
    try:
        res = await asyncio.wait_for(
            client().search.query(query, purpose=purpose, location="IN", language="en",
                                  domain_type=domain_type, recency_minutes=recency_minutes),
            timeout=s.tinyfish_search_timeout_s,
        )
        out = [{"position": r.position, "site_name": r.site_name or "", "title": r.title or "",
                "url": r.url, "snippet": (r.snippet or "")[:400], "fetched_at": now_iso()}
               for r in (res.results or []) if r.url]
        cache.set(k, out, 3600)
        state["search_ok"] = True
        return out
    except Exception as e:  # noqa: BLE001
        log.warning("tinyfish search failed: %s: %s", type(e).__name__, str(e)[:200])
        state["search_ok"] = False
        return None


async def fetch(urls: list[str], *, purpose: str | None = None, ttl: int | None = None) -> dict[str, dict] | None:
    """Returns {requested_url: {url, final_url, title, text, fetched_at}}; None on total failure."""
    s = get_settings()
    urls = list(dict.fromkeys(u for u in urls if u))[:10]
    if not urls:
        return {}
    out: dict[str, dict] = {}
    todo = []
    for u in urls:
        hit = cache.get(cache.key("fetch", u))
        if hit is not None:
            out[u] = hit
        else:
            todo.append(u)
    if not todo:
        return out
    try:
        res = await asyncio.wait_for(
            client().fetch.get_contents(urls=todo, format="markdown", purpose=purpose, ttl=ttl,
                                        per_url_timeout_ms=int(s.tinyfish_fetch_timeout_s * 1000) - 2000),
            timeout=s.tinyfish_fetch_timeout_s,
        )
        for r in res.results or []:
            item = {"url": r.url, "final_url": r.final_url or r.url, "title": r.title or "",
                    "text": (r.text or "")[:20000], "fetched_at": now_iso()}
            out[r.url] = item
            cache.set(cache.key("fetch", r.url), item, 3600)
        for e in res.errors or []:
            log.info("fetch url error %s: %s", e.url, str(e.error)[:120])
        state["fetch_ok"] = True
        return out
    except Exception as e:  # noqa: BLE001
        log.warning("tinyfish fetch failed: %s: %s", type(e).__name__, str(e)[:200])
        state["fetch_ok"] = False
        return out or None


class CircuitBreaker:
    def __init__(self, threshold: int = 3, cooldown_s: float = 600):
        self.threshold, self.cooldown_s = threshold, cooldown_s
        self.failures = 0
        self.open_until = 0.0

    def allow(self) -> bool:
        return time.monotonic() >= self.open_until

    def record(self, ok: bool) -> None:
        if ok:
            self.failures = 0
            return
        self.failures += 1
        if self.failures >= self.threshold:
            self.open_until = time.monotonic() + self.cooldown_s
            self.failures = 0


breaker = CircuitBreaker()
BAD_MARKERS = ("captcha", "blocked", "access denied", "forbidden", "cloudflare", "robot")


def agent_available() -> bool:
    return get_settings().tinyfish_enable_agent and breaker.allow()


def _parse_result(raw: Any) -> dict | None:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            v = json.loads(raw)
            return v if isinstance(v, dict) else {"value": v}
        except Exception:  # noqa: BLE001
            return {"page_text": raw}
    return {"value": raw}


async def agent_run(url: str, goal: str, on_progress: Callable[[str], Awaitable[None]] | None = None,
                    cache_key: str | None = None, cache_ttl: float = 86400) -> dict | None:
    """Runs a streaming agent. Returns parsed result_json dict with a normalised 'status', or None (unknown)."""
    s = get_settings()
    if not agent_available():
        return None
    if cache_key:
        hit = cache.get(cache_key)
        if hit is not None:
            return hit

    async def _run() -> dict | None:
        result = None
        async with client().agent.stream(
            url=url, goal=goal, browser_profile=BrowserProfile.STEALTH,
            proxy_config=ProxyConfig(enabled=True, country_code="IN"),
        ) as stream:
            async for event in stream:
                if isinstance(event, ProgressEvent) and on_progress and event.purpose:
                    try:
                        await on_progress(event.purpose[:240])
                    except Exception:  # noqa: BLE001
                        pass
                elif isinstance(event, CompleteEvent):
                    status = str(getattr(event.status, "value", event.status)).upper()
                    if status != "COMPLETED":
                        log.info("agent run not completed: %s %s", status, getattr(event.error, "message", ""))
                        return None
                    result = _parse_result(event.result_json)
        return result

    try:
        result = await asyncio.wait_for(_run(), timeout=s.tinyfish_agent_timeout_s)
    except Exception as e:  # noqa: BLE001
        log.warning("agent failed: %s: %s", type(e).__name__, str(e)[:200])
        breaker.record(False)
        return None
    if not result:
        breaker.record(False)
        return None
    st = str(result.get("status", "")).lower()
    blob = json.dumps(result).lower()
    if st in ("captcha", "error", "blocked") or (st not in ("found", "not_found", "ok") and any(m in blob for m in BAD_MARKERS)):
        result["status"] = "unknown"
        breaker.record(True)  # service worked; site blocked us
        return result
    breaker.record(True)
    if cache_key:
        cache.set(cache_key, result, cache_ttl)
    return result
