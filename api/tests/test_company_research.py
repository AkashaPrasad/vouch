import pytest

from app import company_research as cr
from app.clients import tinyfish

REDDIT = "https://www.reddit.com/r/developersIndia/comments/abc123/zomato_work_culture/"
AMB = "https://www.ambitionbox.com/reviews/zomato-reviews"
GD = "https://www.glassdoor.co.in/Reviews/Zomato-Reviews-E123.htm"
NEWS = "https://economictimes.indiatimes.com/tech/zomato-lays-off-600/articleshow/1.cms"


def test_platform_tagging_by_host_then_query():
    assert cr.platform_for(REDDIT, "news") == "reddit"
    assert cr.platform_for(AMB) == "ambitionbox"
    assert cr.platform_for(GD) == "glassdoor"
    assert cr.platform_for("https://www.glassdoor.com/Reviews/x.htm") == "glassdoor"
    assert cr.platform_for("https://www.teamblind.com/company/Zomato") == "blind"
    assert cr.platform_for("https://twitter.com/a/status/1") == "x"
    assert cr.platform_for("https://x.com/a/status/1") == "x"
    assert cr.platform_for("https://www.linkedin.com/posts/someone_zomato-activity-1") == "linkedin"
    assert cr.platform_for("https://www.zomato.com/careers", "official", "Zomato") == "official"
    assert cr.platform_for("https://blog.zomato.com/x", "reddit", "Zomato") == "official"
    assert cr.platform_for("https://example.org/zomato-story", "news", "Zomato") == "news"
    assert cr.platform_for(NEWS, "official", "Zomato") == "news"
    assert cr.platform_for("https://en.wikipedia.org/wiki/Zomato", "official", "Zomato") == "web"


def test_reddit_rewrite_and_url_key():
    assert cr.reddit_fetch_url(REDDIT.replace("www.", "old.") + "?utm=1") == REDDIT
    assert cr.reddit_fetch_url(AMB) == AMB
    assert cr.url_key(REDDIT) == cr.url_key(cr.reddit_fetch_url(REDDIT)) == cr.url_key(REDDIT.rstrip("/") + "?utm=1")
    assert cr.url_key("not a url") == ""


def test_tag_hits_dedupes_and_filters_unrelated():
    raw = {"reddit": [{"url": REDDIT, "title": "Zomato work culture?", "snippet": "toxic"},
                      {"url": "https://www.reddit.com/r/x/comments/zz/unrelated/", "title": "Swiggy pay", "snippet": "nothing"}],
           "news": [{"url": REDDIT, "title": "Zomato work culture?", "snippet": "dup"},
                    {"url": NEWS, "title": "Zomato lays off 600", "snippet": "layoffs"}]}
    hits = cr.tag_hits(raw, "Zomato")
    assert [h["url"] for h in hits] == [REDDIT, NEWS]
    assert [h["platform"] for h in hits] == ["reddit", "news"]


def test_pick_fetch_prefers_readable_and_limits():
    hits = [{"url": f"https://www.reddit.com/r/a/comments/{i}/t/", "platform": "reddit"} for i in range(6)]
    hits += [{"url": AMB, "platform": "ambitionbox"}, {"url": GD, "platform": "glassdoor"}, {"url": NEWS, "platform": "news"},
             {"url": "https://www.linkedin.com/posts/a", "platform": "linkedin"},
             {"url": "https://www.reddit.com/r/a/", "platform": "reddit"}]
    picks = cr.pick_fetch_urls(hits)
    assert len(picks) <= 10
    assert picks[:3] == [h["url"] for h in hits[:3]]
    assert AMB in picks and NEWS in picks and GD in picks
    assert "https://www.reddit.com/r/a/" not in picks  # not a thread


def test_quote_matching():
    corpus = cr._norm("Work-life balance is non existent. Managers expect you online at 11 PM! Pay is good though.")
    assert cr.quote_in("Managers expect you online at 11 PM", corpus)
    assert cr.quote_in("work-life balance is non existent... pay is good though", corpus)
    assert not cr.quote_in("Managers are kind and hours are short", corpus)
    assert not cr.quote_in("", corpus)
    assert len(cr.trim_quote("word " * 100)) <= 240


def _evidence():
    ev = cr.Evidence("Zomato", "zomato.com")
    d1 = ev.add(REDDIT, platform="reddit", title="Zomato culture", snippet="snippet only")
    d1["text"], d1["readable"], d1["fetch_attempted"] = "Joined as a fresher. Managers expect you online at 11 PM. Hikes were 8%.", True, True
    ev.add(GD, platform="glassdoor", title="Glassdoor", snippet="Good brand value but long working hours and politics.")
    ev.add(NEWS, platform="news", title="Zomato lays off 600", snippet="Zomato lays off 600 customer support staff in 2023.")
    return ev


def test_validate_drops_unknown_urls_and_unverified_quotes():
    ev = _evidence()
    raw = {
        "overall": {"verdict_text": "Mixed.", "score_0_100": 140, "confidence": "high"},
        "dimensions": [
            {"key": "work_life_balance", "score_0_100": 30, "summary": "Employees report long hours.", "evidence": [
                {"quote": "Managers expect you online at 11 PM", "source_id": "S1", "sentiment": "negative"},
                {"quote": "long working hours and politics", "source_id": GD, "sentiment": "negative"},
                {"quote": "Invented quote that is nowhere", "source_id": "S1", "sentiment": "negative"},
                {"quote": "Managers expect you online at 11 PM", "source_id": "https://made-up.example.com/x", "sentiment": "negative"},
            ]},
            {"key": "growth", "score_0_100": 80, "summary": "Great growth.", "evidence": [
                {"quote": "fabricated growth claim here", "source_id": "S2", "sentiment": "positive"}]},
            {"key": "not_a_key", "score_0_100": 1, "summary": "x", "evidence": []},
        ],
        "layoffs_timeline": [{"date": "2023", "what": "600 support staff laid off", "source_id": "S3"},
                             {"date": "2024", "what": "made up", "source_id": "https://nowhere.example/"}],
        "red_flags": [{"text": "Reviews mention late-night work", "source_id": "S1"}, {"text": "x", "source_id": "S99"}],
        "green_flags": [{"text": "Hikes mentioned", "source_url": REDDIT.replace("www.", "old.")}],
    }
    report, stats = cr.validate_report(raw, ev, "https://www.zomato.com")
    allowed = ev.allowed_urls()
    dims = {d["key"]: d for d in report["dimensions"]}
    assert list(dims) == cr.DIM_KEYS
    wlb = dims["work_life_balance"]
    assert [e["quote"] for e in wlb["evidence"]] == ["Managers expect you online at 11 PM", "long working hours and politics"]
    assert [e["platform"] for e in wlb["evidence"]] == ["reddit", "glassdoor"]
    assert dims["growth"]["score_0_100"] is None and dims["growth"]["summary"] == cr.NO_EVIDENCE
    assert dims["culture"]["evidence"] == [] and dims["culture"]["score_0_100"] is None
    assert len(report["layoffs_timeline"]) == 1 and len(report["red_flags"]) == 1
    assert report["green_flags"][0]["source_url"] == REDDIT  # old.reddit form maps back to the canonical URL
    assert report["overall"]["score_0_100"] == 100 and report["overall"]["confidence"] == "medium"  # clamped; 1 dim => not high
    urls = [e["source_url"] for d in report["dimensions"] for e in d["evidence"]]
    urls += [x["source_url"] for k in ("layoffs_timeline", "red_flags", "green_flags") for x in report[k]]
    urls += [s["url"] for s in report["sources"]]
    assert set(urls) <= allowed
    assert stats["dropped_quotes"] == 2 and stats["dropped_urls"] >= 3
    pc = {p["platform"]: p for p in report["platforms_covered"]}
    assert pc["reddit"]["reachable"] is True and pc["glassdoor"]["reachable"] is False
    assert pc["glassdoor"]["evidence_items"] == 1 and pc["blind"]["items"] == 0


def test_validate_empty_is_not_enough_evidence():
    report, _ = cr.validate_report(None, _evidence())
    assert report["overall"]["score_0_100"] is None
    assert all(d["summary"] == cr.NO_EVIDENCE for d in report["dimensions"])


async def test_build_report_with_mocked_clients(monkeypatch):
    async def fake_search(q, **kw):
        if "reddit" in q:
            return [{"url": REDDIT, "title": "Zomato work culture", "snippet": "Is Zomato toxic?"}]
        if "glassdoor" in q:
            return [{"url": GD, "title": "Zomato reviews", "snippet": "Zomato: good pay but long working hours."}]
        if "layoffs" in q and kw.get("domain_type") == "news":
            return [{"url": NEWS, "title": "Zomato lays off 600", "snippet": "Zomato lays off 600 customer support staff after automation push."}]
        return []

    fetched_urls = []

    async def fake_fetch(urls, **kw):
        fetched_urls.extend(urls)
        out = {}
        for u in urls:
            if "www.reddit.com" in u:
                out[u] = {"url": u, "final_url": u, "title": "t", "text": ("I worked at Zomato as a fresher and managers were supportive. " * 20)}
            elif "glassdoor" in u:
                out[u] = {"url": u, "final_url": u, "title": "t", "text": "Sign in to continue"}
        return out

    async def fake_llm(payload):
        ids = {d["platform"]: d["id"] for d in payload["documents"]}
        assert {d["kind"] for d in payload["documents"]} >= {"fetched", "snippet"}
        return {"overall": {"verdict_text": "Mixed reports.", "score_0_100": 60, "confidence": "low"},
                "dimensions": [{"key": "freshers_treatment", "score_0_100": 70, "summary": "A Reddit user reports supportive managers.",
                                "evidence": [{"quote": "I worked at Zomato as a fresher and managers were supportive.",
                                              "source_id": ids["reddit"], "sentiment": "positive"}]}],
                "layoffs_timeline": [{"date": "", "what": "600 staff laid off", "source_id": ids["news"]}],
                "red_flags": [], "green_flags": []}

    monkeypatch.setattr(tinyfish, "search", fake_search)
    monkeypatch.setattr(tinyfish, "fetch", fake_fetch)
    monkeypatch.setattr(tinyfish, "agent_available", lambda: False)
    monkeypatch.setattr(cr, "organise_llm", fake_llm)
    monkeypatch.setattr(cr, "get_settings", lambda: type("S", (), {"tinyfish_enable_research": False})())
    lines = []

    async def prog(t):
        lines.append(t)

    report = await cr.build_report("Zomato", "", prog)
    assert any("www.reddit.com" in u for u in fetched_urls)
    pc = {p["platform"]: p for p in report["platforms_covered"]}
    assert pc["reddit"]["reachable"] and not pc["glassdoor"]["reachable"] and pc["glassdoor"]["fetch_attempted"] == 1
    fr = next(d for d in report["dimensions"] if d["key"] == "freshers_treatment")
    assert fr["score_0_100"] == 70 and fr["evidence"][0]["source_url"] == REDDIT
    assert report["layoffs_timeline"][0]["source_url"] == NEWS
    assert any(l.startswith("Read ") for l in lines)
