"""Synthetic manufacturing-surface generator.

Produces an MVTec-AD-shaped demo dataset (train/good, test/<defect>, ground_truth)
so the whole platform can be demonstrated and tested without downloading the
real 4.9 GB MVTec AD archive. Real MVTec AD folders work the same way.
"""
from pathlib import Path

import cv2
import numpy as np

STYLES = ["metal_plate", "fabric", "ceramic_tile"]
DEFECTS = ["scratch", "crack", "stain", "hole", "dent"]


def _norm_noise(rng, size, sx, sy=None):
    n = rng.normal(0, 1, (size, size)).astype(np.float32)
    n = cv2.GaussianBlur(n, (0, 0), sigmaX=sx, sigmaY=sy if sy is not None else sx)
    return n / (n.std() + 1e-6)


def make_good(style: str, seed: int, size: int = 256) -> np.ndarray:
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    grain = rng.normal(0, 1, (size, size)).astype(np.float32)
    if style == "metal_plate":
        gray = 148 + 7 * _norm_noise(rng, size, 40) + 6 * _norm_noise(rng, size, 30, 0.8) + 2.5 * grain
        tint = np.array([1.03, 1.0, 0.96], np.float32)
    elif style == "fabric":
        warp = 0.6 * _norm_noise(rng, size, 8)
        weave = np.sin(xx * 2 * np.pi / 7 + warp) * np.sin(yy * 2 * np.pi / 7 + warp)
        gray = 130 + 14 * weave + 6 * _norm_noise(rng, size, 25) + 3 * grain
        tint = np.array([0.85, 0.95, 1.1], np.float32)
    else:  # ceramic_tile
        speck = rng.random((size, size))
        gray = 175 + 5 * _norm_noise(rng, size, 50) - 28 * (speck > 0.992) + 18 * (speck < 0.006)
        gray = cv2.GaussianBlur(gray.astype(np.float32), (0, 0), 0.8) + 2 * grain
        tint = np.array([0.95, 1.0, 1.03], np.float32)
    return np.clip(gray[..., None] * tint[None, None, :], 0, 255).astype(np.uint8)


def _walk(rng, start, n, step_lo, step_hi, turn, ang0, limit):
    pts = [np.array(start, np.float32)]
    ang = ang0
    for _ in range(n):
        ang += rng.normal(0, turn)
        step = rng.uniform(step_lo, step_hi)
        nxt = pts[-1] + step * np.array([np.cos(ang), np.sin(ang)], np.float32)
        pts.append(np.clip(nxt, 4, limit - 5))
    return np.array(pts, np.int32).reshape(-1, 1, 2)


def inject_defect(img: np.ndarray, kind: str, seed: int):
    """Return (defective image, uint8 mask 0/255)."""
    rng = np.random.default_rng(seed + 10_000)
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    base = img.astype(np.float32)
    margin = 34
    cx, cy = [float(v) for v in rng.integers(margin, w - margin, 2)]

    if kind == "scratch":
        ang = rng.uniform(0, np.pi)
        length = rng.integers(45, 110)
        p0 = np.array([cx, cy])
        p1 = np.clip(p0 + length * np.array([np.cos(ang), np.sin(ang)]), 4, w - 5)
        mid = (p0 + p1) / 2 + rng.normal(0, 4, 2)
        pts = np.array([p0, mid, p1], np.int32).reshape(-1, 1, 2)
        layer = np.zeros((h, w), np.float32)
        cv2.polylines(layer, [pts], False, 1.0, thickness=int(rng.integers(1, 3)), lineType=cv2.LINE_AA)
        delta = rng.choice([-1, 1]) * rng.uniform(40, 65)
        out = base + layer[..., None] * delta
        mask = cv2.dilate((layer > 0.2).astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
    elif kind == "crack":
        layer = np.zeros((h, w), np.float32)
        n = int(rng.integers(10, 18))
        pts = _walk(rng, (cx, cy), n, 5, 9, 0.55, rng.uniform(0, 2 * np.pi), w)
        cv2.polylines(layer, [pts], False, 1.0, thickness=2, lineType=cv2.LINE_AA)
        bi = int(rng.integers(3, max(4, n - 2)))
        branch = _walk(rng, pts[bi, 0], int(rng.integers(4, 7)), 4, 7, 0.6, rng.uniform(0, 2 * np.pi), w)
        cv2.polylines(layer, [branch], False, 1.0, thickness=1, lineType=cv2.LINE_AA)
        out = base * (1 - layer[..., None] * 0.78)
        mask = cv2.dilate((layer > 0.2).astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
    elif kind == "stain":
        r = rng.uniform(12, 26)
        blob = np.exp(-((((xx - cx) / (r * rng.uniform(0.8, 1.3))) ** 2 + ((yy - cy) / r) ** 2)) ** 1.5)
        palette = [(30, 60, 110), (120, 70, 30), (45, 45, 45), (30, 140, 150)]
        color = np.array(palette[int(rng.integers(0, len(palette)))], np.float32)
        alpha = (blob * rng.uniform(0.5, 0.78))[..., None]
        out = base * (1 - alpha) + color[None, None, :] * alpha
        mask = ((alpha[..., 0] > 0.2) * 255).astype(np.uint8)
    elif kind == "hole":
        r = int(rng.integers(7, 13))
        out = base.copy()
        cv2.circle(out, (int(cx), int(cy)), r + 2, (185, 185, 185), 1, cv2.LINE_AA)
        cv2.circle(out, (int(cx), int(cy)), r, (14, 14, 14), -1, cv2.LINE_AA)
        mask = np.zeros((h, w), np.uint8)
        cv2.circle(mask, (int(cx), int(cy)), r + 2, 255, -1)
    elif kind == "dent":
        r = rng.uniform(24, 38)
        bump = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * (r / 2) ** 2)))
        shade = 34 * bump * ((xx - cx) / r) - 20 * bump
        out = base + shade[..., None]
        mask = ((bump > 0.35) * 255).astype(np.uint8)
    else:
        raise ValueError(f"unknown defect kind: {kind}")
    return np.clip(out, 0, 255).astype(np.uint8), mask


def random_sample(style: str, seed: int, defect_probability: float = 0.35, size: int = 256):
    """Simulated camera capture. Returns (image, label, defect_kind|None)."""
    rng = np.random.default_rng(seed)
    img = make_good(style, seed, size)
    if rng.random() < defect_probability:
        kind = DEFECTS[int(rng.integers(0, len(DEFECTS)))]
        img, _ = inject_defect(img, kind, seed)
        return img, "defect", kind
    return img, "good", None


def generate_dataset(root: Path, styles=None, n_train=60, n_test_good=15, n_test_per_defect=8,
                     size=256, seed=0, progress=None):
    """Write MVTec-AD-style folders: <root>/<cat>/{train/good,test/<type>,ground_truth/<type>}."""
    styles = styles or STYLES
    root = Path(root)
    total = len(styles) * (n_train + n_test_good + n_test_per_defect * len(DEFECTS))
    done = 0
    for si, style in enumerate(styles):
        cat = root / f"demo_{style}"
        for d in ["train/good", "test/good"] + [f"test/{k}" for k in DEFECTS] + [f"ground_truth/{k}" for k in DEFECTS]:
            (cat / d).mkdir(parents=True, exist_ok=True)
        base_seed = seed + si * 100_000
        for i in range(n_train):
            cv2.imwrite(str(cat / "train/good" / f"{i:03d}.png"), make_good(style, base_seed + i, size))
            done += 1
        for i in range(n_test_good):
            cv2.imwrite(str(cat / "test/good" / f"{i:03d}.png"), make_good(style, base_seed + 50_000 + i, size))
            done += 1
        for ki, kind in enumerate(DEFECTS):
            for i in range(n_test_per_defect):
                s = base_seed + 60_000 + ki * 1000 + i
                img, mask = inject_defect(make_good(style, s, size), kind, s)
                cv2.imwrite(str(cat / f"test/{kind}" / f"{i:03d}.png"), img)
                cv2.imwrite(str(cat / f"ground_truth/{kind}" / f"{i:03d}_mask.png"), mask)
                done += 1
        if progress:
            progress(done / total)
    return [f"demo_{s}" for s in styles]
