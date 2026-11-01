import asyncio
from types import SimpleNamespace

import pytest

from app import research
from app.clients import tinyfish
from app.db.models import Check, SessionLocal, init_db
from app.preview import extract_preview

FAKE = {
    "research_run_id": "rr_1",
    "status": "COMPLETED",
    "quick_result": {"answer": "Probably a small real startup.", "citations": ["https://quillmarklabs.in/"]},
    "deep_result": {
        "result": ("## Summary\nQuillmark Labs appears to be a real early-stage company [1].\n\n"
                   "## Official website\nThe domain quillmarklabs.in hosts the company site and matches the sender [1].\n\n"
                   "## Registry status\nNo MCA record was found under that name, see https://www.zaubacorp.com/x and [2].\n\n"
                   "## Sources\n[1] https://quillmarklabs.in/\n"),
        "citations": ["https://quillmarklabs.in/", "https://www.mca.gov.in/search"],
        "termination_reason": "complete",
    },
    "evidence": [
        {"url": "https://quillmarklabs.in/", "title": "Quillmark Labs", "subquestions_covered": ["q1"], "source_quality": "primary",
         "claims": [{"claim": "Company site is live", "snippet": "We build tools for learners", "subquestion_id": "q1", "confidence": "high"}]},
    ],
}


def _all_urls(report):
    return {u for f in report["findings"] for u in f["sources"]} | {s["url"] for s in report["sources"]}


def test_normalise_report_shape_and_real_urls():
    r = research.normalise(FAKE)
    assert r["summary"].startswith("Quillmark Labs appears to be a real")
    titles = [f["title"] for f in r["findings"]]
    assert titles == ["Official website", "Registry status"]  # Summary / Sources sections skipped
    assert r["findings"][0]["sources"] == ["https://quillmarklabs.in/"]
    assert set(r["findings"][1]["sources"]) == {"https://www.zaubacorp.com/x", "https://www.mca.gov.in/search"}
    allowed = set(FAKE["deep_result"]["citations"]) | {"https://www.zaubacorp.com/x"}
    assert _all_urls(r) <= allowed
    assert r["sources"][0] == {"title": "Quillmark Labs", "url": "https://quillmarklabs.in/"}
    assert "[1]" not in r["findings"][0]["detail"]


def test_normalise_falls_back_to_evidence_claims():
    d = {**FAKE, "deep_result": {"result": "Short answer without sections.", "citations": []}}
    r = research.normalise(d)
    assert r["summary"] == "Short answer without sections."
    assert r["findings"][0] == {"title": "Company site is live", "detail": "We build tools for learners",
                                "sources": ["https://quillmarklabs.in/"]}
    assert _all_urls(r) == {"https://quillmarklabs.in/"}


def test_build_query_masks_and_mentions_context():
    q = research.build_query({"official_domain": "quillmarklabs.in", "extraction": {
        "company_name": "Quillmark Labs", "role_title": "Frontend Developer Intern",
        "sender_emails": ["rohan@quillmarklabs.in"], "sender_phones_masked": ["+91 98XXXXX345"]}})
    assert "Quillmark Labs" in q and "Frontend Developer Intern" in q
    assert "rohan@" not in q and "quillmarklabs.in" in q and "+91 98XXXXX345" in q


async def test_start_research_is_idempotent(monkeypatch):
    await init_db()
    async with SessionLocal() as db:
        db.add(Check(id="chkidem01"))
        await db.commit()
    spawned = []

    def fake_spawn(check_id, snap, resume_run_id=None):
        spawned.append(check_id)
        research.JOBS[check_id] = asyncio.get_running_loop().create_future()

    monkeypatch.setattr(research, "_spawn", fake_spawn)
    assert await research.start_research("chkidem01", {"extraction": {}}) == "running"
    assert await research.start_research("chkidem01", {"extraction": {}}) == "running"
    assert spawned == ["chkidem01"]
    await research._save("chkidem01", status="done", report_json={"summary": "x", "findings": [], "sources": []})
    assert await research.start_research("chkidem01", {}) == "done"
    st = await research.research_state("chkidem01")
    assert st["status"] == "done" and st["report"]["summary"] == "x"
    assert (await research.research_state("nope"))["status"] == "idle"
    research.JOBS.pop("chkidem01", None)


async def test_highlights_403_sets_flag(monkeypatch):
    from tinyfish import PermissionDeniedError

    calls = []

    class FakeFetch:
        async def get_contents(self, **kw):
            calls.append(kw)
            raise PermissionDeniedError.__new__(PermissionDeniedError)

    monkeypatch.setattr(tinyfish, "client", lambda: SimpleNamespace(fetch=FakeFetch()))
    monkeypatch.setattr(tinyfish.get_settings(), "tinyfish_highlights_enabled", True)
    tinyfish.highlights_state["forbidden"] = False
    assert await tinyfish.fetch_highlights(["https://a.example"], "careers") is None
    assert tinyfish.highlights_state["forbidden"] is True
    assert calls and calls[0]["highlights"]["query"] == "careers"
    assert await tinyfish.fetch_highlights(["https://a.example"], "careers") is None
    assert len(calls) == 1  # stopped trying
    tinyfish.highlights_state["forbidden"] = False


def test_extract_preview():
    from tinyfish import StreamingUrlEvent

    ev = StreamingUrlEvent.model_validate({"type": "STREAMING_URL", "runId": "r1", "streamingUrl": "wss://live.example/x",
                                           "timestamp": "2026-11-01T00:00:00Z"})
    assert extract_preview(ev) == "wss://live.example/x"
    assert extract_preview({"data": {"streaming_url": "https://v.example"}}) == "https://v.example"
    assert extract_preview(SimpleNamespace(purpose="x")) is None
    assert extract_preview(None) is None
