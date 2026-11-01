"""Claude Haiku: extraction (tool use) + explanation (streamed). Never raise."""
import asyncio
import json
import logging
from pathlib import Path
from typing import Awaitable, Callable

import anthropic

from app.config import get_settings

log = logging.getLogger("vouch.haiku")
PROMPTS = Path(__file__).resolve().parent.parent / "prompts"
_client: anthropic.AsyncAnthropic | None = None
state = {"ok": None}

EXTRACT_TOOL = {
    "name": "record_extraction",
    "description": "Record the structured facts extracted from a job/internship offer message.",
    "input_schema": {
        "type": "object",
        "properties": {
            "company_name": {"type": "string"},
            "claimed_official_domain": {"type": "string", "description": "Domain of the company's official website if stated or obvious, else empty"},
            "role_title": {"type": "string"},
            "location": {"type": "string"},
            "salary_text": {"type": "string"},
            "sender_emails": {"type": "array", "items": {"type": "string"}},
            "sender_phones": {"type": "array", "items": {"type": "string"}},
            "upi_ids": {"type": "array", "items": {"type": "string"}},
            "urls": {"type": "array", "items": {"type": "string"}},
            "money_requested": {"type": "object", "properties": {
                "asked": {"type": "boolean"}, "amount": {"type": "string"}, "purpose": {"type": "string"}},
                "required": ["asked"]},
            "contact_channels": {"type": "array", "items": {"type": "string", "description": "email|whatsapp|telegram|google_form|phone|website|other"}},
            "urgency_phrases": {"type": "array", "items": {"type": "string"}},
            "interview_claimed": {"type": "boolean", "description": "true if the message mentions an interview/assessment took place or will take place"},
            "unrealistic_pay": {"type": "boolean"},
            "red_flag_quotes": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["company_name", "money_requested", "interview_claimed"],
    },
}


def client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        s = get_settings()
        _client = anthropic.AsyncAnthropic(api_key=s.anthropic_api_key, timeout=s.anthropic_timeout_s, max_retries=2)
    return _client


async def _create(**kw):
    try:
        return await client().messages.create(**kw)
    except anthropic.BadRequestError as e:
        if "temperature" in str(e).lower() and "temperature" in kw:
            kw.pop("temperature")
            return await client().messages.create(**kw)
        raise


async def extract(text: str) -> dict | None:
    s = get_settings()
    system = (PROMPTS / "extract.md").read_text()
    try:
        msg = await asyncio.wait_for(_create(
            model=s.anthropic_model, max_tokens=1200, system=system,
            tools=[EXTRACT_TOOL], tool_choice={"type": "tool", "name": "record_extraction"},
            messages=[{"role": "user", "content": f"<offer_message>\n{text[:12000]}\n</offer_message>"}],
        ), timeout=s.anthropic_timeout_s)
        for block in msg.content:
            if block.type == "tool_use":
                state["ok"] = True
                return dict(block.input)
        return None
    except Exception as e:  # noqa: BLE001
        log.warning("haiku extract failed: %s: %s", type(e).__name__, str(e)[:200])
        state["ok"] = False
        return None


DELIM = "===JSON==="


async def explain(payload: dict, on_token: Callable[[str], Awaitable[None]] | None = None) -> dict | None:
    """Streams the plain-text summary (before DELIM) via on_token, then parses JSON after DELIM."""
    s = get_settings()
    system = (PROMPTS / "explain.md").read_text()
    buf = ""
    sent = 0

    async def _run():
        nonlocal buf, sent
        async with client().messages.stream(
            model=s.anthropic_model, max_tokens=1200, system=system,
            messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)[:20000]}],
        ) as stream:
            async for t in stream.text_stream:
                buf += t
                if on_token:
                    idx = buf.find(DELIM)
                    limit = idx if idx >= 0 else max(sent, len(buf) - len(DELIM))
                    if limit > sent:
                        chunk = buf[sent:limit]
                        sent = limit
                        await on_token(chunk)

    try:
        await asyncio.wait_for(_run(), timeout=s.anthropic_timeout_s + 5)
    except anthropic.BadRequestError as e:
        log.warning("haiku explain bad request: %s", str(e)[:200])
        state["ok"] = False
        return None
    except Exception as e:  # noqa: BLE001
        log.warning("haiku explain failed: %s: %s", type(e).__name__, str(e)[:200])
        state["ok"] = False
        if DELIM not in buf:
            return None
    summary, _, rest = buf.partition(DELIM)
    try:
        start, end = rest.find("{"), rest.rfind("}")
        data = json.loads(rest[start:end + 1])
    except Exception:  # noqa: BLE001
        log.warning("haiku explain JSON parse failed")
        return None
    data["summary"] = summary.strip()
    state["ok"] = True
    return data
