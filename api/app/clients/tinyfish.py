"""TinyFish Search / Fetch / Agent wrappers. Never raise: return None/[] on failure."""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from tinyfish import AsyncTinyFish, BrowserProfile, CompleteEvent, ProgressEvent, ProxyConfig, StreamingUrlEvent

from app.clients.cache import cache
from app.config import get_settings
from app.preview import extract_preview

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


_SEARCH_SEM = asyncio.Semaphore(4)


async def search(query: str, *, purpose: str | None = None, domain_type: str | None = None,
                 recency_minutes: int | None = None) -> list[dict] | None:
    """Rate-limit friendly: at most 4 concurrent searches per process; one retry after a short pause when the first attempt fails."""
    async with _SEARCH_SEM:
        res = await _search_once(query, purpose=purpose, domain_type=domain_type, recency_minutes=recency_minutes)
        if res is None:
            await asyncio.sleep(1.5)
            res = await _search_once(query, purpose=purpose, domain_type=domain_type, recency_minutes=recency_minutes)
        return res


async def _search_once(query: str, *, purpose: str | None = None, domain_type: str | None = None,
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


class _Breakers:
    """One breaker per target site, so a captcha-heavy government portal cannot switch off agent reads of job boards."""
    def __init__(self):
        self._by: dict[str, CircuitBreaker] = {}

    def for_url(self, url: str) -> CircuitBreaker:
        host = (url or "").split("//")[-1].split("/")[0].lower()
        host = ".".join(host.split(".")[-2:]) if host else "default"
        return self._by.setdefault(host, CircuitBreaker(threshold=5, cooldown_s=300))

    def allow(self) -> bool:  # global view: open only if every known breaker is open
        return not self._by or any(b.allow() for b in self._by.values())


breakers = _Breakers()
_AGENT_SEM = asyncio.Semaphore(2)  # the TinyFish plan allows 2 concurrent agent runs; queueing beyond that gets rejected
breaker = breakers.for_url("default")
BAD_MARKERS = ("captcha", "blocked", "access denied", "forbidden", "cloudflare", "robot")


def agent_available() -> bool:
    return get_settings().tinyfish_enable_agent and breakers.allow()


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
                    cache_key: str | None = None, cache_ttl: float = 86400,
                    on_preview: Callable[[str], Awaitable[None]] | None = None) -> dict | None:
    """Runs a streaming agent. Returns parsed result_json dict with a normalised 'status', or None (unknown)."""
    s = get_settings()
    if not get_settings().tinyfish_enable_agent:
        return None
    breaker = breakers.for_url(url)
    if not breaker.allow():
        log.info("agent breaker open for %s", url)
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
                elif isinstance(event, StreamingUrlEvent) and on_preview:
                    try:
                        pv = extract_preview(event)
                        if pv:
                            await on_preview(pv)
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
        async with _AGENT_SEM:
            result = await asyncio.wait_for(_run(), timeout=s.tinyfish_agent_timeout_s)
    except Exception as e:  # noqa: BLE001
        log.warning("agent failed: %s: %s", type(e).__name__, str(e)[:200])
        if "Too many pending" not in str(e):
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


# ---------------------------------------------------------------- v2: Highlights / Monitor / Browser / probes
highlights_state = {"forbidden": False}


async def fetch_highlights(urls: list[str], query: str, *, max_snippets: int = 5,
                           max_characters: int | None = 2000) -> dict[str, dict] | None:
    """Fetch with query-ranked highlights (beta). Returns {requested_url: {url, final_url, title, highlights:[{text, rank}], fetched_at}}.
    None when disabled, after a 403 (module flag stops further attempts), or on failure."""
    from tinyfish import PermissionDeniedError

    s = get_settings()
    urls = list(dict.fromkeys(u for u in urls if u))[:10]
    if not s.tinyfish_highlights_enabled or highlights_state["forbidden"] or not urls or not (query or "").strip():
        return None
    try:
        res = await asyncio.wait_for(
            client().fetch.get_contents(urls=urls, format="markdown",
                                        highlights={"query": query.strip()[:500], "max_snippets": max_snippets,
                                                    "max_characters": max_characters},
                                        per_url_timeout_ms=int(s.tinyfish_fetch_timeout_s * 1000) - 2000),
            timeout=s.tinyfish_fetch_timeout_s,
        )
    except PermissionDeniedError as e:
        log.info("highlights not enabled for this account (403); disabling: %s", str(e)[:120])
        highlights_state["forbidden"] = True
        return None
    except Exception as e:  # noqa: BLE001
        status = getattr(e, "status_code", None)
        if status == 403:
            highlights_state["forbidden"] = True
        log.warning("tinyfish highlights failed: %s: %s", type(e).__name__, str(e)[:200])
        return None
    out: dict[str, dict] = {}
    for r in res.results or []:
        out[r.url] = {"url": r.url, "final_url": r.final_url or r.url, "title": r.title or "",
                      "highlights": [{"text": h.text, "rank": h.rank} for h in (r.highlights or [])],
                      "fetched_at": now_iso()}
    return out


def _status_of(e: Exception) -> int | None:
    st = getattr(e, "status_code", None)
    if st is None:
        resp = getattr(e, "response", None)
        st = getattr(resp, "status_code", None)
    return st


async def monitor_create(url: str, purpose: str, *, name: str | None = None,
                         webhook_url: str | None = None) -> tuple[int, str | None, str]:
    """Create a fetch Monitor on `url`. Returns (http_status, monitor_id|None, message). Never raises."""
    s = get_settings()
    try:
        res = await asyncio.wait_for(
            client().monitors.create("fetch", {"url": url, "format": "markdown"}, s.tinyfish_monitor_cron,
                                     name=(name or "")[:120] or None, webhook_url=webhook_url, purpose=purpose[:500]),
            timeout=60,
        )
        return 200, res.monitor.id, f"Watching {url} ({res.monitor.status})"
    except Exception as e:  # noqa: BLE001
        st = _status_of(e) or 0
        log.warning("monitor create failed: %s %s: %s", st, type(e).__name__, str(e)[:200])
        return st, None, str(e)[:200]


async def browser_session_create(url: str | None = None, timeout_seconds: int = 60) -> dict | None:
    """POST https://api.browser.tinyfish.ai -> {session_id, cdp_url, base_url}. None on failure."""
    from app.clients.http import http

    s = get_settings()
    body: dict[str, Any] = {"timeout_seconds": timeout_seconds}
    if url:
        body["url"] = url
    try:
        r = await http().post(s.tinyfish_browser_api, json=body, headers={"X-API-Key": s.tinyfish_api_key}, timeout=40)
        if r.status_code >= 300:
            log.warning("browser create HTTP %s: %s", r.status_code, r.text[:200])
            return None
        return r.json()
    except Exception as e:  # noqa: BLE001
        log.warning("browser create failed: %s: %s", type(e).__name__, str(e)[:200])
        return None


async def browser_session_close(session_id: str) -> bool:
    """DELETE https://api.browser.tinyfish.ai/{session_id} -> 204 (idempotent)."""
    from app.clients.http import http

    s = get_settings()
    try:
        r = await http().delete(f"{s.tinyfish_browser_api.rstrip('/')}/{session_id}",
                                headers={"X-API-Key": s.tinyfish_api_key}, timeout=15)
        return r.status_code < 300 or r.status_code == 404
    except Exception as e:  # noqa: BLE001
        log.warning("browser close failed: %s: %s", type(e).__name__, str(e)[:200])
        return False


_probe_cache: dict[str, tuple[float, Any]] = {}
PROBE_TTL_S = 600


async def _probe_get(path: str) -> int:
    from app.clients.http import http

    s = get_settings()
    try:
        r = await http().get(f"https://agent.tinyfish.ai{path}", headers={"X-API-Key": s.tinyfish_api_key}, timeout=8)
        return r.status_code
    except Exception:  # noqa: BLE001
        return 0


def _flag(status: int) -> bool | str:
    if 200 <= status < 300:
        return True
    if status in (402, 403):
        return "beta"
    return False


async def products() -> dict[str, bool | str]:
    """Cheap availability probe for every TinyFish product; cached 10 min."""
    s = get_settings()
    hit = _probe_cache.get("products")
    if hit and time.monotonic() - hit[0] < PROBE_TTL_S:
        return hit[1]
    mon, res = await asyncio.gather(_probe_get("/v1/monitors"), _probe_get("/v1/research-run?limit=1"))
    key_ok = res not in (401, 0) or mon not in (401, 0)
    out: dict[str, bool | str] = {
        "search": state["search_ok"] is not False and key_ok,
        "fetch": state["fetch_ok"] is not False and key_ok,
        "agent": bool(s.tinyfish_enable_agent and breakers.allow() and key_ok),
        "research": _flag(res) if s.tinyfish_enable_research else False,
        "browser": bool(s.tinyfish_enable_browser and key_ok),
        "monitor": _flag(mon) if s.tinyfish_enable_monitor else False,
        "highlights": "beta" if highlights_state["forbidden"] else bool(s.tinyfish_highlights_enabled),
    }
    _probe_cache["products"] = (time.monotonic(), out)
    return out
