"""Deterministic rule engine. Haiku never decides the band."""
from app.pipeline.weights import BANDS

TOTAL = 12


def band_for(score: int) -> tuple[str, str]:
    for hi, band, lbl in BANDS:
        if score <= hi:
            return band, lbl
    return "red", "HIGH RISK"


def confidence_for(resolved: int, total: int = TOTAL) -> str:
    frac = resolved / total if total else 0
    if frac >= 0.75:
        return "high"
    if frac >= 0.5:
        return "medium"
    return "low"


def compute_verdict(signals: list[dict], *, is_final: bool, elapsed_ms: int, limited: bool) -> dict:
    """signals: list of Signal dicts (code, status, weight_applied, tags?)."""
    by = {s["code"]: s for s in signals}
    resolved = sum(1 for s in signals if s["status"] in ("pass", "fail"))
    raw = 50 + sum(int(s.get("weight_applied", 0)) for s in signals if s["status"] in ("pass", "fail"))
    score = max(0, min(100, raw))

    def failed(code: str) -> bool:
        return by.get(code, {}).get("status") == "fail"

    s1 = failed("S1")
    s2_lookalike = failed("S2") and "lookalike" in by.get("S2", {}).get("tags", [])
    if s1 and (s2_lookalike or failed("S5") or failed("S6")):
        score = max(score, 60)
    elif s1:
        score = max(score, 30)
    band, lbl = band_for(score)
    return {"score": score, "band": band, "label": lbl, "confidence": confidence_for(resolved),
            "resolved": resolved, "total": TOTAL, "is_final": is_final, "elapsed_ms": elapsed_ms, "limited": limited}
