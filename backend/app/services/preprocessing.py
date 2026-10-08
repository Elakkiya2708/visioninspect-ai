"""Image preprocessing + global feature extraction (Image Processing module)."""
import time

import cv2
import numpy as np

MODEL_SIZE = 256


def resize_keep_aspect(img, max_side=640):
    h, w = img.shape[:2]
    s = max_side / max(h, w)
    if s >= 1:
        return img.copy()
    return cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)


def preprocess(img_bgr, size: int = MODEL_SIZE):
    """Resize -> denoise -> contrast enhancement. Returns (image, step log)."""
    steps = []

    t = time.perf_counter()
    out = cv2.resize(img_bgr, (size, size), interpolation=cv2.INTER_AREA)
    steps.append({"step": "Resize & normalise", "detail": f"{size}x{size} px, INTER_AREA",
                  "ms": round((time.perf_counter() - t) * 1000, 1)})

    t = time.perf_counter()
    out = cv2.fastNlMeansDenoisingColored(out, None, 3, 3, 5, 15)
    steps.append({"step": "Noise removal", "detail": "Non-local means denoising (h=3)",
                  "ms": round((time.perf_counter() - t) * 1000, 1)})

    t = time.perf_counter()
    lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(4, 4))
    lab[..., 0] = clahe.apply(lab[..., 0])
    out = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    steps.append({"step": "Contrast enhancement", "detail": "CLAHE on L channel (clip 1.5, 4x4 tiles)",
                  "ms": round((time.perf_counter() - t) * 1000, 1)})
    return out, steps


def extract_global_features(img_bgr):
    """Texture / edge / colour descriptors reported in the inspection record."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 140)
    hist = cv2.calcHist([gray], [0], None, [64], [0, 256]).ravel()
    p = hist / (hist.sum() + 1e-9)
    entropy = float(-(p[p > 0] * np.log2(p[p > 0])).sum())
    lap = cv2.Laplacian(gray, cv2.CV_32F)
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    return {
        "edge_density": round(float((edges > 0).mean()), 4),
        "texture_energy": round(float(lap.std()), 2),
        "entropy": round(entropy, 3),
        "mean_lightness": round(float(lab[..., 0].mean()), 1),
        "colour_a": round(float(lab[..., 1].mean() - 128), 1),
        "colour_b": round(float(lab[..., 2].mean() - 128), 1),
        "colour_spread": round(float(lab[..., 1:].std()), 2),
    }
