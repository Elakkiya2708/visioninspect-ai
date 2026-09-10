"""
Milestone 2 — Defect Detection Module:
  anomaly detection, defect localization, and defect predictions.

Technique: reference-image (golden-sample) differencing — the same
principle real Automated Optical Inspection (AOI) machines use on
production lines. This is a classical computer-vision pipeline, not a
trained neural network — it needs no dataset or GPU and works
immediately once a reference image exists for a product line.
"""
from dataclasses import dataclass, field

import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim

from app.vision.preprocessing import preprocess

MIN_DEFECT_AREA_RATIO = 0.0008
MIN_MEANINGFUL_SIMILARITY = 0.15


@dataclass
class DefectRegion:
    x: int
    y: int
    width: int
    height: int
    area_ratio: float

    def to_dict(self) -> dict:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "area_ratio": round(self.area_ratio, 5),
        }


@dataclass
class DefectAnalysisResult:
    similarity_score: float
    defect_count: int
    total_affected_area_pct: float
    regions: list[DefectRegion] = field(default_factory=list)
    verdict: str = "pass"

    def to_dict(self) -> dict:
        return {
            "similarity_score": round(self.similarity_score, 4),
            "defect_count": self.defect_count,
            "total_affected_area_pct": round(self.total_affected_area_pct, 3),
            "regions": [r.to_dict() for r in self.regions],
            "verdict": self.verdict,
        }


def _align_size(reference: np.ndarray, test: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Resizes the test image to the reference's dimensions so a
    pixel-for-pixel structural comparison is meaningful."""
    h, w = reference.shape[:2]
    test_resized = cv2.resize(test, (w, h), interpolation=cv2.INTER_AREA)
    return reference, test_resized


def detect_defects(reference_img: np.ndarray, test_img: np.ndarray) -> DefectAnalysisResult:
    """
    Compares `test_img` against a known-good `reference_img` and returns
    the regions that differ enough to be flagged as possible defects.
    """
    reference_img = preprocess(reference_img)
    test_img = preprocess(test_img)
    reference_img, test_img = _align_size(reference_img, test_img)

    ref_gray = cv2.cvtColor(reference_img, cv2.COLOR_BGR2GRAY)
    test_gray = cv2.cvtColor(test_img, cv2.COLOR_BGR2GRAY)

    similarity, diff = ssim(ref_gray, test_gray, full=True)
    diff = (1 - diff) * 255
    diff = diff.astype("uint8")

    if similarity < MIN_MEANINGFUL_SIMILARITY:
        return DefectAnalysisResult(
            similarity_score=float(similarity),
            defect_count=0,
            total_affected_area_pct=0.0,
            regions=[],
            verdict="inconclusive",
        )

    _, thresh = cv2.threshold(diff, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    kernel = np.ones((5, 5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    h, w = ref_gray.shape[:2]
    total_area = h * w
    regions: list[DefectRegion] = []

    for c in contours:
        x, y, cw, ch = cv2.boundingRect(c)
        area_ratio = (cw * ch) / total_area
        if area_ratio >= MIN_DEFECT_AREA_RATIO:
            regions.append(DefectRegion(x=x, y=y, width=cw, height=ch, area_ratio=area_ratio))

    regions.sort(key=lambda r: -r.area_ratio)

    total_affected_pct = sum(r.area_ratio for r in regions) * 100
    verdict = "fail" if regions else "pass"

    return DefectAnalysisResult(
        similarity_score=float(similarity),
        defect_count=len(regions),
        total_affected_area_pct=total_affected_pct,
        regions=regions,
        verdict=verdict,
    )
