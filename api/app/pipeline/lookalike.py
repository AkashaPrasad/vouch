"""Domain lookalike detection."""
FREE_MAIL = {"gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "live.com",
             "rediffmail.com", "proton.me", "protonmail.com", "icloud.com", "aol.com", "zoho.com", "yandex.com", "gmx.com", "mail.com"}
SUFFIXES = ("-careers", "-career", "-hr", "-jobs", "-job", "-recruitment", "-recruit", "-hiring", "-official", "-india", "careers", "hr", "jobs", "recruitment", "hiring")
SWAPS = (("rn", "m"), ("vv", "w"), ("0", "o"), ("1", "l"), ("3", "e"), ("5", "s"), ("@", "a"))
MULTI_TLDS = ("co.in", "org.in", "net.in", "ac.in", "gov.in", "co.uk", "com.au")


def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def registrable(domain: str) -> str:
    d = domain.lower().strip().rstrip(".")
    if d.startswith("www."):
        d = d[4:]
    try:
        d = d.encode().decode("idna") if d.startswith("xn--") or ".xn--" in d else d
    except Exception:  # noqa: BLE001
        pass
    parts = d.split(".")
    for t in MULTI_TLDS:
        if d.endswith("." + t) and len(parts) >= 3:
            return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else d


def label(domain: str) -> str:
    """Second-level label without TLD (e.g. 'infosys' for careers.infosys.com)."""
    reg = registrable(domain)
    for t in MULTI_TLDS:
        if reg.endswith("." + t):
            return reg[: -len(t) - 1]
    return reg.rsplit(".", 1)[0]


def normalise_label(lbl: str) -> str:
    s = lbl.lower()
    for a, b in SWAPS:
        s = s.replace(a, b)
    return s


def is_punycode(domain: str) -> bool:
    return any(p.startswith("xn--") for p in domain.lower().split("."))


def is_free_mail(domain: str) -> bool:
    return registrable(domain) in FREE_MAIL


def compare(sender_domain: str, official_domain: str) -> str:
    """Returns 'exact' | 'subdomain' | 'lookalike' | 'free_mail' | 'different'."""
    if not sender_domain:
        return "different"
    if is_free_mail(sender_domain):
        return "free_mail"
    if not official_domain:
        return "different"
    s_reg, o_reg = registrable(sender_domain), registrable(official_domain)
    if s_reg == o_reg:
        return "exact" if sender_domain.lower().removeprefix("www.") == official_domain.lower().removeprefix("www.") else "subdomain"
    if is_punycode(sender_domain):
        return "lookalike"
    s_lbl, o_lbl = label(sender_domain), label(official_domain)
    if s_lbl == o_lbl:  # same name, different TLD
        return "lookalike"
    stripped = s_lbl
    for suf in SUFFIXES:
        if stripped.endswith(suf) and stripped[: -len(suf)].rstrip("-") == o_lbl:
            return "lookalike"
        if stripped.startswith(suf.strip("-")) and stripped[len(suf.strip("-")):].lstrip("-") == o_lbl:
            return "lookalike"
    if normalise_label(s_lbl) == normalise_label(o_lbl):
        return "lookalike"
    if len(o_lbl) >= 4 and levenshtein(s_lbl, o_lbl) <= 2:
        return "lookalike"
    if len(o_lbl) >= 5 and o_lbl in s_lbl:
        return "lookalike"
    return "different"
