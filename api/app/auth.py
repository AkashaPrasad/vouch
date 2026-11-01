import asyncio
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, Header, HTTPException
from google.auth.transport import requests as g_requests
from google.oauth2 import id_token
from pydantic import BaseModel
from sqlalchemy import func, select

from app.config import get_settings
from app.db.models import Check, SessionLocal, User

router = APIRouter()


class GoogleIn(BaseModel):
    credential: str


def mint(user: User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user.id), "email": user.email, "iat": now, "exp": now + timedelta(days=7)}, s.secret_key, algorithm="HS256")


def user_dict(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "picture": u.picture}


async def optional_user(authorization: str | None = Header(default=None)) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    if token.startswith("vk_"):
        from app.account import user_for_api_key
        return await user_for_api_key(token)
    try:
        claims = jwt.decode(authorization[7:].strip(), get_settings().secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    async with SessionLocal() as db:
        return await db.get(User, int(claims["sub"]))


async def required_user(user: User | None = Depends(optional_user)) -> User:
    if user is None:
        raise HTTPException(401, "Sign in required")
    return user


@router.post("/api/auth/google")
async def google_login(body: GoogleIn):
    s = get_settings()
    try:
        info = await asyncio.to_thread(id_token.verify_oauth2_token, body.credential, g_requests.Request(), s.google_client_id)
    except Exception:  # noqa: BLE001
        raise HTTPException(401, "Invalid Google credential")
    async with SessionLocal() as db:
        u = (await db.execute(select(User).where(User.google_sub == info["sub"]))).scalar_one_or_none()
        if u is None:
            u = User(google_sub=info["sub"], email=info.get("email", ""), name=info.get("name", ""), picture=info.get("picture", ""))
            db.add(u)
        else:
            u.email, u.name, u.picture = info.get("email", u.email), info.get("name", u.name), info.get("picture", u.picture)
        await db.commit()
        await db.refresh(u)
    return {"token": mint(u), "user": user_dict(u)}


@router.get("/api/me")
async def me(user: User = Depends(required_user)):
    async with SessionLocal() as db:
        n = (await db.execute(select(func.count()).select_from(Check).where(Check.user_id == user.id))).scalar_one()
    return {**user_dict(user), "checks_count": n}


@router.get("/api/me/checks")
async def my_checks(user: User = Depends(required_user)):
    async with SessionLocal() as db:
        rows = (await db.execute(select(Check).where(Check.user_id == user.id).order_by(Check.created_at.desc()).limit(50))).scalars().all()
    return {"items": [{"check_id": c.id, "company_name": c.company_name or "Unknown company", "band": c.band, "score": c.score,
                       "created_at": c.created_at.isoformat() if c.created_at else None, "status": c.status} for c in rows]}
