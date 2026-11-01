import asyncio
import logging

from app.clients.http import http

log = logging.getLogger("vouch.urlhaus")


async def check_url(url: str) -> dict | None:
    """Returns {url, listed: bool, threat, reference}; None on failure."""
    try:
        r = await asyncio.wait_for(http().post("https://urlhaus-api.abuse.ch/v1/url/", data={"url": url}), timeout=5)
        if r.status_code in (401, 403):
            return None
        r.raise_for_status()
        d = r.json()
        qs = d.get("query_status")
        if qs == "ok":
            return {"url": url, "listed": True, "threat": d.get("threat", ""), "reference": d.get("urlhaus_reference", "")}
        if qs == "no_results":
            return {"url": url, "listed": False, "threat": "", "reference": ""}
        return None
    except Exception as e:  # noqa: BLE001
        log.info("urlhaus failed: %s", type(e).__name__)
        return None
