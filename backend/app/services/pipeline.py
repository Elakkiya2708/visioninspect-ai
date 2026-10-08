"""End-to-end inspection pipeline: validate -> quality -> preprocess -> detect -> classify -> score -> decide."""
import time

import cv2
import numpy as np

from . import anomaly, classification, severity
from .preprocessing import MODEL_SIZE, extract_global_features, preprocess, resize_keep_aspect
from .quality import analyze_quality
from .validation import validate_image

LEVEL_COLORS = {"Critical": (60, 60, 230), "High": (40, 140, 245), "Medium": (30, 200, 240), "Low": (120, 200, 90)}


def _jpg(img, q=90):
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
    return buf.tobytes()


def render_heatmap(display, norm_map):
    h, w = display.shape[:2]
    m = cv2.resize(norm_map, (w, h), interpolation=cv2.INTER_CUBIC)
    heat = cv2.applyColorMap(np.clip(m / 2.0 * 255, 0, 255).astype(np.uint8), cv2.COLORMAP_TURBO)
    alpha = np.clip(m / 1.6, 0, 1)[..., None] * 0.7
    return (display * (1 - alpha) + heat * alpha).astype(np.uint8)


def render_overlay(display, defects):
    out = display.copy()
    h, w = out.shape[:2]
    for i, d in enumerate(defects, 1):
        x, y, bw, bh = d["bbox"]
        p1, p2 = (int(x * w), int(y * h)), (int((x + bw) * w), int((y + bh) * h))
        col = LEVEL_COLORS.get(d["severity_level"], (200, 200, 200))
        cv2.rectangle(out, p1, p2, col, 2, cv2.LINE_AA)
        label = f"{i}. {d['type'].split(' /')[0]} {int(d['confidence'] * 100)}%"
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
        ty = max(p1[1], th + 6)
        cv2.rectangle(out, (p1[0], ty - th - 6), (p1[0] + tw + 6, ty), col, -1)
        cv2.putText(out, label, (p1[0] + 3, ty - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    return out


def inspect_image(data: bytes, filename: str, model=None, max_mb: int = 20):
    """Run the full pipeline. `model` is an AnomalyModel or None (baseline). Returns a result dict."""
    t0 = time.perf_counter()
    img, validation = validate_image(data, filename, max_mb)
    if img is None:
        return {"validation": validation, "error": "; ".join(validation["errors"])}

    t = time.perf_counter()
    quality = analyze_quality(img)
    t_quality = time.perf_counter() - t

    proc, steps = preprocess(img, MODEL_SIZE)
    features = extract_global_features(proc)
    display = resize_keep_aspect(img, 640)

    t = time.perf_counter()
    engine = model if model is not None else anomaly.BaselineModel(MODEL_SIZE)
    norm_map = engine.predict_map(proc)
    regions = anomaly.extract_regions(norm_map, proc)
    t_detect = time.perf_counter() - t

    defects = []
    for r in regions:
        cls = classification.classify_region(r)
        conf = severity.detection_confidence(r["peak"], cls["type_confidence"])
        sc = severity.score_defect(r, cls, conf)
        defects.append({
            "type": cls["type"], "category": cls["category"], "type_confidence": cls["type_confidence"],
            "bbox": [round(v, 4) for v in r["bbox"]], "area_ratio": round(r["area_ratio"], 5),
            "confidence": conf, "peak": round(r["peak"], 3), **sc,
        })
    defects.sort(key=lambda d: -d["severity_score"])
    verdict = severity.decide(defects)

    mode = "trained" if model is not None else "baseline"
    return {
        "validation": validation, "quality": quality, "features": features,
        "preprocessing": {"steps": steps, "input_size": MODEL_SIZE},
        "model": {"name": engine.name, "mode": mode, "threshold": round(float(getattr(engine, "threshold", 1.0)), 4)},
        "anomaly_score": round(float(norm_map.max()), 3), "is_anomalous": bool(defects),
        "defects": defects, **verdict,
        "images": {"original": _jpg(display), "processed": _jpg(proc),
                   "heatmap": _jpg(render_heatmap(display, norm_map)),
                   "overlay": _jpg(render_overlay(display, defects))},
        "size": {"width": int(img.shape[1]), "height": int(img.shape[0])},
        "timings": {"quality_ms": round(t_quality * 1000), "detection_ms": round(t_detect * 1000)},
        "processing_ms": round((time.perf_counter() - t0) * 1000),
    }
