"""Image validation (Image Acquisition module)."""
from pathlib import Path

import cv2
import numpy as np

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
MIN_SIDE = 64


def validate_image(data: bytes, filename: str, max_mb: int = 20):
    """Return (bgr image | None, validation report)."""
    ext = Path(filename or "").suffix.lower()
    report = {"filename": filename, "extension": ext, "size_bytes": len(data),
              "valid": False, "errors": [], "warnings": [], "width": None, "height": None, "channels": None}
    if ext not in ALLOWED_EXT:
        report["errors"].append(f"Unsupported format '{ext or 'none'}'. Allowed: JPG, PNG, BMP, TIFF, WebP.")
    if not data:
        report["errors"].append("File is empty.")
    if len(data) > max_mb * 1024 * 1024:
        report["errors"].append(f"File exceeds the {max_mb} MB limit.")
    if report["errors"]:
        return None, report

    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        report["errors"].append("File could not be decoded as an image (corrupt or wrong format).")
        return None, report

    h, w = img.shape[:2]
    report.update(width=w, height=h, channels=3)
    if min(h, w) < MIN_SIDE:
        report["errors"].append(f"Image too small ({w}x{h}). Minimum side is {MIN_SIDE}px.")
        return None, report
    if max(h, w) > 4096:
        report["warnings"].append("Very large image; it will be downscaled for analysis.")
    if abs(w / h - 1) > 0.25:
        report["warnings"].append("Non-square image; it will be resized to the model input shape.")
    report["valid"] = True
    return img, report
