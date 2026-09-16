"""
Milestone 3 — Defect Classification & Severity Scoring.

Two jobs:

1. Classify each detected defect region into a defect *type*, using the
   region's geometry and pixel statistics (aspect ratio, area, edge
   density, intensity difference vs the reference). These are classical
   computer-vision heuristics, not a trained classifier — honest about
   what they are, and they work with zero labelled training data.

2. Score each defect's severity using the weighted framework from the
   project specification:

       Severity = (Size x 30%) + (Location x 25%)
                + (Defect Type x 25%) + (Confidence x 20%)

   Levels: Critical 80-100, High 60-79, Medium 40-59, Low 0-39.
"""
from dataclasses import dataclass

import cv2
import numpy as np

# ---------------------------------------------------------------------
# Defect taxonomy. `base_severity` is the "Defect Type" component of the
# severity formula (0-100) — how serious this category is in principle,
# before size/location/confidence are taken into account.
# ---------------------------------------------------------------------
DEFECT_TYPES: dict[str, dict] = {
    "crack":             {"label": "Crack",              "base_severity": 95},
    "missing_component": {"label": "Missing Component",  "base_severity": 90},
    "deformation":       {"label": "Deformation",        "base_severity": 75},
    "contamination":     {"label": "Contamination",      "base_severity": 55},
    "discoloration":     {"label": "Discoloration",      "base_severity": 45},
    "scratch":           {"label": "Surface Scratch",    "base_severity": 35},
}

SEVERITY_WEIGHTS = {"size": 0.30, "location": 0.25, "defect_type": 0.25, "confidence": 0.20}


@dataclass
class ClassifiedDefect:
    x: int
    y: int
    width: int
    height: int
    area_ratio: float

    defect_type: str
    defect_label: str
    confidence: float          # 0-100, model confidence in this classification

    size_score: float          # 0-100, each an input to the severity formula
    location_score: float
    type_score: float
    confidence_score: float

    severity_score: float      # 0-100, weighted result
    severity_level: str        # Critical | High | Medium | Low
    recommended_action: str

    def to_dict(self) -> dict:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "area_ratio": round(self.area_ratio, 5),
            "defect_type": self.defect_type,
            "defect_label": self.defect_label,
            "confidence": round(self.confidence, 2),
            "size_score": round(self.size_score, 2),
            "location_score": round(self.location_score, 2),
            "type_score": round(self.type_score, 2),
            "confidence_score": round(self.confidence_score, 2),
            "severity_score": round(self.severity_score, 2),
            "severity_level": self.severity_level,
            "recommended_action": self.recommended_action,
        }


def severity_level_for(score: float) -> str:
    if score >= 80:
        return "Critical"
    if score >= 60:
        return "High"
    if score >= 40:
        return "Medium"
    return "Low"


def recommended_action_for(level: str) -> str:
    return {
        "Critical": "Reject product and trigger quality inspection workflow",
        "High": "Repair or rework recommended before dispatch",
        "Medium": "Flag for manual inspection review",
        "Low": "Minor cosmetic defect — product generally acceptable",
    }[level]


def _size_score(area_ratio: float) -> float:
    """Defect area as a fraction of the product image, mapped to 0-100.
    Anything covering 15%+ of the surface is treated as maximally large."""
    return float(min(100.0, (area_ratio / 0.15) * 100.0))


def _location_score(x: int, y: int, w: int, h: int, img_w: int, img_h: int) -> float:
    """
    Critical-area weighting. Without a per-product map of which zones are
    functional vs cosmetic, the centre of the product is treated as the
    functional area and the outer edge as cosmetic — a defect dead-centre
    scores 100, one at the extreme corner scores ~30.
    """
    cx, cy = x + w / 2, y + h / 2
    norm_dx = abs(cx - img_w / 2) / (img_w / 2)
    norm_dy = abs(cy - img_h / 2) / (img_h / 2)
    distance = min(1.0, (norm_dx ** 2 + norm_dy ** 2) ** 0.5 / (2 ** 0.5))
    return float(30 + (1 - distance) * 70)


def _classify_region(
    ref_gray: np.ndarray,
    test_gray: np.ndarray,
    x: int,
    y: int,
    w: int,
    h: int,
) -> tuple[str, float]:
    """
    Decides a defect type from the region's shape and pixel statistics.
    Returns (defect_type_key, confidence 0-100).
    """
    ref_patch = ref_gray[y : y + h, x : x + w]
    test_patch = test_gray[y : y + h, x : x + w]
    if ref_patch.size == 0 or test_patch.size == 0:
        return "contamination", 50.0

    aspect = max(w, h) / max(1, min(w, h))          # elongation
    area = w * h
    img_area = ref_gray.shape[0] * ref_gray.shape[1]
    area_frac = area / img_area

    mean_diff = float(np.mean(test_patch.astype(np.int16) - ref_patch.astype(np.int16)))
    abs_mean_diff = abs(mean_diff)

    # Edge density inside the region: cracks and scratches are thin, highly
    # linear features and produce far more edge pixels than a smudge or a
    # flat colour shift does.
    edges = cv2.Canny(test_patch, 60, 160)
    edge_density = float(np.count_nonzero(edges)) / max(1, area)

    # --- rules, ordered most-specific first ---
    if area_frac > 0.12 and abs_mean_diff > 45:
        # A large region that also changed brightness dramatically: a whole
        # part of the product is absent.
        return "missing_component", float(min(95, 60 + abs_mean_diff * 0.5))

    if aspect >= 4.0 and edge_density > 0.08:
        # Long, thin, sharply-edged.
        return "crack", float(min(95, 65 + aspect * 3 + edge_density * 100))

    if aspect >= 3.0:
        # Long and thin but softer edges — a surface scratch.
        return "scratch", float(min(92, 60 + aspect * 4))

    if area_frac > 0.06 and edge_density < 0.05:
        # Big, smooth, low-edge region: the shape itself has changed.
        return "deformation", float(min(90, 55 + area_frac * 150))

    if abs_mean_diff < 25 and edge_density < 0.04:
        # Subtle, flat, uniform shift — a colour/finish problem.
        return "discoloration", float(min(88, 55 + (25 - abs_mean_diff) * 1.2))

    return "contamination", float(min(85, 50 + abs_mean_diff * 0.6))


def classify_and_score(
    ref_gray: np.ndarray,
    test_gray: np.ndarray,
    regions: list,
) -> list[ClassifiedDefect]:
    """
    Runs classification + severity scoring over the regions produced by
    the Milestone 2 detector. `regions` items must expose x, y, width,
    height and area_ratio.
    """
    img_h, img_w = ref_gray.shape[:2]
    results: list[ClassifiedDefect] = []

    for r in regions:
        defect_type, confidence = _classify_region(ref_gray, test_gray, r.x, r.y, r.width, r.height)
        meta = DEFECT_TYPES[defect_type]

        size_score = _size_score(r.area_ratio)
        location_score = _location_score(r.x, r.y, r.width, r.height, img_w, img_h)
        type_score = float(meta["base_severity"])
        confidence_score = confidence

        severity = (
            size_score * SEVERITY_WEIGHTS["size"]
            + location_score * SEVERITY_WEIGHTS["location"]
            + type_score * SEVERITY_WEIGHTS["defect_type"]
            + confidence_score * SEVERITY_WEIGHTS["confidence"]
        )
        level = severity_level_for(severity)

        results.append(
            ClassifiedDefect(
                x=r.x,
                y=r.y,
                width=r.width,
                height=r.height,
                area_ratio=r.area_ratio,
                defect_type=defect_type,
                defect_label=meta["label"],
                confidence=confidence,
                size_score=size_score,
                location_score=location_score,
                type_score=type_score,
                confidence_score=confidence_score,
                severity_score=severity,
                severity_level=level,
                recommended_action=recommended_action_for(level),
            )
        )

    # Most severe first — that's the one a quality engineer acts on.
    results.sort(key=lambda d: -d.severity_score)
    return results
