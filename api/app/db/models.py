from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import get_settings


def iso_utc(dt):
    """ISO-8601 with an explicit UTC offset; SQLite hands back naive datetimes, which browsers would read as local time."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    google_sub: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320))
    name: Mapped[str] = mapped_column(String(200), default="")
    picture: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Check(Base):
    __tablename__ = "checks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    channel: Mapped[str] = mapped_column(String(16), default="web")
    status: Mapped[str] = mapped_column(String(16), default="running")
    input_kind: Mapped[str] = mapped_column(String(16), default="text")
    company_name: Mapped[str] = mapped_column(String(300), default="")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    band: Mapped[str | None] = mapped_column(String(8), nullable=True)
    extraction: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    verdict: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    explanation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class SignalRow(Base):
    __tablename__ = "signals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), index=True)
    code: Mapped[str] = mapped_column(String(4))
    status: Mapped[str] = mapped_column(String(8))
    weight_applied: Mapped[int] = mapped_column(Integer, default=0)
    data: Mapped[dict] = mapped_column(JSON)


class Identifier(Base):
    __tablename__ = "identifiers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), index=True)
    kind: Mapped[str] = mapped_column(String(16))  # phone|email|upi|domain|url
    value_hash: Mapped[str] = mapped_column(String(64), index=True)
    display_masked: Mapped[str] = mapped_column(String(200))


class Feedback(Base):
    __tablename__ = "feedback"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), index=True)
    correct: Mapped[bool] = mapped_column(Boolean)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ResearchRow(Base):
    __tablename__ = "research"
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), default="running")  # running|done|failed
    research_run_id: Mapped[str] = mapped_column(String(80), default="")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    report_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    progress_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str] = mapped_column(Text, default="")


class Screenshot(Base):
    __tablename__ = "screenshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    check_id: Mapped[str] = mapped_column(String(32), index=True)
    signal: Mapped[str] = mapped_column(String(8))
    url: Mapped[str] = mapped_column(String(2000))
    file: Mapped[str] = mapped_column(String(200))
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Watch(Base):
    __tablename__ = "watches"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    check_id: Mapped[str] = mapped_column(ForeignKey("checks.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    monitor_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    url: Mapped[str] = mapped_column(String(2000))
    role: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(16), default="active")
    message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------- v3: company watches + resume match
class Resume(Base):
    __tablename__ = "resumes"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    text: Mapped[str] = mapped_column(Text, default="")
    summary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JobPreference(Base):
    """Primary matching input: chosen fields/roles plus free text, parsed by Claude into `parsed_json`."""
    __tablename__ = "job_preferences"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    fields_json: Mapped[list] = mapped_column(JSON, default=list)
    roles_json: Mapped[list] = mapped_column(JSON, default=list)
    free_text: Mapped[str] = mapped_column(Text, default="")
    parsed_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {titles, skills, locations, seniority, remote, exclude}
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CompanyWatch(Base):
    __tablename__ = "company_watches"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    company_name: Mapped[str] = mapped_column(String(300), default="")
    source_url: Mapped[str] = mapped_column(String(2000))
    source_kind: Mapped[str] = mapped_column(String(24), default="careers")  # careers|ats|linkedin_public|linkedin_session|other
    cadence: Mapped[str] = mapped_column(String(16), default="daily")  # daily|twice_daily|hourly
    monitor_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|paused|error
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    postings_count: Mapped[int] = mapped_column(Integer, default=0)
    new_last_run: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WatchSnapshot(Base):
    __tablename__ = "watch_snapshots"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    watch_id: Mapped[int] = mapped_column(ForeignKey("company_watches.id"), index=True)
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    postings_json: Mapped[list] = mapped_column(JSON, default=list)
    match_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # fingerprint -> {score, reasons, missing}
    method: Mapped[str] = mapped_column(String(16), default="fetch")  # fetch|agent


class WatchAlert(Base):
    __tablename__ = "watch_alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    watch_id: Mapped[int] = mapped_column(ForeignKey("company_watches.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    posting_json: Mapped[dict] = mapped_column(JSON)
    match_score: Mapped[int] = mapped_column(Integer, default=0)
    match_reasons_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {reasons:[], missing:[]}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class UserConnection(Base):
    """LinkedIn browser-context profile (TinyFish profiles). Separate table so no ALTER on `users` is needed."""
    __tablename__ = "user_connections"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    linkedin_profile_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    linkedin_session_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    linkedin_status: Mapped[str] = mapped_column(String(16), default="none")  # none|pending|connected|unavailable|error
    message: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


engine = create_async_engine(get_settings().database_url, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
