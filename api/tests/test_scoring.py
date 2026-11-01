from app.pipeline.scoring import band_for, compute_verdict, confidence_for


def sig(code, status, w=0, tags=None):
    return {"code": code, "status": status, "weight_applied": w, "tags": tags or []}


def v(signals):
    return compute_verdict(signals, is_final=True, elapsed_ms=1, limited=False)


def test_bands():
    assert band_for(0) == ("green", "LIKELY GENUINE")
    assert band_for(29)[0] == "green"
    assert band_for(30)[0] == "amber"
    assert band_for(59)[0] == "amber"
    assert band_for(60) == ("red", "HIGH RISK")
    assert band_for(100)[0] == "red"


def test_base_score_and_clamp():
    assert v([])["score"] == 50
    assert v([sig("S1", "fail", 40), sig("S2", "fail", 30), sig("S3", "fail", 30)])["score"] == 100
    assert v([sig("S2", "pass", -30), sig("S7", "pass", -10), sig("S8", "pass", -20)])["score"] == 0


def test_unknown_and_pending_ignored():
    assert v([sig("S3", "unknown", 30), sig("S6", "pending", 40)])["score"] == 50


def test_hard_rule_s1_at_least_amber():
    out = v([sig("S1", "fail", 40), sig("S2", "pass", -30), sig("S7", "pass", -10), sig("S8", "pass", -20), sig("S3", "pass", -10)])
    assert out["score"] >= 30 and out["band"] == "amber"


def test_hard_rule_s1_plus_lookalike_red():
    out = v([sig("S1", "fail", 40), sig("S2", "fail", 30, ["lookalike"]), sig("S7", "pass", -10), sig("S8", "pass", -20), sig("S3", "pass", -10), sig("S6", "pass", -5)])
    assert out["band"] == "red"


def test_hard_rule_s1_plus_freemail_not_forced_red():
    out = v([sig("S1", "fail", 40), sig("S2", "fail", 15, ["free_mail"]), sig("S7", "pass", -10), sig("S8", "pass", -20), sig("S3", "pass", -10), sig("S4", "pass", 0), sig("S6", "pass", -5), sig("S12", "pass", 0)])
    assert out["score"] == 60 or out["band"] in ("amber", "red")
    assert out["score"] == max(30, 50 + 40 + 15 - 10 - 20 - 10 - 5)


def test_hard_rule_s1_plus_s5_or_s6_red():
    assert v([sig("S1", "fail", 40), sig("S5", "fail", 25), sig("S2", "pass", -30), sig("S8", "pass", -20)])["band"] == "red"
    assert v([sig("S1", "fail", 40), sig("S6", "fail", 40), sig("S2", "pass", -30), sig("S8", "pass", -20), sig("S7", "pass", -10)])["band"] == "red"


def test_confidence():
    assert confidence_for(12) == "high"
    assert confidence_for(9) == "high"
    assert confidence_for(6) == "medium"
    assert confidence_for(5) == "low"
    out = v([sig(f"S{i}", "pass") for i in range(1, 10)] + [sig("S10", "unknown")])
    assert out["resolved"] == 9 and out["confidence"] == "high" and out["total"] == 12


def test_legit_offer_green():
    out = v([sig("S1", "pass"), sig("S2", "pass", -30), sig("S3", "pass", -10), sig("S7", "pass", -10), sig("S8", "pass", -20)])
    assert out["band"] == "green"


def test_could_not_verify_on_thin_evidence():
    out = v([sig("S1", "pass"), sig("S9", "pass"), sig("S10", "pass")] + [sig(f"S{i}", "unknown") for i in (2, 3, 4, 5, 6, 7, 8, 11, 12)])
    assert out["band"] == "grey" and out["label"] == "COULD NOT VERIFY"
    prelim = compute_verdict([sig("S1", "pass")], is_final=False, elapsed_ms=1, limited=False)
    assert prelim["band"] == "amber"  # only final verdicts use the grey outcome


def test_judge_delta_is_bounded_and_respects_floors():
    sigs = [sig("S1", "fail", 40), sig("S2", "fail", 30, ["lookalike"])]
    j = {"band": "green", "score": 0, "confidence": "high", "reasoning": "x", "misreads": [], "verified_facts": []}
    out = compute_verdict(sigs, is_final=True, elapsed_ms=1, limited=False, judge=j)
    assert out["rule_score"] == 100 and out["score"] == 75 and out["band"] == "red"
    assert out["judge"]["applied_delta"] == -25
    thin = [sig("S1", "fail", 40)]
    j2 = {"band": "green", "score": 10, "confidence": "high", "reasoning": "fired on platform text", "misreads": [{"signal": "S1", "reason": "Premium for ₹0"}], "verified_facts": []}
    out2 = compute_verdict(thin, is_final=True, elapsed_ms=1, limited=False, judge=j2)
    assert out2["score"] == 65  # floor lifted because S1 was argued as a misread, but delta still capped at 25
