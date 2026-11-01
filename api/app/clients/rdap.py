import asyncio
import logging
from datetime import datetime, timezone

from app.clients.cache import cache
from app.clients.http import http

log = logging.getLogger("vouch.rdap")


async def lookup(domain: str) -> dict | None:
    """Returns {domain, registered_at (iso|None), age_days, registrar, status[], url}; None on failure."""
    k = cache.key("rdap", domain)
    hit = cache.get(k)
    if hit is not None:
        return hit
    url = f"https://rdap.org/domain/{domain}"
    try:
        r = await asyncio.wait_for(http().get(url, headers={"accept": "application/rdap+json"}), timeout=8)
        if r.status_code == 404:
            out = {"domain": domain, "registered_at": None, "age_days": None, "registrar": "", "status": [], "url": url, "not_found": True}
            cache.set(k, out, 3600)
            return out
        r.raise_for_status()
        d = r.json()
        reg = None
        for ev in d.get("events", []):
            if ev.get("eventAction") == "registration":
                reg = ev.get("eventDate")
        registrar = ""
        for ent in d.get("entities", []):
            if "registrar" in (ent.get("roles") or []):
                for item in (ent.get("vcardArray") or [None, []])[1]:
                    if item and item[0] == "fn":
                        registrar = item[3]
        age = None
        if reg:
            try:
                dt = datetime.fromisoformat(reg.replace("Z", "+00:00"))
                age = (datetime.now(timezone.utc) - dt).days
            except ValueError:
                pass
        out = {"domain": domain, "registered_at": reg, "age_days": age, "registrar": registrar,
               "status": d.get("status", []), "url": url, "not_found": False}
        cache.set(k, out, 86400)
        return out
    except Exception as e:  # noqa: BLE001
        log.info("rdap failed for %s: %s", domain, type(e).__name__)
        return None
