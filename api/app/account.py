"""Account routes a dashboard needs: stats, settings, API keys, export, delete, watches."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, delete, func, select
from sqlalchemy.orm import Mapped, mapped_column

from app.auth import required_user
from app.db.models import iso_utc, Base, Check, Feedback, Identifier, ResearchRow, SessionLocal, SignalRow, User, Watch, utcnow

router = APIRouter()

DEFAULT_PREFS = {"country": "IN", "language": "en", "deep_checks": True, "auto_research": False, "theme": "dark"}
DEFAULT_NOTIFS = {"final_verdict": True, "watch_triggered": True, "weekly_digest": False}


class UserSettings(Base):
    __tablename__ = "user_settings"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    notifications: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100), default="default")
    prefix: Mapped[str] = mapped_column(String(16))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


async def user_for_api_key(key: str) -> User | None:
    """Lets `Authorization: Bearer vk_...` act as the key's owner (used by auth.optional_user)."""
    async with SessionLocal() as db:
        row = (await db.execute(select(ApiKey).where(ApiKey.key_hash == _hash(key), ApiKey.revoked_at.is_(None)))).scalar_one_or_none()
        if not row:
            return None
        row.last_used_at = utcnow()
        await db.commit()
        return await db.get(User, row.user_id)


# ---------------------------------------------------------------- stats
@router.get("/api/me/stats")
async def my_stats(user: User = Depends(required_user)):
    since = datetime.now(timezone.utc) - timedelta(days=14)
    month = datetime.now(timezone.utc) - timedelta(days=30)
    async with SessionLocal() as db:
        total = (await db.execute(select(func.count()).select_from(Check).where(Check.user_id == user.id))).scalar_one()
        red = (await db.execute(select(func.count()).select_from(Check).where(Check.user_id == user.id, Check.band == "red"))).scalar_one()
        amber = (await db.execute(select(func.count()).select_from(Check).where(Check.user_id == user.id, Check.band == "amber"))).scalar_one()
        green = (await db.execute(select(func.count()).select_from(Check).where(Check.user_id == user.id, Check.band == "green"))).scalar_one()
        month_count = (await db.execute(select(func.count()).select_from(Check).where(Check.user_id == user.id, Check.created_at >= month))).scalar_one()
        avg_ms = (await db.execute(select(func.avg(Check.duration_ms)).where(Check.user_id == user.id, Check.duration_ms.is_not(None)))).scalar_one()
        research = (await db.execute(select(func.count()).select_from(ResearchRow).join(Check, Check.id == ResearchRow.check_id).where(Check.user_id == user.id))).scalar_one()
        watches = (await db.execute(select(func.count()).select_from(Watch).where(Watch.user_id == user.id, Watch.status == "active"))).scalar_one()
        agent_runs = (await db.execute(select(func.count()).select_from(SignalRow).join(Check, Check.id == SignalRow.check_id)
                                       .where(Check.user_id == user.id, SignalRow.code.in_(["S6", "S7", "S8"]), SignalRow.status.in_(["pass", "fail"])))).scalar_one()
        rows = (await db.execute(select(Check.created_at, Check.band).where(Check.user_id == user.id, Check.created_at >= since))).all()
        needs = (await db.execute(select(Check.id, Check.company_name, Check.score, Check.created_at).where(Check.user_id == user.id, Check.band == "amber")
                                  .where(~Check.id.in_(select(Feedback.check_id))).order_by(Check.created_at.desc()).limit(5))).all()
    days: dict[str, dict] = {}
    for i in range(14):
        d = (datetime.now(timezone.utc) - timedelta(days=13 - i)).date().isoformat()
        days[d] = {"date": d, "total": 0, "red": 0, "amber": 0, "green": 0}
    for created, band in rows:
        k = created.date().isoformat() if created else None
        if k in days:
            days[k]["total"] += 1
            if band in ("red", "amber", "green"):
                days[k][band] += 1
    return {"checks_total": total, "high_risk": red, "be_careful": amber, "likely_genuine": green, "checks_30d": month_count,
            "avg_duration_ms": int(avg_ms or 0), "research_runs": research, "active_watches": watches, "agent_runs": agent_runs,
            "daily": list(days.values()),
            "needs_you": [{"check_id": i, "company_name": c or "Unknown company", "score": s, "created_at": iso_utc(t)} for i, c, s, t in needs],
            "plan": {"name": "Free", "checks_limit": 200, "research_limit": 20, "watches_limit": 5}}


# ---------------------------------------------------------------- settings
class SettingsIn(BaseModel):
    preferences: dict | None = None
    notifications: dict | None = None


def _settings_out(row: UserSettings | None) -> dict:
    prefs = {**DEFAULT_PREFS, **((row.preferences if row else None) or {})}
    notifs = {**DEFAULT_NOTIFS, **((row.notifications if row else None) or {})}
    return {"preferences": prefs, "notifications": notifs, "updated_at": iso_utc(row.updated_at) if row and row.updated_at else None}


@router.get("/api/me/settings")
async def get_settings_route(user: User = Depends(required_user)):
    async with SessionLocal() as db:
        return _settings_out(await db.get(UserSettings, user.id))


@router.put("/api/me/settings")
async def put_settings(body: SettingsIn, user: User = Depends(required_user)):
    async with SessionLocal() as db:
        row = await db.get(UserSettings, user.id)
        if row is None:
            row = UserSettings(user_id=user.id, preferences={}, notifications={})
            db.add(row)
        if body.preferences is not None:
            row.preferences = {**(row.preferences or {}), **{k: v for k, v in body.preferences.items() if k in DEFAULT_PREFS}}
        if body.notifications is not None:
            row.notifications = {**(row.notifications or {}), **{k: bool(v) for k, v in body.notifications.items() if k in DEFAULT_NOTIFS}}
        row.updated_at = utcnow()
        await db.commit()
        return _settings_out(row)


# ---------------------------------------------------------------- api keys
class KeyIn(BaseModel):
    name: str = "default"


def _key_out(k: ApiKey) -> dict:
    return {"id": k.id, "name": k.name, "prefix": k.prefix, "created_at": iso_utc(k.created_at),
            "last_used_at": iso_utc(k.last_used_at), "revoked": k.revoked_at is not None}


@router.get("/api/me/apikeys")
async def list_keys(user: User = Depends(required_user)):
    async with SessionLocal() as db:
        rows = (await db.execute(select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc()))).scalars().all()
        return {"items": [_key_out(k) for k in rows]}


@router.post("/api/me/apikeys")
async def create_key(body: KeyIn, user: User = Depends(required_user)):
    raw = "vk_" + secrets.token_urlsafe(32)
    async with SessionLocal() as db:
        active = (await db.execute(select(func.count()).select_from(ApiKey).where(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None)))).scalar_one()
        if active >= 5:
            raise HTTPException(400, "Maximum of 5 active keys")
        row = ApiKey(user_id=user.id, name=body.name[:100] or "default", prefix=raw[:10], key_hash=_hash(raw))
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return {**_key_out(row), "key": raw}


@router.delete("/api/me/apikeys/{key_id}")
async def revoke_key(key_id: int, user: User = Depends(required_user)):
    async with SessionLocal() as db:
        row = await db.get(ApiKey, key_id)
        if not row or row.user_id != user.id:
            raise HTTPException(404, "Key not found")
        row.revoked_at = utcnow()
        await db.commit()
        return {"ok": True}


# ---------------------------------------------------------------- watches / export / delete
@router.get("/api/me/watches")
async def my_watches(user: User = Depends(required_user)):
    async with SessionLocal() as db:
        rows = (await db.execute(select(Watch, Check.company_name).join(Check, Check.id == Watch.check_id)
                                 .where(Watch.user_id == user.id).order_by(Watch.created_at.desc()))).all()
        return {"items": [{"id": w.id, "check_id": w.check_id, "company_name": c or "", "url": w.url, "role": w.role, "status": w.status,
                           "monitor_id": w.monitor_id, "message": w.message, "created_at": iso_utc(w.created_at)} for w, c in rows]}


@router.get("/api/me/export")
async def export_me(user: User = Depends(required_user)):
    async with SessionLocal() as db:
        checks = (await db.execute(select(Check).where(Check.user_id == user.id).order_by(Check.created_at.desc()))).scalars().all()
        settings_row = await db.get(UserSettings, user.id)
        return {"user": {"id": user.id, "email": user.email, "name": user.name}, "settings": _settings_out(settings_row),
                "checks": [{"check_id": c.id, "status": c.status, "company_name": c.company_name, "score": c.score, "band": c.band,
                            "verdict": c.verdict, "explanation": c.explanation, "created_at": iso_utc(c.created_at)} for c in checks]}


@router.delete("/api/me")
async def delete_me(user: User = Depends(required_user)):
    async with SessionLocal() as db:
        ids = [r for (r,) in (await db.execute(select(Check.id).where(Check.user_id == user.id))).all()]
        if ids:
            await db.execute(delete(SignalRow).where(SignalRow.check_id.in_(ids)))
            await db.execute(delete(Identifier).where(Identifier.check_id.in_(ids)))
            await db.execute(delete(Feedback).where(Feedback.check_id.in_(ids)))
            await db.execute(delete(ResearchRow).where(ResearchRow.check_id.in_(ids)))
            await db.execute(delete(Watch).where(Watch.check_id.in_(ids)))
            await db.execute(delete(Check).where(Check.id.in_(ids)))
        await db.execute(delete(ApiKey).where(ApiKey.user_id == user.id))
        await db.execute(delete(UserSettings).where(UserSettings.user_id == user.id))
        await db.execute(delete(User).where(User.id == user.id))
        await db.commit()
        return {"ok": True, "deleted_checks": len(ids)}
