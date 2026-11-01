"""Regex extractor + merge with Haiku extraction + masking helpers."""
import hashlib
import re
from urllib.parse import urlparse

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
UPI_RE = re.compile(r"\b[A-Za-z0-9._-]{2,256}@(?:upi|ybl|okaxis|okhdfcbank|okicici|oksbi|paytm|apl|ibl|axl|icici|sbi|hdfcbank|axisbank|kotak|yesbank|freecharge|airtel|jio|indus|pthdfc|ptsbi|ptyes|ptaxis)\b", re.I)
PHONE_RE = re.compile(r"(?<![\d+])(?:\+?91[\s-]?|0)?([6-9]\d{4}[\s-]?\d{5})(?!\d)")
URL_RE = re.compile(r"\b(?:https?://|www\.)[^\s<>\"')\]]+|\b(?:forms\.gle|bit\.ly|t\.me|wa\.me|tinyurl\.com|cutt\.ly|rb\.gy|lnkd\.in|linktr\.ee|rzp\.io|razorpay\.me|paytm\.me|instamojo\.com|shorturl\.at|t\.ly|tiny\.cc)/[^\s<>\"')\]]+|\bupi://pay\?[^\s<>\"')\]]+", re.I)
MONEY_RE = re.compile(r"(?:₹|rs\.?|inr)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:rupees|/-)", re.I)
# a payment demand must sit next to an amount: "pay ₹2,950 ... fee" or "registration fee of Rs 500"
MONEY_DEMAND_RE = re.compile(r"\b(pay|deposit|transfer|send|remit|submit|charge[sd]?|fee|fees)\b[^.\n]{0,60}?(?:₹|rs\.?|inr)\s?\d[\d,]{1,9}"
                             r"|(?:₹|rs\.?|inr)\s?\d[\d,]{1,9}[^.\n]{0,60}?\b(fee|fees|deposit|charges?|registration|refundable|payable|to be paid|pay)\b", re.I)
FEE_WORDS = re.compile(r"\b(registration|training|security|deposit|refundable|laptop|kit|verification|processing|onboarding|joining|"
                       r"visa|air ?ticket|work permit|medical|background|document|id card|uniform|courier|bond|membership|activation|"
                       r"unlock|task|welfare|insurance|gst|tds|service|admin|interview scheduling|interview)\s*(fee|charge|charges|amount|deposit|cost|money)?"
                       r"|\bpay\b|\bpayment\b|\btop[- ]?up\b|\brecharge\b|\bupi\b|\bqr code\b|\bscan (and|&) pay\b|\bgoogle ?pay\b|\bphonepe\b|\bpaytm\b", re.I)
PAYMENT_TARGET_RE = re.compile(r"\b(?:a/c|acc(?:ount)?\s*(?:no|number)?)\s*[:#-]?\s*\d{9,18}\b|\bifsc\s*[:#-]?\s*[A-Z]{4}0[A-Z0-9]{6}\b|"
                               r"\b(?:usdt|trc20|erc20|btc|bitcoin|crypto wallet|binance id)\b", re.I)
TASK_SCAM_RE = re.compile(r"\b(like (and )?(subscribe|share)|liking videos|like videos|rate (hotels?|products?|movies?)|prepaid tasks?|merchant tasks?|"
                          r"crypto tasks?|per task|daily (payout|withdrawal|income|earning)|earn (₹|rs\.?|inr)?\s?[\d,]+ ?(per|/|a) ?(day|hour|hr|task)|"
                          r"part[- ]time (job|work|income).{0,40}(no experience|from home|daily)|commission per|work 10 minutes|2-3 hours? (a|per) day earn|"
                          r"telegram (group|channel|task)|complete (the )?tasks? (and|to) (earn|get|receive)|withdraw(al)? (after|once) (you )?(complete|deposit))\b", re.I)
MULE_RE = re.compile(r"\b(receive (payments?|money|funds) (and|then) (forward|transfer|send)|use your (bank )?account|transfer (the )?(amount|money) to (another|other)|"
                     r"process payments? (from|for) (our )?(clients|customers)|keep \d+ ?% (as )?commission|commission agent|cash handling)\b", re.I)
OVERSEAS_RE = re.compile(r"\b(visa (fee|processing|charges|sponsorship fee)|air ?ticket|flight ticket|work permit|overseas job|abroad job|"
                         r"(dubai|singapore|canada|uk|usa|australia|cambodia|thailand|myanmar|malaysia) (job|visa|offer)|emigration|travel (fee|charges))\b", re.I)
GOV_JOB_RE = re.compile(r"\b(government job|govt\.? job|sarkari naukri|railway (job|recruitment|vacancy)|ssc|upsc|bank po|clerk vacancy|"
                        r"post office (job|recruitment)|defence (job|recruitment)|psu job|anganwadi|central government)\b", re.I)
PERSONAL_DATA_RE = re.compile(r"\b(aadhaar|aadhar|pan card|pan number|bank (details|statement)|debit card|credit card|cvv|otp|net ?banking|passport (copy|number)|"
                              r"selfie with|photo of (your )?(id|aadhaar|pan))\b", re.I)
URGENCY_RE = re.compile(r"(within \d+\s*(hours?|hrs?|minutes?|mins?|days?)|today only|limited (seats|slots|positions|vacancies)|urgent(ly)?|"
                        r"last date today|offer expires|expires? (today|tonight|in \d+)|only \d+ (seats|slots|positions) left|first come first serve|"
                        r"confirm (your )?(seat|slot|position) (now|today|immediately)|reply (now|asap|fast|quickly)|don'?t (delay|miss)|hurry)", re.I)
CHANNEL_WORDS = {"whatsapp": r"whats\s?app|wa\.me", "telegram": r"telegram|t\.me/", "google_form": r"forms\.gle|docs\.google\.com/forms|google form",
                 "instagram": r"instagram|insta dm|ig dm", "discord": r"discord\.(gg|com)|discord server", "signal": r"\bsignal app\b|signal\.me",
                 "sms": r"\bsms\b|text (me|us) (on|at)", "typeform": r"typeform\.com|jotform\.com|tally\.so"}
ONLY_PLATFORM_CHANNELS = {"whatsapp", "telegram", "google_form", "instagram", "discord", "signal", "sms", "typeform"}


def norm_phone(p: str) -> str:
    d = re.sub(r"\D", "", p)
    return d[-10:]


def mask_phone(p: str) -> str:
    d = norm_phone(p)
    return f"+91 {d[:2]}XXXXX{d[-3:]}" if len(d) == 10 else "XXXXXXXXXX"


def mask_email(e: str) -> str:
    user, _, dom = e.partition("@")
    return f"{user[:2]}***@{dom}"


def mask_upi(u: str) -> str:
    user, _, handle = u.partition("@")
    return f"{user[:2]}***@{handle}"


def sha(v: str) -> str:
    return hashlib.sha256(v.strip().lower().encode()).hexdigest()


def domain_of(s: str) -> str:
    s = s.strip().lower()
    if "@" in s and "://" not in s:
        return s.rsplit("@", 1)[1]
    if "://" not in s:
        s = "http://" + s
    host = urlparse(s).hostname or ""
    return host[4:] if host.startswith("www.") else host


def regex_extract(text: str) -> dict:
    upis = list(dict.fromkeys(m.group(0) for m in UPI_RE.finditer(text)))
    emails = [e for e in dict.fromkeys(EMAIL_RE.findall(text)) if e not in upis]
    phones = list(dict.fromkeys(norm_phone(m.group(1)) for m in PHONE_RE.finditer(text)))
    urls = list(dict.fromkeys(u.rstrip(".,;:!") for u in URL_RE.findall(text)))
    amounts = [m.group(0).strip() for m in MONEY_RE.finditer(text)]
    fee_ctx = bool(FEE_WORDS.search(text))
    from app.pipeline.domains import payment_urls
    pay_links = payment_urls(urls)
    pay_target = bool(PAYMENT_TARGET_RE.search(text))
    demand = MONEY_DEMAND_RE.search(text)
    demand_amount_ok = False
    if demand:
        digits = re.sub(r"[^\d]", "", demand.group(0))
        demand_amount_ok = digits.isdigit() and 50 <= int(digits) <= 10_000_000
    money_asked = bool(upis) or bool(pay_links) or pay_target or (fee_ctx and demand_amount_ok)
    if money_asked and not demand_amount_ok and not (upis or pay_links or pay_target):
        money_asked = False
    amounts = [a for a in amounts if re.search(r"\d", a) and int(re.sub(r"[^\d]", "", a) or "0") > 0]
    patterns = {
        "task_scam": [m.group(0) for m in TASK_SCAM_RE.finditer(text)][:3],
        "money_mule": [m.group(0) for m in MULE_RE.finditer(text)][:3],
        "overseas": [m.group(0) for m in OVERSEAS_RE.finditer(text)][:3],
        "gov_job": [m.group(0) for m in GOV_JOB_RE.finditer(text)][:3],
        "personal_data": [m.group(0) for m in PERSONAL_DATA_RE.finditer(text)][:3],
        "payment_links": pay_links[:3],
        "bank_or_crypto": pay_target,
    }
    channels = [k for k, pat in CHANNEL_WORDS.items() if re.search(pat, text, re.I)]
    if emails:
        channels.append("email")
    if phones:
        channels.append("phone")
    return {
        "sender_emails": emails, "sender_phones": phones, "upi_ids": upis, "urls": urls,
        "amounts": amounts, "money_asked": money_asked,
        "urgency_phrases": [m.group(0) for m in URGENCY_RE.finditer(text)],
        "contact_channels": channels,
        "patterns": patterns,
    }


EMPTY = {
    "company_name": "", "claimed_official_domain": "", "role_title": "", "location": "", "salary_text": "",
    "sender_emails": [], "sender_phones": [], "upi_ids": [], "urls": [],
    "money_requested": {"asked": False, "amount": "", "purpose": ""},
    "contact_channels": [], "urgency_phrases": [], "interview_claimed": False, "unrealistic_pay": False,
    "red_flag_quotes": [],
    "patterns": {},
}


def _union(a: list, b: list) -> list:
    return list(dict.fromkeys([x for x in (a or []) + (b or []) if x]))


def merge(regex: dict, haiku: dict | None, input_url: str | None = None) -> dict:
    """Merged internal extraction (raw values; never expose phones raw to clients)."""
    h = {**EMPTY, **(haiku or {})}
    mr = h.get("money_requested") or {}
    money = {"asked": bool(mr.get("asked")) or regex["money_asked"],
             "amount": mr.get("amount") or (regex["amounts"][0] if regex["amounts"] else ""),
             "purpose": mr.get("purpose") or ""}
    urls = _union(regex["urls"], h.get("urls", []))
    if input_url:
        urls = _union([input_url], urls)
    out = {
        **h,
        "sender_emails": [e.lower() for e in _union(regex["sender_emails"], h.get("sender_emails", []))],
        "sender_phones": _union(regex["sender_phones"], [norm_phone(p) for p in h.get("sender_phones", []) if len(norm_phone(p)) == 10]),
        "upi_ids": _union(regex["upi_ids"], h.get("upi_ids", [])),
        "urls": urls,
        "money_requested": money,
        "contact_channels": _union(regex["contact_channels"], [c.lower() for c in h.get("contact_channels", [])]),
        "urgency_phrases": _union(regex["urgency_phrases"], h.get("urgency_phrases", [])),
        "claimed_official_domain": domain_of(h["claimed_official_domain"]) if h.get("claimed_official_domain") else "",
        "patterns": regex.get("patterns", {}),
    }
    # A platform (job board, form, shortener, free host) is never the company's official domain.
    from app.pipeline import domains as dm
    if out["claimed_official_domain"] and dm.is_platform(out["claimed_official_domain"]):
        out["claimed_official_domain"] = ""
    name = re.sub(r"\s*\([^)]*\)", "", str(out.get("company_name") or "")).strip(" -–|,.")
    out["company_name"] = name[:120]
    out["listing_unavailable"] = bool(h.get("listing_unavailable"))
    out["hosts"] = dm.hosts_of(out)
    out["known_brand"] = dm.known_brand(out["company_name"])
    return out


def public_extraction(ex: dict) -> dict:
    """Shape for the extraction.done SSE event (masked)."""
    return {
        "company_name": ex.get("company_name", ""),
        "claimed_official_domain": ex.get("claimed_official_domain", ""),
        "role_title": ex.get("role_title", ""),
        "location": ex.get("location", ""),
        "salary_text": ex.get("salary_text", ""),
        "sender_emails": ex.get("sender_emails", []),
        "sender_phones_masked": [mask_phone(p) for p in ex.get("sender_phones", [])],
        "upi_ids_masked": [mask_upi(u) for u in ex.get("upi_ids", [])],
        "urls": ex.get("urls", []),
        "money_requested": ex.get("money_requested", {"asked": False, "amount": "", "purpose": ""}),
        "contact_channels": ex.get("contact_channels", []),
        "urgency_phrases": ex.get("urgency_phrases", []),
        "interview_claimed": bool(ex.get("interview_claimed")),
        "red_flag_quotes": ex.get("red_flag_quotes", []),
        "hosts": ex.get("hosts", []),
        "known_brand": ex.get("known_brand"),
        "listing_unavailable": bool(ex.get("listing_unavailable")),
    }
