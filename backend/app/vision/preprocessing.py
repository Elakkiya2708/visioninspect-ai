"""
Milestone 2 — Image Processing Module:
  preprocessing, noise removal, image enhancement, and a quality-analysis
  report (brightness / contrast / sharpness) for every inspected image.
"""
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class QualityReport:
    brightness: float
    contrast: float
    sharpness: float
    is_blurry: bool
    is_underexposed: bool
    is_overexposed: bool

    def to_dict(self) -> dict:
        return {
            "brightness": round(self.brightness, 2),
            "contrast": round(self.contrast, 2),
            "sharpness": round(self.sharpness, 2),
            "is_blurry": self.is_blurry,
            "is_underexposed": self.is_underexposed,
            "is_overexposed": self.is_overexposed,
        }


BLUR_THRESHOLD = 100.0
UNDEREXPOSED_THRESHOLD = 60.0
OVEREXPOSED_THRESHOLD = 200.0


def read_image(path: str) -> np.ndarray:
    """Loads an image from disk as a BGR numpy array (OpenCV convention)."""
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Could not read image at {path}")
    return img


def denoise(img: np.ndarray) -> np.ndarray:
    """Noise removal — a mild non-local-means denoise that preserves edges."""
    return cv2.fastNlMeansDenoisingColored(img, None, h=6, hColor=6, templateWindowSize=7, searchWindowSize=21)


def enhance_contrast(img: np.ndarray) -> np.ndarray:
    """CLAHE on the luminance channel — improves local contrast without
    blowing out already-bright regions."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l)
    merged = cv2.merge((l_eq, a, b))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)


def preprocess(img: np.ndarray) -> np.ndarray:
    """Full preprocessing pipeline: denoise -> contrast enhancement."""
    return enhance_contrast(denoise(img))


def analyze_quality(img: np.ndarray) -> QualityReport:
    """Milestone 2 deliverable: 'Generate image quality analysis reports.'"""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    return QualityReport(
        brightness=brightness,
        contrast=contrast,
        sharpness=sharpness,
        is_blurry=sharpness < BLUR_THRESHOLD,
        is_underexposed=brightness < UNDEREXPOSED_THRESHOLD,
        is_overexposed=brightness > OVEREXPOSED_THRESHOLD,
    )
