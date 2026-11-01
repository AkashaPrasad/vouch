"""All scoring weights in one place. Positive = red (risk), negative = green (reassuring)."""

SIGNAL_NAMES = {
    "S1": "Money asked",
    "S2": "Sender domain",
    "S3": "Domain age",
    "S4": "Mail & web records",
    "S5": "Scam reports",
    "S6": "Cybercrime suspect registry (Agent)",
    "S7": "Company registry (MCA)",
    "S8": "Role on careers page",
    "S9": "Contact channel",
    "S10": "Pressure & too-good-to-be-true",
    "S11": "Site consistency",
    "S12": "URL reputation",
}

W = {
    "S1_money": 40,
    "S2_lookalike": 30,
    "S2_freemail": 15,
    "S2_exact": -30,
    "S3_lt30": 30,
    "S3_lt180": 20,
    "S3_gt3y": -10,
    "S4_no_mx": 15,
    "S5_reports": 25,
    "S6_hit": 40,
    "S6_clean": -5,
    "S7_not_found": 20,
    "S7_struck_off": 30,
    "S7_active": -10,
    "S8_not_listed": 10,
    "S8_listed": -20,
    "S9_offplatform": 10,
    "S10_pressure": 10,
    "S11_inconsistent": 15,
    "S12_hit": 30,
}

BANDS = [(29, "green", "LIKELY GENUINE"), (59, "amber", "BE CAREFUL"), (100, "red", "HIGH RISK")]
