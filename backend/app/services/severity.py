"""Severity scoring framework + quality-control decisions (spec section 4.5 / 4.6)."""
import math

WEIGHTS = {"size": 0.30, "location": 0.25, "type": 0.25, "confidence": 0.20}

TYPE_SCORE = {
    "Scratch": 30, "Stain / Contamination": 40, "Discoloration": 30,
    "Dent / Deformation": 65, "Hole / Missing Material": 90, "Crack": 95, "Surface Anomaly": 50,
}

ROOT_CAUSE = {
    "Scratch": "Handling or conveyor contact - inspect fixtures, gripper pads and packaging.",
    "Crack": "Thermal or mechanical stress / material fatigue - review process temperature, press force and raw-material batch.",
    "Hole / Missing Material": "Tool wear or drilling/feeding misalignment - check tooling, fixtures and feeders.",
    "Dent / Deformation": "Impact during handling or press misalignment - inspect transfer points and die alignment.",
    "Stain / Contamination": "Lubricant/coolant leakage or dust ingress - inspect cleaning station and line hygiene.",
    "Discoloration": "Curing/oven temperature drift or coating inconsistency - verify process parameters.",
    "Surface Anomaly": "Unclassified anomaly - route to a quality engineer for root-cause analysis.",
}


def size_score(area_ratio: float) -> float:
    return round(min(100.0, 20 + 80 * math.sqrt(max(area_ratio, 0) / 0.04)), 1)


def location_score(cx: float, cy: float) -> float:
    """Centre of the part = functional area (high impact); border = cosmetic (lower impact)."""
    d = max(abs(cx - 0.5), abs(cy - 0.5)) * 2
    return round(95 - 60 * min(d, 1.0), 1)


def level_for(score: float) -> str:
    return "Critical" if score >= 80 else "High" if score >= 60 else "Medium" if score >= 40 else "Low"


def compute_severity(size, location, dtype, confidence):
    """All four inputs on a 0-100 scale. Returns rounded weighted score."""
    return round(size * WEIGHTS["size"] + location * WEIGHTS["location"]
                 + dtype * WEIGHTS["type"] + confidence * WEIGHTS["confidence"], 1)


def score_defect(region: dict, cls: dict, confidence: float) -> dict:
    sz = size_score(region["area_ratio"])
    loc = location_score(*region["centroid"])
    ty = float(TYPE_SCORE.get(cls["type"], 50))
    cf = round(confidence * 100, 1)
    total = compute_severity(sz, loc, ty, cf)
    return {"size_score": sz, "location_score": loc, "type_score": ty, "confidence_score": cf,
            "severity_score": total, "severity_level": level_for(total)}


def detection_confidence(peak: float, type_conf: float) -> float:
    det = 0.5 + 0.5 * math.tanh(3.0 * (peak - 1.0))
    return round(min(0.999, 0.75 * det + 0.25 * type_conf), 3)


def decide(defects: list, review_conf: float = 0.70) -> dict:
    """Aggregate per-defect scores into the part-level QC decision."""
    if not defects:
        return {"severity_score": 0.0, "severity_level": "None", "decision": "PASS", "needs_review": False,
                "recommendation": "No defects detected. Product approved for the next stage.", "root_cause": None}
    top = max(defects, key=lambda d: d["severity_score"])
    level = top["severity_level"]
    low_conf = any(d["confidence"] < review_conf for d in defects)
    decision = {"Critical": "REJECT", "High": "REWORK", "Medium": "REVIEW", "Low": "PASS"}[level]
    if decision == "PASS" and low_conf:
        decision = "REVIEW"
    recs = {
        "REJECT": f"Reject product and trigger the quality inspection workflow ({top['type']}, severity {top['severity_score']}).",
        "REWORK": f"Send for repair/rework: {top['type']} of high severity ({top['severity_score']}).",
        "REVIEW": "Route to a quality engineer for manual inspection review"
                  + (" - one or more detections are below the 70% confidence threshold." if low_conf else "."),
        "PASS": f"Minor cosmetic defect ({top['type']}). Product generally acceptable.",
    }
    return {"severity_score": top["severity_score"], "severity_level": level, "decision": decision,
            "needs_review": decision == "REVIEW" or low_conf,
            "recommendation": recs[decision], "root_cause": ROOT_CAUSE.get(top["type"])}
