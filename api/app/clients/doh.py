import asyncio
import logging

from app.clients.cache import cache
from app.clients.http import http

log = logging.getLogger("vouch.doh")
DOH = "https://cloudflare-dns.com/dns-query"


async def _q(domain: str, rtype: str) -> list[str] | None:
    try:
        r = await asyncio.wait_for(
            http().get(DOH, params={"name": domain, "type": rtype}, headers={"accept": "application/dns-json"}), timeout=6)
        r.raise_for_status()
        d = r.json()
        if d.get("Status") == 3:  # NXDOMAIN
            return []
        return [a.get("data", "") for a in d.get("Answer", []) or []]
    except Exception as e:  # noqa: BLE001
        log.info("doh %s %s failed: %s", rtype, domain, type(e).__name__)
        return None


async def records(domain: str) -> dict | None:
    k = cache.key("dns", domain)
    hit = cache.get(k)
    if hit is not None:
        return hit
    mx, a = await asyncio.gather(_q(domain, "MX"), _q(domain, "A"))
    if mx is None and a is None:
        return None
    out = {"domain": domain, "mx": mx or [], "a": a or [], "url": f"{DOH}?name={domain}&type=MX"}
    cache.set(k, out, 6 * 3600)
    return out
