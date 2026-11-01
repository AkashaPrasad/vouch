from app.pipeline import domains as dm
from app.pipeline import extract as ex
from app.pipeline.scoring import compute_verdict


def test_platform_classification():
    assert dm.classify("https://www.linkedin.com/jobs/view/123") == "job_board"
    assert dm.classify("in.linkedin.com") == "job_board"
    assert dm.classify("forms.gle") == "form_or_doc"
    assert dm.classify("docs.google.com") == "form_or_doc"
    assert dm.classify("google.com") == "company"
    assert dm.classify("bit.ly") == "shortener"
    assert dm.classify("t.me") == "messaging"
    assert dm.classify("acme-careers.wixsite.com") == "free_host"
    assert dm.classify("rzp.io") == "payment"
    assert dm.classify("gmail.com") == "free_mail"
    assert dm.classify("infosys.com") == "company"
    assert dm.is_platform("naukri.com") and not dm.is_platform("tcs.com")


def test_known_brand_detection():
    assert dm.known_brand("Infosys Ltd")["official_domains"] == ["infosys.com"]
    assert dm.known_brand("Tata Consultancy Services Pvt Ltd")["name"] == "Tata Consultancy Services"
    assert dm.known_brand("TCS")["name"] == "Tata Consultancy Services"
    assert dm.known_brand("Nexora Techsoft Solutions") is None
    assert dm.known_brand("") is None
    assert dm.brand_in_label("infosys-careers.in", dm.known_brand("Infosys"))
    assert not dm.brand_in_label("nexora.in", dm.known_brand("Infosys"))


def test_platform_url_is_not_company_domain():
    m = ex.merge(ex.regex_extract("Apply here https://www.linkedin.com/jobs/view/123"), {"company_name": "Acme", "claimed_official_domain": "linkedin.com"})
    assert m["claimed_official_domain"] == ""
    assert dm.company_domains(m) == []
    assert m["hosts"] == [{"host": "linkedin.com", "category": "job_board"}]


def test_company_domains_prefers_corporate_mail():
    m = ex.merge(ex.regex_extract("mail hr@acme.com, site https://acme-careers.in, form https://forms.gle/x"), None)
    assert dm.company_domains(m) == ["acme.com", "acme-careers.in"]
    assert [h["category"] for h in dm.platform_hosts(m)] == ["form_or_doc"]


def test_shortener_and_payment_detection():
    r = ex.regex_extract("Pay via https://rzp.io/l/abc and apply at bit.ly/3xyz")
    assert r["money_asked"] and r["patterns"]["payment_links"] == ["https://rzp.io/l/abc"]
    assert dm.shortener_urls(r["urls"]) == ["bit.ly/3xyz"]


def test_task_scam_and_mule_patterns():
    r = ex.regex_extract("Part time job: like videos and earn ₹5,000 per day. Daily payout. Join our telegram group.")
    assert r["patterns"]["task_scam"]
    r2 = ex.regex_extract("You will receive payments and forward them to our clients, keep 10% commission.")
    assert r2["patterns"]["money_mule"]


def test_overseas_gov_personal_data_patterns():
    r = ex.regex_extract("Dubai job offer. Visa fee 25000. Send Aadhaar and PAN card photo. Railway recruitment registration fee Rs 500.")
    assert r["patterns"]["overseas"] and r["patterns"]["personal_data"] and r["patterns"]["gov_job"] and r["money_asked"]


def sig(code, status, w=0, tags=None):
    return {"code": code, "status": status, "weight_applied": w, "tags": tags or []}


def test_hard_rules_impersonation_and_task_scam():
    red = compute_verdict([sig("S1", "fail", 40), sig("S2", "fail", 30, ["impersonation"]), sig("S3", "pass", -10), sig("S8", "pass", -20), sig("S7", "pass", -10), sig("S6", "pass", -5)],
                          is_final=True, elapsed_ms=1, limited=False)
    assert red["band"] == "red"
    amber = compute_verdict([sig("S10", "fail", 20, ["task_scam"]), sig("S3", "pass", -10), sig("S2", "pass", -30), sig("S8", "pass", -20)], is_final=True, elapsed_ms=1, limited=False)
    assert amber["band"] == "amber"
