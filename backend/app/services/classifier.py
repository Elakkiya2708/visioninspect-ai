"""Defect segmentation, localisation and type classification.

Turns the anomaly map into discrete defect regions and classifies each region
(Scratch / Crack / Hole / Stain / Dent / Surface Anomaly) from geometric and
photometric descriptors measured on the prepared image.
"""
from __future__ import annotations

import math

import cv2
import numpy as np
from skimage.morphology import skeletonize

from . import severity as sev

MIN_REGION_PX = 25


def _refine_mask(prepared: np.ndarray, coarse: np.ndarray) -> np.ndarray:
    """Crisp defect mask recovered from the smooth anomaly region.

    Two complementary cues are combined:
      * ring model  - deviation from the colour statistics of the surrounding ring
                      (good for blobs such as stains / holes),
      * local median - deviation from a sliding-median background (good for thin lines).
    """
    lab = cv2.cvtColor(prepared, cv2.COLOR_BGR2LAB)
    labf = lab.astype(np.float32)
    ys, xs = np.where(coarse)
    pad = 10
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, lab.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, lab.shape[1])
    window = np.zeros(coarse.shape, dtype=bool)
    window[y0:y1, x0:x1] = True
    ring = window & ~cv2.dilate(coarse.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
    if ring.sum() < 30:
        ring = ~coarse

    # A) ring-statistics z-score
    rp = labf[ring]
    med, sd = np.median(rp, axis=0), rp.std(axis=0) + 1.5
    z = np.sqrt((((labf - med) / sd) ** 2).mean(-1))
    z = cv2.GaussianBlur(z, (0, 0), 1.0)
    mask_a = z > 3.2

    # B) sliding-median deviation
    bg = np.dstack([cv2.medianBlur(lab[..., c], 31) for c in range(3)]).astype(np.float32)
    wgt = np.array([1.0, 1.6, 1.6], np.float32)
    dev = np.sqrt((((labf - bg) ** 2) * wgt).sum(-1))
    dev = cv2.GaussianBlur(dev, (0, 0), 0.8)
    mu, sdv = float(dev[ring].mean()), float(dev[ring].std())
    mask_b = dev > max(mu + 4.0 * sdv, 9.0)

    m = ((mask_a | mask_b) & window).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros(coarse.shape, dtype=bool)
    for i in range(1, n):
        comp = labels == i
        if stats[i][4] >= 6 and (comp & coarse).any():
            keep |= comp
    if keep.sum() < 12:
        return coarse
    return keep


def segment_regions(result: dict, min_px: int = MIN_REGION_PX) -> list[dict]:
    """Return detected regions (bbox, mask, peak score) from a detector result."""
    amap = result["anomaly_map"]
    thr = result["pixel_threshold"]
    img_thr = result["image_threshold"]
    prepared = result["prepared"]
    mask = (amap > thr).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    n, labels, stats, cents = cv2.connectedComponentsWithStats(mask, connectivity=8)
    regions = []
    for i in range(1, n):
        if stats[i][4] < min_px:
            continue
        comp = labels == i
        peak = float(amap[comp].max())
        core = _refine_mask(prepared, comp)
        ys, xs = np.where(core)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        regions.append({
            "bbox": (x0, y0, x1 - x0, y1 - y0),
            "mask": core,
            "peak": peak,
            "score": peak / img_thr,
        })
    regions.sort(key=lambda r: -r["score"])
    return regions


def _descriptors(img: np.ndarray, region: dict) -> dict:
    mask = region["mask"].astype(np.uint8)
    h, w = mask.shape
    area = float(mask.sum())
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    cnt = max(cnts, key=cv2.contourArea)
    per = cv2.arcLength(cnt, True)
    circ = float(4 * math.pi * area / (per * per + 1e-6))
    (rw, rh) = cv2.minAreaRect(cnt)[1]
    long_s, short_s = max(rw, rh, 1.0), max(min(rw, rh), 1.0)
    elong = long_s / short_s
    hull = cv2.convexHull(cnt)
    solidity = float(cv2.contourArea(cnt) / (cv2.contourArea(hull) + 1e-6))

    skel = skeletonize(mask > 0)
    skel_len = float(skel.sum())
    # centre-line length ~ half the contour perimeter for thin shapes; compare with the
    # straight extent (long side of the min-area rectangle): 1.0 = straight, >1.3 = wandering
    centre_len = max(per / 2.0 - short_s, 1.0)
    tortuosity = centre_len / long_s
    thickness = area / max(skel_len, 1.0)

    # photometric contrast against a ring of surrounding background
    dil = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    near = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    ring = (dil > 0) & (near == 0)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    inside = lab[mask > 0]
    if ring.sum() < 10:
        ring = mask == 0
    bg = lab[ring]
    d_l = float(inside[:, 0].mean() - bg[:, 0].mean())
    d_chroma = float(np.hypot(inside[:, 1].mean() - bg[:, 1].mean(), inside[:, 2].mean() - bg[:, 2].mean()))
    return {
        "area": area, "area_ratio": area / (h * w), "length_ratio": long_s / max(h, w),
        "circularity": circ, "elongation": elong, "solidity": solidity,
        "tortuosity": tortuosity, "thickness": thickness, "delta_l": d_l, "delta_chroma": d_chroma,
        "long_side": long_s, "short_side": short_s,
    }


def classify(d: dict) -> str:
    """Rule-based defect typing on region descriptors (measured on the refined mask)."""
    dark = d["delta_l"] < -40
    compact = d["solidity"] >= 0.8 and d["circularity"] >= 0.5 and d["elongation"] < 2.5
    thin = d["elongation"] >= 3.0 or (d["thickness"] <= 6.5 and d["long_side"] > 25)

    # 1. compact, very dark blob -> hole / missing component
    if compact and d["delta_l"] < -45:
        return "Hole / Missing Component"
    # 2. thin or ragged structures -> crack (dark / wandering) or scratch
    if thin or d["solidity"] < 0.68:
        if dark or d["tortuosity"] > 1.3:
            return "Crack"
        return "Scratch"
    # 3. foreign colour with little brightness change -> stain / contamination
    if d["delta_chroma"] > 9 or (d["delta_chroma"] > 6 and abs(d["delta_l"]) < 20):
        return "Stain / Contamination"
    if dark and d["area_ratio"] > 0.004:
        return "Hole / Missing Component"
    if d["area_ratio"] > 0.008:
        return "Dent / Deformation"
    return "Surface Anomaly"


def confidence_from_score(ratio: float) -> float:
    """Map (region peak / image threshold) -> 0-1 detection confidence (logistic)."""
    return float(1.0 / (1.0 + math.exp(-6.0 * (ratio - 0.95))))


def analyse_regions(prepared: np.ndarray, regions: list[dict]) -> list[dict]:
    """Classify + score every region. Returns serialisable defect dicts."""
    h, w = prepared.shape[:2]
    defects = []
    for r in regions:
        d = _descriptors(prepared, r)
        dtype = classify(d)
        x, y, bw, bh = r["bbox"]
        cx, cy = (x + bw / 2) / w, (y + bh / 2) / h
        conf = confidence_from_score(r["score"])
        s_size = sev.size_score(d["area_ratio"], d["length_ratio"])
        s_loc = sev.location_score(cx, cy)
        s_type = sev.type_score(dtype)
        s_conf = conf * 100.0
        score = sev.compute_severity(s_size, s_loc, s_type, s_conf)
        level, _ = sev.severity_level(score)
        defects.append({
            "defect_type": dtype,
            "bbox": [int(x), int(y), int(bw), int(bh)],
            "bbox_norm": [round(x / w, 4), round(y / h, 4), round(bw / w, 4), round(bh / h, 4)],
            "area_ratio": round(d["area_ratio"], 5),
            "size_score": round(s_size, 1),
            "location_score": round(s_loc, 1),
            "type_score": round(s_type, 1),
            "confidence": round(conf, 4),
            "severity_score": score,
            "severity_level": level,
            "needs_manual_review": conf < 0.70,
            "root_causes": sev.ROOT_CAUSES.get(dtype, []),
            "descriptors": {k: round(float(v), 3) for k, v in d.items()},
        })
    defects.sort(key=lambda x: -x["severity_score"])
    return defects
