"""TinyFish Monitor (beta): watch the official careers page for the offered role."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from app import auth
from app.clients import tinyfish
from app.config import get_settings
from app.db.models import SessionLocal, User, Watch
from app.research import careers_url_from_snapshot, get_snapshot

log = logging.getLogger("vouch.monitor")
router = APIRouter()
NOT_ENABLED = "Monitor not enabled for this account"


@router.post("/api/checks/{check_id}/watch")
async def watch(check_id: str, user: User = Depends(auth.required_user)):
    s = get_settings()
    snap = await get_snapshot(check_id)
    if snap is None:
        raise HTTPException(404, "Check not found")
    if not s.tinyfish_enable_monitor:
        return {"ok": False, "monitor_id": None, "message": NOT_ENABLED}
    async with SessionLocal() as db:
        existing = (await db.execute(select(Watch).where(Watch.check_id == check_id, Watch.user_id == user.id,
                                                         Watch.monitor_id.is_not(None)))).scalars().first()
    if existing:
        return {"ok": True, "monitor_id": existing.monitor_id, "message": existing.message or f"Already watching {existing.url}"}

    url = careers_url_from_snapshot(snap)
    role = ((snap.get("extraction") or {}).get("role_title") or "").strip()
    company = ((snap.get("extraction") or {}).get("company_name") or "").strip()
    if not url:
        return {"ok": False, "monitor_id": None, "message": "No official careers page found for this check"}
    purpose = (f"Alert when a role titled '{role}' appears or disappears on this careers page."
               if role else "Alert when job openings are added or removed on this careers page.")
    status, monitor_id, msg = await tinyfish.monitor_create(
        url, purpose, name=f"Vouch: {company or url} {role}".strip(), webhook_url=s.tinyfish_monitor_webhook_url or None)
    if monitor_id is None:
        message = (NOT_ENABLED if status in (403, 404) else "TinyFish credits exhausted" if status == 402
                   else "Could not create the watch right now")
        return {"ok": False, "monitor_id": None, "message": message}
    message = f"Watching {url} daily for '{role or 'openings'}'."
    async with SessionLocal() as db:
        db.add(Watch(check_id=check_id, user_id=user.id, monitor_id=monitor_id, url=url[:2000], role=role[:300], message=message))
        await db.commit()
    return {"ok": True, "monitor_id": monitor_id, "message": message}
