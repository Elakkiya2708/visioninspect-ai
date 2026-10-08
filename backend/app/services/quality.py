"""Image quality analysis report (Milestone 2)."""
import cv2
import numpy as np


def analyze_quality(img_bgr):
    h0, w0 = img_bgr.shape[:2]
    s = 1024 / max(h0, w0)
    img = cv2.resize(img_bgr, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else img_bgr
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)

    lap_var = float(cv2.Laplacian(gray, cv2.CV_32F).var())
    sharp = float(np.clip(np.log10(lap_var + 1) / 2.5, 0, 1) * 100)

    mean_b = float(gray.mean())
    bright = float(100 - abs(mean_b - 127) / 127 * 100)

    std_c = float(gray.std())
    contrast = float(min(100, std_c / 25 * 100))

    k = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], np.float32)
    hh, ww = gray.shape
    sigma = float(np.sqrt(np.pi / 2) / (6 * (ww - 2) * (hh - 2)) * np.abs(cv2.filter2D(gray, -1, k)).sum())
    noise = float(np.clip(100 - sigma / 8 * 100, 0, 100))

    dark_clip = float((gray <= 5).mean() * 100)
    bright_clip = float((gray >= 250).mean() * 100)
    exposure = float(np.clip(100 - (dark_clip + bright_clip) * 4, 0, 100))

    overall = 0.35 * sharp + 0.2 * bright + 0.15 * contrast + 0.2 * noise + 0.1 * exposure
    grade = "A" if overall >= 80 else "B" if overall >= 65 else "C" if overall >= 50 else "D"

    warnings = []
    if sharp < 45:
        warnings.append("Image appears blurry - re-capture with better focus.")
    if mean_b < 60:
        warnings.append("Image is under-exposed. Increase lighting.")
    elif mean_b > 200:
        warnings.append("Image is over-exposed. Reduce lighting or exposure time.")
    if std_c < 6:
        warnings.append("Very low contrast - defects may be hard to detect.")
    if sigma > 6:
        warnings.append("High sensor noise detected.")
    if dark_clip + bright_clip > 8:
        warnings.append("Significant clipped pixels (crushed shadows or blown highlights).")

    return {
        "overall": round(overall, 1), "grade": grade, "usable": overall >= 35,
        "metrics": {
            "sharpness": {"score": round(sharp, 1), "raw": round(lap_var, 1), "label": "Laplacian variance"},
            "brightness": {"score": round(bright, 1), "raw": round(mean_b, 1), "label": "Mean intensity"},
            "contrast": {"score": round(contrast, 1), "raw": round(std_c, 1), "label": "Intensity std-dev"},
            "noise": {"score": round(noise, 1), "raw": round(sigma, 2), "label": "Estimated sigma"},
            "exposure": {"score": round(exposure, 1), "raw": round(dark_clip + bright_clip, 2), "label": "% clipped"},
        },
        "warnings": warnings,
    }
