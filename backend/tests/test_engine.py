"""Engine tests - run with `pytest` or `python tests/test_engine.py` (no web deps needed)."""
import sys, tempfile, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2, numpy as np
from app.services import synthetic, trainer, severity
from app.services.pipeline import inspect_image
from app.services.validation import validate_image


def test_severity_spec_example():
    score = severity.compute_severity(85, 90, 95, 92)
    assert abs(score - 90.2) < 0.05 and severity.level_for(score) == "Critical"


def test_validation_rejects_bad_files():
    img, rep = validate_image(b"not an image", "x.png")
    assert img is None and rep["errors"]
    img, rep = validate_image(b"abc", "x.gif")
    assert img is None and "Unsupported" in rep["errors"][0]


def test_train_and_detect():
    tmp = Path(tempfile.mkdtemp())
    synthetic.generate_dataset(tmp / "ds", styles=["metal_plate"], n_train=40, n_test_good=10, n_test_per_defect=6)
    model, m = trainer.train_category("demo_metal_plate", tmp / "ds", tmp / "m.npz", 1)
    print(m)
    assert m["evaluated"] and m["auroc"] > 0.9 and m["recall"] > 0.6 and m["false_alarm_rate"] < 0.35


def test_classifier_basic_shapes():
    from app.services.classification import classify_region
    base = dict(area_ratio=0.01, elongation=1.1, minor_px=30, solidity=1.0, circularity=0.9, dL=-60, dE=62, dC=4,
                edge_density=0.2, edge_excess=0.2, heat_solidity=1.0, boundary_sharpness=0.6, mean_L=40, dark_L=15)
    assert classify_region(base)["type"] == "Hole / Missing Material"
    scratch = dict(base, elongation=12, minor_px=3, solidity=0.9, circularity=0.1, dL=30, dE=30, dC=1, mean_L=180, dark_L=150)
    assert classify_region(scratch)["type"] == "Scratch"
    crack = dict(base, elongation=3.5, minor_px=12, solidity=0.4, circularity=0.1, dL=-70, dE=72, dC=2, mean_L=60, dark_L=40)
    assert classify_region(crack)["type"] == "Crack"


def test_decision_rules():
    d = severity.decide([])
    assert d["decision"] == "PASS" and d["severity_level"] == "None"
    low_conf = [dict(type="Scratch", severity_score=20, severity_level="Low", confidence=0.5)]
    assert severity.decide(low_conf)["decision"] == "REVIEW"
    crit = [dict(type="Crack", severity_score=90, severity_level="Critical", confidence=0.95)]
    assert severity.decide(crit)["decision"] == "REJECT"
    assert severity.level_for(79.9) == "High" and severity.level_for(40) == "Medium" and severity.level_for(39.9) == "Low"


if __name__ == "__main__":
    test_severity_spec_example(); test_validation_rejects_bad_files(); test_train_and_detect()
    test_classifier_basic_shapes(); test_decision_rules(); print("ALL OK")
