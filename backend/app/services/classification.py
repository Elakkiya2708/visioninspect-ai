"""Rule-based defect type classification from region morphology + appearance.

Features come from the refined pixel mask of each detected region (see anomaly.extract_regions):
elongation, solidity, circularity, lightness/chroma contrast to the surrounding ring, edge density.
The taxonomy is intentionally small and maps onto the severity framework's type scores.
"""

TAXONOMY = {
    "Scratch": "Surface",
    "Crack": "Structural",
    "Hole / Missing Material": "Structural",
    "Dent / Deformation": "Structural",
    "Stain / Contamination": "Contamination",
    "Discoloration": "Cosmetic",
    "Surface Anomaly": "Surface",
}


def _c(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def classify_region(r: dict) -> dict:
    """Score every class in [0, 1] and pick the best. `edge_excess` (edge density inside the region
    minus its surroundings) is used instead of raw edge density so the rules work on both smooth
    and strongly textured surfaces."""
    el, sol, circ = r["elongation"], r["solidity"], r["circularity"]
    dL, dE, dC, area = r["dL"], r["dE"], r["dC"], r["area_ratio"]
    ee = max(r.get("edge_excess", 0.0), 0.0)
    heat_sol = r.get("heat_solidity", sol)
    soft = _c(1 - ee * 6)                   # 1 = smooth boundary/interior, 0 = many sharp edges
    compact = _c((2.6 - el) / 1.2)
    black = _c((48 - r.get("dark_L", 128.0)) / 25)   # region is near-black in absolute terms (voids)
    dark = _c((-dL - 30) / 30)
    jagged = _c((0.75 - sol) / 0.35)
    thin = 1.0 if r["minor_px"] < 15 else 0.6
    f_scratch = _c((el - 2.5) / 3.5)
    f_crack = _c((5.5 - el) / 3.0)

    s = {
        "Scratch": f_scratch * thin * (1 - 0.6 * dark * jagged),
        "Crack": dark * jagged * f_crack * _c((0.3 - circ) / 0.15 + 0.4),
        "Hole / Missing Material": max(_c((-dL - 30) / 40) * (0.35 + 0.65 * _c((ee + 0.05) / 0.2)), black)
                                   * _c((circ - 0.25) / 0.35) * _c((2.2 - el) / 1.0),
        "Stain / Contamination": compact * soft * max(_c((dC - 1.5) / 5), _c((dE - 22) / 20)) * _c(area / 0.006)
                                 * (1 - 0.8 * black),
        "Dent / Deformation": compact * soft * _c((heat_sol - 0.85) / 0.1) * _c((2.2 - dC) / 1.5)
                              * _c((26 - dE) / 14) * _c(area / 0.008),
        "Discoloration": soft * _c((dE - 5) / 15) * _c((area - 0.02) / 0.03) * _c((dC - 3) / 6),
    }
    name, score = max(s.items(), key=lambda kv: kv[1])
    if score < 0.15:
        name, score = "Surface Anomaly", 0.3
    total = sum(s.values()) + 1e-6
    type_conf = _c(0.4 + 0.6 * (score / total) * min(1.0, score * 1.5))
    return {"type": name, "category": TAXONOMY[name], "type_confidence": round(type_conf, 3),
            "type_scores": {k: round(v, 3) for k, v in s.items()}}
