"""CVSS 3.1 base score calculation (FIRST specification, section 7).

Used by validate.py (score must match the vector) and build_dashboard_data.py (risk plot sub-scores).
"""
import math

WEIGHTS = {
    "AV": {"N": 0.85, "A": 0.62, "L": 0.55, "P": 0.2},
    "AC": {"L": 0.77, "H": 0.44},
    "UI": {"N": 0.85, "R": 0.62},
    "CIA": {"H": 0.56, "L": 0.22, "N": 0.0},
}
PR_WEIGHTS = {"U": {"N": 0.85, "L": 0.62, "H": 0.27}, "C": {"N": 0.85, "L": 0.68, "H": 0.5}}
REQUIRED = ["AV", "AC", "PR", "UI", "S", "C", "I", "A"]


def roundup(value):
    """Round up to one decimal as defined in CVSS 3.1 Appendix A (avoids floating point artefacts)."""
    as_int = round(value * 100000)
    if as_int % 10000 == 0:
        return as_int / 100000.0
    return (math.floor(as_int / 10000) + 1) / 10.0


def parse_vector(vector):
    """Return a dict of base metrics, or raise ValueError with a readable message."""
    if not isinstance(vector, str) or not vector.startswith("CVSS:3.1/"):
        raise ValueError("vector must start with 'CVSS:3.1/'")
    metrics = {}
    for part in vector[len("CVSS:3.1/"):].split("/"):
        if ":" not in part:
            raise ValueError(f"invalid part '{part}'")
        key, value = part.split(":", 1)
        metrics[key] = value
    missing = [k for k in REQUIRED if k not in metrics]
    if missing:
        raise ValueError(f"missing base metrics: {', '.join(missing)}")
    checks = {
        "AV": WEIGHTS["AV"], "AC": WEIGHTS["AC"], "UI": WEIGHTS["UI"], "PR": PR_WEIGHTS["U"],
        "S": {"U": 0, "C": 0}, "C": WEIGHTS["CIA"], "I": WEIGHTS["CIA"], "A": WEIGHTS["CIA"],
    }
    for key, allowed in checks.items():
        if metrics[key] not in allowed:
            raise ValueError(f"{key}:{metrics[key]} is not a valid value")
    return metrics


def score(vector):
    """Return {'base', 'impact', 'exploitability'} for a CVSS 3.1 vector."""
    m = parse_vector(vector)
    scope_changed = m["S"] == "C"
    iss = 1 - (1 - WEIGHTS["CIA"][m["C"]]) * (1 - WEIGHTS["CIA"][m["I"]]) * (1 - WEIGHTS["CIA"][m["A"]])
    if scope_changed:
        impact = 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15
    else:
        impact = 6.42 * iss
    exploitability = (
        8.22 * WEIGHTS["AV"][m["AV"]] * WEIGHTS["AC"][m["AC"]]
        * PR_WEIGHTS[m["S"]][m["PR"]] * WEIGHTS["UI"][m["UI"]]
    )
    if impact <= 0:
        base = 0.0
    elif scope_changed:
        base = roundup(min(1.08 * (impact + exploitability), 10))
    else:
        base = roundup(min(impact + exploitability, 10))
    return {
        "base": base,
        "impact": round(max(impact, 0.0), 1),
        "exploitability": round(exploitability, 1),
    }
