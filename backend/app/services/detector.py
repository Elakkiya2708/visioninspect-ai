"""Unsupervised anomaly detector (PatchCore-style, classical features).

Training uses only defect-free ("good") images, exactly like the MVTec AD protocol:

  1. Extract multi-scale patch descriptors (Lab colour, gradients, Laplacian,
     local mean/std at 3 scales) on a dense grid.
  2. Standardise + PCA-reduce them and keep a memory bank of normal patches.
  3. At inference every patch is scored by its distance to the nearest normal
     patch -> a pixel-level anomaly map -> defect localisation + heatmap.
  4. Image / pixel thresholds are calibrated on a held-out set of good images.

The deep-learning backbone (e.g. ResNet / YOLO) can be plugged in behind the
same ``fit`` / ``predict`` interface without touching the rest of the platform.
"""
from __future__ import annotations

import time
from pathlib import Path

import cv2
import joblib
import numpy as np
from sklearn.decomposition import PCA
from sklearn.metrics import (accuracy_score, average_precision_score, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.neighbors import NearestNeighbors

from .preprocessing import MODEL_SIZE, prepare_for_model

SCALES = (7, 15, 31)
GRID_STRIDE = 4


def _channels(img_bgr: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = lab[..., 0]
    gx = np.abs(cv2.Sobel(L, cv2.CV_32F, 1, 0, ksize=3))
    gy = np.abs(cv2.Sobel(L, cv2.CV_32F, 0, 1, ksize=3))
    lap = np.abs(cv2.Laplacian(L, cv2.CV_32F, ksize=3))
    return np.dstack([lab, gx, gy, lap])  # 6 channels


def patch_features(img_bgr: np.ndarray) -> tuple[np.ndarray, tuple[int, int]]:
    """Dense multi-scale patch descriptors -> (N, D) and the grid shape."""
    ch = _channels(img_bgr)
    feats = []
    for s in SCALES:
        mean = cv2.boxFilter(ch, -1, (s, s), borderType=cv2.BORDER_REFLECT)
        sq = cv2.boxFilter(ch * ch, -1, (s, s), borderType=cv2.BORDER_REFLECT)
        std = np.sqrt(np.maximum(sq - mean * mean, 0))
        feats.append(mean[::GRID_STRIDE, ::GRID_STRIDE])
        feats.append(std[::GRID_STRIDE, ::GRID_STRIDE])
    f = np.concatenate(feats, axis=-1)
    gh, gw = f.shape[:2]
    return f.reshape(-1, f.shape[-1]), (gh, gw)


class PatchAnomalyDetector:
    def __init__(self, category: str, img_size: int = MODEL_SIZE, bank_size: int = 15000,
                 pca_dims: int = 20, seed: int = 0):
        self.category = category
        self.img_size = img_size
        self.bank_size = bank_size
        self.pca_dims = pca_dims
        self.seed = seed
        self.mu = self.sigma = self.pca = self.nn = None
        self.image_threshold = 1.0
        self.pixel_threshold = 1.0
        self.meta: dict = {}

    # ------------------------------------------------------------------ fit
    def _embed(self, feats: np.ndarray) -> np.ndarray:
        return self.pca.transform((feats - self.mu) / self.sigma).astype(np.float32)

    def _build_bank(self, imgs: list[np.ndarray]) -> None:
        rng = np.random.default_rng(self.seed)
        all_f = np.concatenate([patch_features(i)[0] for i in imgs], axis=0)
        self.mu = all_f.mean(0)
        self.sigma = all_f.std(0) + 1e-3
        z = (all_f - self.mu) / self.sigma
        self.pca = PCA(n_components=min(self.pca_dims, z.shape[1]), random_state=self.seed).fit(
            z[rng.choice(len(z), size=min(len(z), 60000), replace=False)])
        emb = self.pca.transform(z).astype(np.float32)
        if len(emb) > self.bank_size:
            emb = emb[rng.choice(len(emb), size=self.bank_size, replace=False)]
        self.nn = NearestNeighbors(n_neighbors=1, algorithm="brute").fit(emb)

    def _raw_map(self, img_prepared: np.ndarray) -> np.ndarray:
        feats, (gh, gw) = patch_features(img_prepared)
        dist, _ = self.nn.kneighbors(self._embed(feats))
        m = dist.reshape(gh, gw).astype(np.float32)
        m = cv2.resize(m, (self.img_size, self.img_size), interpolation=cv2.INTER_CUBIC)
        return cv2.GaussianBlur(m, (0, 0), 3.0)

    def fit(self, images_bgr: list[np.ndarray], holdout_fraction: float = 0.25) -> dict:
        t0 = time.time()
        prepared = [prepare_for_model(i, self.img_size) for i in images_bgr]
        rng = np.random.default_rng(self.seed)
        idx = rng.permutation(len(prepared))
        n_hold = max(3, int(len(prepared) * holdout_fraction))
        hold = [prepared[i] for i in idx[:n_hold]]
        train = [prepared[i] for i in idx[n_hold:]]
        # 1) bank on train split -> calibrate on held-out good images
        self._build_bank(train)
        hold_scores = np.array([self._raw_map(h).max() for h in hold])
        mu_s, sd_s = float(hold_scores.mean()), float(hold_scores.std())
        self.image_threshold = float(max(mu_s + 3.0 * sd_s, hold_scores.max() * 1.10))
        self.pixel_threshold = float(self.image_threshold * 0.80)
        # 2) final bank on all good images (stronger normality model)
        self._build_bank(prepared)
        self.meta = {
            "category": self.category, "n_train": len(images_bgr), "n_calibration": n_hold,
            "image_threshold": self.image_threshold, "pixel_threshold": self.pixel_threshold,
            "good_score_mean": mu_s, "good_score_std": sd_s,
            "train_seconds": round(time.time() - t0, 2), "img_size": self.img_size,
            "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        return self.meta

    # -------------------------------------------------------------- predict
    def predict(self, img_bgr: np.ndarray) -> dict:
        """Score an image. ``img_bgr`` may be any size (resized internally)."""
        prepared = prepare_for_model(img_bgr, self.img_size)
        amap = self._raw_map(prepared)
        return {
            "prepared": prepared,
            "anomaly_map": amap,
            "image_score": float(amap.max()),
            "image_threshold": self.image_threshold,
            "pixel_threshold": self.pixel_threshold,
        }

    # ----------------------------------------------------------- persistence
    def save(self, path: str | Path) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path, compress=3)

    @staticmethod
    def load(path: str | Path) -> "PatchAnomalyDetector":
        return joblib.load(path)


# ---------------------------------------------------------------- evaluation
def _box_iou(a, b) -> float:
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def evaluate(detector: PatchAnomalyDetector, items: list, read_image, segment_fn=None) -> dict:
    """Image-level metrics + detection mAP@0.5 (when ground-truth masks exist).

    ``items`` are ``TestItem`` objects (path / defect_type / mask_path / label).
    """
    labels, scores, gt_boxes, preds = [], [], [], []
    for it in items:
        res = detector.predict(read_image(it.path))
        labels.append(it.label)
        scores.append(res["image_score"])
        boxes = []
        if it.mask_path is not None and segment_fn is not None:
            m = cv2.imread(str(it.mask_path), cv2.IMREAD_GRAYSCALE)
            m = cv2.resize(m, (detector.img_size, detector.img_size), interpolation=cv2.INTER_NEAREST)
            n, _, stats, _ = cv2.connectedComponentsWithStats((m > 127).astype(np.uint8))
            boxes = [tuple(int(v) for v in stats[i][:4]) for i in range(1, n) if stats[i][4] > 15]
        gt_boxes.append(boxes)
        if segment_fn is not None:
            preds.append(segment_fn(res))
    y = np.array(labels)
    s = np.array(scores)
    yhat = (s > detector.image_threshold).astype(int)
    out = {
        "n_test": int(len(y)), "n_defective": int(y.sum()), "n_good": int((1 - y).sum()),
        "accuracy": float(accuracy_score(y, yhat)),
        "precision": float(precision_score(y, yhat, zero_division=0)),
        "recall": float(recall_score(y, yhat, zero_division=0)),
        "f1": float(f1_score(y, yhat, zero_division=0)),
        "false_positive_rate": float(((yhat == 1) & (y == 0)).sum() / max(1, (y == 0).sum())),
        "auroc": float(roc_auc_score(y, s)) if len(set(y)) > 1 else None,
        "ap_image": float(average_precision_score(y, s)) if len(set(y)) > 1 else None,
        "threshold": detector.image_threshold,
    }
    if segment_fn is not None and any(gt_boxes):
        out["map50"] = _map50(preds, gt_boxes)
    return out


def _map50(preds: list[list[dict]], gts: list[list[tuple]]) -> float:
    """Single-class average precision at IoU 0.5 over all test images."""
    records = []  # (confidence, is_tp)
    n_gt = sum(len(g) for g in gts)
    for p, g in zip(preds, gts):
        matched = set()
        for d in sorted(p, key=lambda r: -r["score"]):
            best, best_j = 0.0, -1
            for j, gb in enumerate(g):
                if j in matched:
                    continue
                iou = _box_iou(d["bbox"], gb)
                if iou > best:
                    best, best_j = iou, j
            if best >= 0.5:
                matched.add(best_j)
                records.append((d["score"], 1))
            else:
                records.append((d["score"], 0))
    if not records or n_gt == 0:
        return 0.0
    records.sort(key=lambda r: -r[0])
    tp = np.cumsum([r[1] for r in records])
    fp = np.cumsum([1 - r[1] for r in records])
    rec = tp / n_gt
    prec = tp / np.maximum(tp + fp, 1)
    # VOC-style all-point interpolation
    mrec = np.concatenate([[0], rec, [1]])
    mpre = np.concatenate([[0], prec, [0]])
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])
    idx = np.where(mrec[1:] != mrec[:-1])[0]
    return float(((mrec[idx + 1] - mrec[idx]) * mpre[idx + 1]).sum())
