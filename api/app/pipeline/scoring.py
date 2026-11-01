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


MAX_JUDGE_DELTA = 25


def compute_verdict(signals: list[dict], *, is_final: bool, elapsed_ms: int, limited: bool, judge: dict | None = None) -> dict:
    """signals: list of Signal dicts (code, status, weight_applied, tags?).
    `judge` is Claude's reasoned second opinion; it may move the score by at most MAX_JUDGE_DELTA and never below a hard-rule floor."""
    by = {s["code"]: s for s in signals}
    resolved = sum(1 for s in signals if s["status"] in ("pass", "fail"))
    raw = 50 + sum(int(s.get("weight_applied", 0)) for s in signals if s["status"] in ("pass", "fail"))
    score = max(0, min(100, raw))

    def failed(code: str) -> bool:
        return by.get(code, {}).get("status") == "fail"

    s1 = failed("S1")
    s2_tags = set(by.get("S2", {}).get("tags", []))
    s2_lookalike = failed("S2") and bool(s2_tags & {"lookalike", "impersonation"})
    s10_tags = set(by.get("S10", {}).get("tags", []))
    task_or_mule = failed("S10") and bool(s10_tags & {"task_scam", "money_mule"})
    floor = 0
    if s1 and (s2_lookalike or failed("S5") or failed("S6") or task_or_mule):
        floor = 60
    elif s1 or task_or_mule:
        floor = 30
    rule_score = max(score, floor)
    score = rule_score
    judge_out = None
    if judge and isinstance(judge.get("score"), int):
        # Claude's read: bounded adjustment, reasons required, hard-rule floors respected.
        misread_codes = {m.get("signal") for m in judge.get("misreads") or []}
        eff_floor = floor
        if "S1" in misread_codes and judge.get("reasoning"):
            eff_floor = 0  # Claude argues the money signal fired on the wrong text; the floor no longer applies
        delta = max(-MAX_JUDGE_DELTA, min(MAX_JUDGE_DELTA, int(judge["score"]) - rule_score))
        score = max(0, min(100, max(eff_floor, rule_score + delta)))
        judge_out = {"band": judge.get("band"), "score": int(judge["score"]), "confidence": judge.get("confidence"),
                     "reasoning": str(judge.get("reasoning", ""))[:1500], "misreads": judge.get("misreads") or [],
                     "verified_facts": judge.get("verified_facts") or [], "applied_delta": score - rule_score}
    band, lbl = band_for(score)
    # Honest fourth outcome: too little evidence to say either way. Never call a listing risky on thin evidence.
    strong_red = any(s["status"] == "fail" and int(s.get("weight_applied", 0)) >= 20 for s in signals)
    strong_green = any(s["status"] == "pass" and int(s.get("weight_applied", 0)) <= -20 for s in signals)
    if is_final and not strong_red and not strong_green and resolved <= 4 and 30 <= score <= 59:
        band, lbl = "grey", "COULD NOT VERIFY"
    return {"score": score, "band": band, "label": lbl, "confidence": confidence_for(resolved),
            "resolved": resolved, "total": TOTAL, "is_final": is_final, "elapsed_ms": elapsed_ms, "limited": limited,
            "rule_score": rule_score, "judge": judge_out}
