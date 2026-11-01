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
            "listing_unavailable": {"type": "boolean", "description": "true when the fetched page is not a single job posting (expired, search results, login wall)"},
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


JUDGE_TOOL = {
    "name": "record_judgement",
    "description": "Record the reasoned second opinion on the verification evidence.",
    "input_schema": {
        "type": "object",
        "properties": {
            "band": {"type": "string", "enum": ["green", "amber", "red"]},
            "score": {"type": "integer", "minimum": 0, "maximum": 100},
            "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
            "reasoning": {"type": "string"},
            "misreads": {"type": "array", "items": {"type": "object", "properties": {"signal": {"type": "string"}, "reason": {"type": "string"}}, "required": ["signal", "reason"]}},
            "verified_facts": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["band", "score", "confidence", "reasoning", "misreads", "verified_facts"],
    },
}


async def judge(payload: dict) -> dict | None:
    """Reasoned second opinion over all evidence. Uses the model's adaptive thinking when the SDK allows it. Never raises."""
    s = get_settings()
    system = (PROMPTS / "judge.md").read_text()
    content = json.dumps(payload, ensure_ascii=False)[:60000]
    kwargs = dict(model=s.anthropic_model, max_tokens=2000, system=system,
                  tools=[JUDGE_TOOL], tool_choice={"type": "tool", "name": "record_judgement"},
                  messages=[{"role": "user", "content": content}])

    async def _call(with_thinking: bool):
        extra = {"thinking": {"type": "adaptive"}} if with_thinking else {}
        return await client().messages.create(**kwargs, **extra)

    try:
        try:
            resp = await asyncio.wait_for(_call(True), timeout=max(s.anthropic_timeout_s, 25))
        except (TypeError, anthropic.BadRequestError):
            resp = await asyncio.wait_for(_call(False), timeout=max(s.anthropic_timeout_s, 25))
        for block in resp.content:
            if getattr(block, "type", "") == "tool_use" and block.name == "record_judgement":
                out = dict(block.input)
                out["score"] = max(0, min(100, int(out.get("score", 50))))
                out["misreads"] = [m for m in (out.get("misreads") or []) if isinstance(m, dict) and m.get("signal")][:6]
                out["verified_facts"] = [str(f) for f in (out.get("verified_facts") or [])][:8]
                state["ok"] = True
                return out
    except Exception as e:  # noqa: BLE001
        log.warning("haiku judge failed: %s: %s", type(e).__name__, str(e)[:200])
    return None


async def tool_call(tool: dict, system: str, content, *, max_tokens: int = 1200, timeout_s: float | None = None) -> dict | None:
    """One structured call: returns the tool input dict or None. Forces the tool; if the model rejects forced
    tool_choice (400), retries with auto + an instruction naming the tool. Never raises."""
    s = get_settings()
    msgs = [{"role": "user", "content": content}]
    kw = dict(model=s.anthropic_model, max_tokens=max_tokens, system=system, tools=[tool], messages=msgs)
    t = timeout_s or max(s.anthropic_timeout_s, 30)
    try:
        try:
            resp = await asyncio.wait_for(client().messages.create(**kw, tool_choice={"type": "tool", "name": tool["name"]}), timeout=t)
        except anthropic.BadRequestError as e:
            if "tool_choice" not in str(e).lower():
                raise
            kw["system"] = system + f"\n\nAlways answer by calling the `{tool['name']}` tool exactly once."
            resp = await asyncio.wait_for(client().messages.create(**kw, tool_choice={"type": "auto"}), timeout=t)
        for block in resp.content:
            if getattr(block, "type", "") == "tool_use" and block.name == tool["name"]:
                state["ok"] = True
                return dict(block.input)
        return None
    except Exception as e:  # noqa: BLE001
        log.warning("haiku tool_call %s failed: %s: %s", tool.get("name"), type(e).__name__, str(e)[:200])
        return None
