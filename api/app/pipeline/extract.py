"""Regex extractor + merge with Haiku extraction + masking helpers."""
import hashlib
import re
from urllib.parse import urlparse

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
UPI_RE = re.compile(r"\b[A-Za-z0-9._-]{2,256}@(?:upi|ybl|okaxis|okhdfcbank|okicici|oksbi|paytm|apl|ibl|axl|icici|sbi|hdfcbank|axisbank|kotak|yesbank|freecharge|airtel|jio|indus|pthdfc|ptsbi|ptyes|ptaxis)\b", re.I)
PHONE_RE = re.compile(r"(?<![\d+])(?:\+?91[\s-]?|0)?([6-9]\d{4}[\s-]?\d{5})(?!\d)")
URL_RE = re.compile(r"\b(?:https?://|www\.)[^\s<>\"')\]]+|\b(?:forms\.gle|bit\.ly|t\.me|wa\.me|tinyurl\.com)/[^\s<>\"')\]]+", re.I)
MONEY_RE = re.compile(r"(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s?(?:rupees|/-)", re.I)
FEE_WORDS = re.compile(r"\b(registration|training|security|deposit|refundable|laptop|kit|verification|processing|onboarding|joining)\s*(fee|charge|amount|deposit)?|\bpay\b|\bpayment\b|\btop[- ]?up\b|\bupi\b|\bqr code\b", re.I)
URGENCY_RE = re.compile(r"(within \d+\s*(hours?|hrs?|minutes?|mins?)|today only|limited (seats|slots)|immediately|urgent(ly)?|last date today|offer expires)", re.I)
CHANNEL_WORDS = {"whatsapp": r"whats\s?app|wa\.me", "telegram": r"telegram|t\.me/", "google_form": r"forms\.gle|docs\.google\.com/forms|google form"}


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
    money_asked = bool(upis) or (bool(amounts) and fee_ctx and bool(re.search(r"\b(pay|deposit|fee|charge|transfer|send)\b", text, re.I)))
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
    }


EMPTY = {
    "company_name": "", "claimed_official_domain": "", "role_title": "", "location": "", "salary_text": "",
    "sender_emails": [], "sender_phones": [], "upi_ids": [], "urls": [],
    "money_requested": {"asked": False, "amount": "", "purpose": ""},
    "contact_channels": [], "urgency_phrases": [], "interview_claimed": False, "unrealistic_pay": False,
    "red_flag_quotes": [],
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
    }
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
    }
