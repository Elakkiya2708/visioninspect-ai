"""Dataset utilities: MVTec AD loader + a synthetic MVTec-structured demo generator.

Expected layout (identical to the official MVTec AD dataset):

    <root>/<category>/train/good/*.png
    <root>/<category>/test/good/*.png
    <root>/<category>/test/<defect_type>/*.png
    <root>/<category>/ground_truth/<defect_type>/<name>_mask.png
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

IMG_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}


@dataclass
class TestItem:
    path: Path
    defect_type: str                  # "good" or defect folder name
    mask_path: Path | None = None

    @property
    def label(self) -> int:
        return 0 if self.defect_type == "good" else 1


@dataclass
class CategoryData:
    name: str
    train_good: list[Path] = field(default_factory=list)
    test: list[TestItem] = field(default_factory=list)


def _images(folder: Path) -> list[Path]:
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in IMG_EXT)


def scan_dataset(root: str | Path) -> list[dict]:
    """Summarise every category folder found under *root*."""
    root = Path(root)
    out = []
    if not root.is_dir():
        return out
    for cat in sorted(p for p in root.iterdir() if p.is_dir()):
        train = _images(cat / "train" / "good")
        test_dir = cat / "test"
        if not train or not test_dir.is_dir():
            continue
        defects = {}
        for sub in sorted(p for p in test_dir.iterdir() if p.is_dir()):
            defects[sub.name] = len(_images(sub))
        out.append({
            "category": cat.name,
            "train_good": len(train),
            "test_good": defects.get("good", 0),
            "test_defective": sum(v for k, v in defects.items() if k != "good"),
            "defect_types": {k: v for k, v in defects.items() if k != "good"},
            "has_masks": (cat / "ground_truth").is_dir(),
        })
    return out


def load_category(root: str | Path, category: str) -> CategoryData:
    cat = Path(root) / category
    data = CategoryData(name=category, train_good=_images(cat / "train" / "good"))
    test_dir = cat / "test"
    if test_dir.is_dir():
        for sub in sorted(p for p in test_dir.iterdir() if p.is_dir()):
            for img in _images(sub):
                mask = None
                if sub.name != "good":
                    for cand in (cat / "ground_truth" / sub.name / f"{img.stem}_mask.png",
                                 cat / "ground_truth" / sub.name / f"{img.stem}.png"):
                        if cand.exists():
                            mask = cand
                            break
                data.test.append(TestItem(img, sub.name, mask))
    return data


def read_image(path: str | Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Cannot read image: {path}")
    return img


# --------------------------------------------------------------------------
# Synthetic demo data (so the platform is fully usable without the 5 GB
# MVTec download). Textures + defects are procedurally generated.
# --------------------------------------------------------------------------
SIZE = 256


def _smooth_noise(rng, size, sigma):
    n = rng.standard_normal((size, size)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), sigma)
    return n / (n.std() + 1e-6)


def make_texture(category: str, rng: np.random.Generator, size: int = SIZE) -> np.ndarray:
    """Return a BGR uint8 defect-free texture for a synthetic category."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    light = 1.0 + rng.uniform(-0.05, 0.05) + 0.04 * ((xx / size - 0.5) * rng.uniform(-1, 1))
    if category == "metal_plate":
        n = rng.standard_normal((size, size)).astype(np.float32)
        n = cv2.GaussianBlur(n, (0, 0), sigmaX=18, sigmaY=0.8)   # brushed lines
        n /= n.std() + 1e-6
        base = 150 + 14 * n + 4 * _smooth_noise(rng, size, 20)
        img = np.dstack([base * 0.98, base, base * 1.02])
    elif category == "fabric_weave":
        period = 8
        weave = np.sin(2 * np.pi * xx / period) * np.sin(2 * np.pi * yy / period)
        base = 120 + 22 * weave + 6 * _smooth_noise(rng, size, 1.2) + 5 * _smooth_noise(rng, size, 25)
        img = np.dstack([base * 1.25, base * 1.0, base * 0.75])   # BGR -> bluish
    elif category == "ceramic_tile":
        base = 190 + 5 * _smooth_noise(rng, size, 30)
        speck = (rng.random((size, size)) > 0.985).astype(np.float32)
        speck = cv2.GaussianBlur(speck, (0, 0), 1.0) * 60
        base = base - speck + 3 * rng.standard_normal((size, size))
        img = np.dstack([base * 0.86, base * 0.94, base * 1.0])
    else:
        raise ValueError(f"unknown synthetic category {category}")
    img = img * light[..., None]
    img += rng.normal(0, 1.2, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8)


DEFECT_TYPES = ["scratch", "crack", "stain", "hole"]


def add_defect(img: np.ndarray, kind: str, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Paint a defect on *img*; return (image, binary mask uint8 0/255)."""
    size = img.shape[0]
    out = img.astype(np.float32)
    mask = np.zeros((size, size), np.uint8)
    margin = 40
    cx, cy = rng.integers(margin, size - margin, size=2)

    if kind == "scratch":
        ang = rng.uniform(0, np.pi)
        half = rng.uniform(22, 50)
        p1 = (int(cx - half * np.cos(ang)), int(cy - half * np.sin(ang)))
        p2 = (int(cx + half * np.cos(ang)), int(cy + half * np.sin(ang)))
        cv2.line(mask, p1, p2, 255, 2, cv2.LINE_AA)
        delta = rng.choice([-1, 1]) * rng.uniform(45, 70)
        layer = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 0.8)
        out += layer[..., None] * delta
    elif kind == "crack":
        ang = rng.uniform(0, 2 * np.pi)
        n = int(rng.integers(9, 14))
        step = rng.uniform(6, 9)
        pts = [(float(cx), float(cy))]
        for _ in range(n):
            ang += rng.uniform(-0.9, 0.9)
            x, y = pts[-1]
            pts.append((x + step * np.cos(ang), y + step * np.sin(ang)))
        pts_i = np.array(pts, np.int32).reshape(-1, 1, 2)
        cv2.polylines(mask, [pts_i], False, 255, 3, cv2.LINE_AA)
        layer = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 0.9)
        out -= layer[..., None] * rng.uniform(85, 115)
    elif kind == "stain":
        blob = np.zeros((size, size), np.float32)
        for _ in range(int(rng.integers(3, 6))):
            ox, oy = rng.integers(-9, 10, size=2)
            axes = (int(rng.integers(9, 17)), int(rng.integers(7, 14)))
            cv2.ellipse(blob, (int(cx + ox), int(cy + oy)), axes, float(rng.uniform(0, 180)), 0, 360, 1.0, -1)
        blob = cv2.GaussianBlur(blob, (0, 0), 2.0)
        mask = (blob > 0.5).astype(np.uint8) * 255
        tint = np.array([rng.uniform(-30, 10), rng.uniform(-10, 30), rng.uniform(35, 65)], np.float32)  # brownish/orange
        out += blob[..., None] * tint - blob[..., None] * 20
    elif kind == "hole":
        r = int(rng.integers(8, 15))
        cv2.circle(mask, (int(cx), int(cy)), r, 255, -1, cv2.LINE_AA)
        layer = cv2.GaussianBlur(mask.astype(np.float32) / 255, (0, 0), 1.2)
        out = out * (1 - layer[..., None] * 0.92) + layer[..., None] * 18
    else:
        raise ValueError(kind)
    return np.clip(out, 0, 255).astype(np.uint8), (mask > 127).astype(np.uint8) * 255


def generate_demo_dataset(root: str | Path, n_train: int = 60, n_test_good: int = 12,
                          n_per_defect: int = 8, seed: int = 7,
                          categories: tuple[str, ...] = ("metal_plate", "fabric_weave", "ceramic_tile")) -> list[str]:
    """Create an MVTec-structured synthetic dataset. Returns generated category names."""
    root = Path(root)
    rng = np.random.default_rng(seed)
    for cat in categories:
        (root / cat / "train" / "good").mkdir(parents=True, exist_ok=True)
        (root / cat / "test" / "good").mkdir(parents=True, exist_ok=True)
        for i in range(n_train):
            cv2.imwrite(str(root / cat / "train" / "good" / f"{i:03d}.png"), make_texture(cat, rng))
        for i in range(n_test_good):
            cv2.imwrite(str(root / cat / "test" / "good" / f"{i:03d}.png"), make_texture(cat, rng))
        for kind in DEFECT_TYPES:
            (root / cat / "test" / kind).mkdir(parents=True, exist_ok=True)
            (root / cat / "ground_truth" / kind).mkdir(parents=True, exist_ok=True)
            for i in range(n_per_defect):
                img, m = add_defect(make_texture(cat, rng), kind, rng)
                cv2.imwrite(str(root / cat / "test" / kind / f"{i:03d}.png"), img)
                cv2.imwrite(str(root / cat / "ground_truth" / kind / f"{i:03d}_mask.png"), m)
    return list(categories)
