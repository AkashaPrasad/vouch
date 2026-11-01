import pytest

from app import watches as w

CAREERS_MD = """
# Careers at Navi

[Home](https://navi.com/) [About us](https://navi.com/about) [Life at Navi](https://navi.com/life)

We're building the future of finance. [Learn more](https://navi.com/story)

## Open positions

- [Senior Backend Engineer](https://navi.com/careers/jobs/123?utm_source=x) - Bengaluru, India · 3 days ago
- [Product Designer](/careers/jobs/124) | Bengaluru
- [**Data Scientist II**](https://jobs.lever.co/navi/abc-def) Remote
- [Senior Backend Engineer](https://navi.com/careers/jobs/123?utm_source=y) - duplicate link, tracking only
- [Apply now](https://navi.com/careers/jobs/123/apply)
- [View all jobs](https://navi.com/careers/all)
- [Software Engineer](https://evil-jobs.example.com/x) - off-domain, must be ignored
- [Customer Success
  Bengaluru, India](https://navi.com/careers/jobs/125)

## Our values

[Customer Obsession Always](https://navi.com/values)
[Privacy Policy](https://navi.com/privacy)
"""


def test_parse_postings_extracts_titles_urls_locations():
    ps = w.parse_postings(CAREERS_MD, "https://navi.com/careers")
    titles = [p["title"] for p in ps]
    assert titles == ["Senior Backend Engineer", "Product Designer", "Data Scientist II", "Customer Success"]
    first = ps[0]
    assert first["location"] == "Bengaluru, India"
    assert first["posted"] == "3 days ago"
    assert ps[1]["url"] == "https://navi.com/careers/jobs/124"  # relative URL resolved
    assert ps[1]["location"] == "Bengaluru"
    assert ps[2]["url"].startswith("https://jobs.lever.co/")  # ATS host allowed
    assert ps[3]["location"] == "Bengaluru, India"  # multi-line link text split into title + location
    assert len({p["fingerprint"] for p in ps}) == len(ps)


def test_fingerprint_ignores_tracking_params():
    a = w.fingerprint("Senior Backend Engineer", "https://navi.com/careers/jobs/123?utm_source=x")
    b = w.fingerprint("senior backend engineer ", "https://navi.com/careers/jobs/123/?utm_campaign=y")
    assert a == b


def test_linkedin_only_job_view_links():
    md = ("[Software Engineer](https://in.linkedin.com/jobs/view/software-engineer-at-navi-4011?trk=abc)\n"
          "[Navi](https://www.linkedin.com/company/navi)\n[Sign in](https://www.linkedin.com/login)")
    ps = w.parse_postings(md, "https://www.linkedin.com/jobs/navi-jobs")
    assert [p["title"] for p in ps] == ["Software Engineer"]


def test_looks_like_title():
    assert w.looks_like_title("Senior Backend Engineer")
    assert w.looks_like_title("Head of Growth")
    assert not w.looks_like_title("View all jobs")
    assert not w.looks_like_title("Engineer")  # one word
    assert not w.looks_like_title("Customer Obsession Always")  # no role word, not under a jobs heading
    assert w.looks_like_title("Customer Obsession Always", in_jobs_section=True)


def test_looks_blocked():
    assert w.looks_blocked("Please enable JavaScript to continue.")
    assert not w.looks_blocked(CAREERS_MD * 3)


def test_diff_postings():
    old = [{"fingerprint": "a"}, {"fingerprint": "b"}]
    new = [{"fingerprint": "b"}, {"fingerprint": "c"}, {"fingerprint": "d"}]
    assert [p["fingerprint"] for p in w.diff_postings(old, new)] == ["c", "d"]
    assert len(w.diff_postings(None, new)) == 3


def test_shape_match_clamps_and_trims():
    m = w.shape_match({"score": "104.6", "reasons": ["a", "b", "c", "d"], "missing": "Go experience"})
    assert m == {"score": 100, "reasons": ["a", "b", "c"], "missing": ["Go experience"]}
    assert w.shape_match({"reasons": []}) is None
    assert w.shape_match({"score": "n/a"}) is None


def test_shape_prefs_keeps_chosen_roles():
    p = w.shape_prefs({"titles": ["Software Engineer"], "skills": ["Go"], "locations": ["Bengaluru"], "seniority": "fresher",
                       "remote": "weird", "exclude": []}, roles=["SDE Intern"])
    assert p["titles"][0] == "SDE Intern" and "Software Engineer" in p["titles"]
    assert p["remote"] == "any" and p["seniority"] == "fresher"


async def test_match_posting_uses_preferences_and_resume(monkeypatch):
    seen = {}

    async def fake_tool_call(tool, system, content, **kw):
        seen["tool"], seen["content"] = tool["name"], content
        return {"score": 88, "reasons": ["Title matches preferred role 'Backend Engineer'", "Location fits", "Go listed"],
                "missing": ["Kafka"]}

    monkeypatch.setattr(w.haiku, "tool_call", fake_tool_call)
    prefs = {"titles": ["Backend Engineer"], "skills": ["Go"], "locations": ["Bengaluru"], "seniority": "fresher",
             "remote": "any", "exclude": ["sales"]}
    m = await w.match_posting(prefs, {"skills": ["Go", "Postgres"]}, {"title": "Backend Engineer", "location": "Bengaluru"})
    assert m["score"] == 88 and len(m["reasons"]) == 3 and m["missing"] == ["Kafka"]
    assert seen["tool"] == "record_match"
    assert "<preferences>" in seen["content"] and "<resume_summary>" in seen["content"]


async def test_match_posting_excluded_skips_claude(monkeypatch):
    async def boom(*a, **k):
        raise AssertionError("Claude must not be called for excluded titles")

    monkeypatch.setattr(w.haiku, "tool_call", boom)
    m = await w.match_posting({"titles": [], "exclude": ["Sales"]}, None, {"title": "Inside Sales Executive"})
    assert m["score"] == 0 and "Sales" in m["reasons"][0]
    assert await w.match_posting(None, None, {"title": "x"}) is None


def test_choose_alerts_threshold_and_initial():
    new = [{"fingerprint": f, "title": f} for f in "abc"]
    matches = {"a": {"score": 90, "reasons": [], "missing": []}, "b": {"score": 72, "reasons": [], "missing": []},
               "c": {"score": 40, "reasons": [], "missing": []}}
    later = w.choose_alerts(new, matches, 70, first_run=False)
    assert [p["fingerprint"] for p, _ in later] == ["a", "b"] and not any(p.get("initial") for p, _ in later)
    first = w.choose_alerts(new, matches, 95, first_run=True)  # nothing over threshold -> best reasonable match, marked initial
    assert [p["fingerprint"] for p, _ in first] == ["a"] and first[0][0]["initial"] is True


async def test_normalise_source_linkedin_company():
    src = await w.normalise_source("https://www.linkedin.com/company/navi-technologies/")
    assert src == {"company_name": "Navi Technologies", "source_url": "https://www.linkedin.com/jobs/navi-technologies-jobs",
                   "source_kind": "linkedin_public"}
    ats = await w.normalise_source("https://jobs.lever.co/razorpay")
    assert ats["source_kind"] == "ats" and ats["company_name"] == "Razorpay"
    co = await w.normalise_source("navi.com/careers")
    assert co["source_kind"] == "careers" and co["source_url"] == "https://navi.com/careers"
