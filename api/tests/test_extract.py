from app.pipeline.extract import domain_of, mask_phone, merge, public_extraction, regex_extract

TEXT = """Congratulations! You are selected for Data Entry at Nexora Techsoft Pvt Ltd. Salary Rs 45,000/month.
Contact HR Priya on WhatsApp +91 98765 43210 or 8123456789. Email hr.nexora@gmail.com.
Pay refundable registration fee of ₹2,499 to nexora.hr@ybl within 2 hours. Fill https://forms.gle/AbCdEf123 and visit www.nexora-careers.in."""


def test_regex_basic():
    r = regex_extract(TEXT)
    assert "hr.nexora@gmail.com" in r["sender_emails"]
    assert "nexora.hr@ybl" in r["upi_ids"]
    assert "nexora.hr@ybl" not in r["sender_emails"]
    assert set(r["sender_phones"]) == {"9876543210", "8123456789"}
    assert any("forms.gle" in u for u in r["urls"])
    assert any("nexora-careers.in" in u for u in r["urls"])
    assert r["money_asked"] is True
    assert any("2,499" in a for a in r["amounts"])
    assert "whatsapp" in r["contact_channels"] and "google_form" in r["contact_channels"]
    assert any("within 2 hours" in p.lower() for p in r["urgency_phrases"])


def test_no_money_in_legit():
    r = regex_extract("Hi, we'd like to invite you to interview for the SWE intern role. Apply at https://careers.google.com/jobs/")
    assert r["money_asked"] is False
    assert r["upi_ids"] == []


def test_phone_formats():
    r = regex_extract("call 09876543210 or +919123456780; not an id 1234567890")
    assert "9876543210" in r["sender_phones"] and "9123456780" in r["sender_phones"]
    assert "1234567890" not in r["sender_phones"]


def test_mask_and_merge():
    assert mask_phone("+91 98765 43210") == "+91 98XXXXX210"
    m = merge(regex_extract(TEXT), {"company_name": "Nexora Techsoft", "money_requested": {"asked": False}, "interview_claimed": False,
                                    "claimed_official_domain": "https://www.nexora.com/", "sender_phones": ["+91-98765-43210"]})
    assert m["money_requested"]["asked"] is True
    assert m["claimed_official_domain"] == "nexora.com"
    assert m["sender_phones"].count("9876543210") == 1
    pub = public_extraction(m)
    assert "sender_phones" not in pub
    assert all("XXXXX" in p for p in pub["sender_phones_masked"])


def test_merge_without_haiku():
    m = merge(regex_extract(TEXT), None)
    assert m["company_name"] == "" and m["money_requested"]["asked"] is True


def test_domain_of():
    assert domain_of("hr@Acme.co.in") == "acme.co.in"
    assert domain_of("https://www.acme.com/jobs") == "acme.com"
    assert domain_of("www.acme.com") == "acme.com"
