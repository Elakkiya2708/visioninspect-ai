"""Unsupervised anomaly detection engine (Defect Detection module).

Two modes, one feature extractor:
  * trained  - patch-feature statistics learned from defect-free ("good") images of a
               product category (MVTec AD style). Mahalanobis distance to a k-cluster
               Gaussian mixture; threshold calibrated on held-out good images.
  * baseline - no training data needed. The image is compared against its own robust
               statistics, so outliers inside a uniform texture stand out.
Both yield a normalised anomaly map where 1.0 == detection threshold.
"""
import json
from pathlib import Path

import cv2
import numpy as np

SCALES = (11, 31)
STRIDE = 4


def feature_grid(img_bgr, stride: int = STRIDE, scales=SCALES):
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, A, B = cv2.split(lab)
    gx = cv2.Sobel(L, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(L, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    lap = np.abs(cv2.Laplacian(L, cv2.CV_32F, ksize=3))
    feats = []
    for k in scales:
        bm = lambda x: cv2.blur(x, (k, k), borderType=cv2.BORDER_REFLECT)  # noqa: E731
        mL, mA, mB = bm(L), bm(A), bm(B)
        sL = np.sqrt(np.maximum(bm(L * L) - mL * mL, 0))
        feats += [mL, mA, mB, sL, bm(mag), bm(lap), bm(np.abs(gx)), bm(np.abs(gy))]
    F = np.stack(feats, -1)
    half = stride // 2
    return F[half::stride, half::stride, :]


def _smooth_map(grid_scores, size):
    m = cv2.resize(grid_scores.astype(np.float32), (size, size), interpolation=cv2.INTER_CUBIC)
    return cv2.GaussianBlur(m, (0, 0), 3.0)


def _mahalanobis_sq(Z, mean, prec):
    d = Z - mean
    return np.einsum("nd,de,ne->n", d, prec, d)


class AnomalyModel:
    def __init__(self, name="", category="", k=4, size=256):
        self.name, self.category, self.k, self.size = name, category, k, size
        self.mu = self.sd = self.centers = self.precs = None
        self.threshold = 1.0
        self.meta = {}

    # ---------------------------------------------------------------- training
    def fit(self, images, holdout_frac=0.2, seed=0, max_rows=150_000):
        from sklearn.cluster import KMeans

        rng = np.random.default_rng(seed)
        grids = [feature_grid(im) for im in images]
        n = len(grids)
        idx = rng.permutation(n)
        n_hold = max(3, int(n * holdout_frac)) if n >= 12 else 0
        hold_idx, train_idx = idx[:n_hold], idx[n_hold:]
        X = np.concatenate([grids[i].reshape(-1, grids[i].shape[-1]) for i in train_idx])
        if len(X) > max_rows:
            X = X[rng.choice(len(X), max_rows, replace=False)]
        self.mu = X.mean(0)
        self.sd = X.std(0) + 1e-6
        Z = (X - self.mu) / self.sd
        D = Z.shape[1]
        k = min(self.k, max(1, len(Z) // 500))
        if k > 1:
            km = KMeans(n_clusters=k, n_init=3, random_state=seed).fit(Z)
            labels, self.centers = km.labels_, km.cluster_centers_
        else:
            labels, self.centers = np.zeros(len(Z), int), Z.mean(0, keepdims=True)
        precs = []
        for c in range(len(self.centers)):
            Zc = Z[labels == c]
            cov = np.cov(Zc, rowvar=False) if len(Zc) > D else np.eye(D)
            cov = cov + np.eye(D) * (0.05 * np.trace(cov) / D)
            precs.append(np.linalg.inv(cov))
        self.precs = np.stack(precs)

        cal = hold_idx if n_hold else train_idx
        peaks = np.array([self._raw_map(grids[i]).max() for i in cal])
        thr = max(peaks.mean() + 3.5 * peaks.std(), peaks.max() * 1.1)
        self.threshold = float(thr)
        self.meta = {"n_train": int(len(train_idx)), "n_holdout": int(n_hold), "clusters": int(len(self.centers)),
                     "features": int(D), "holdout_peak_mean": float(peaks.mean()), "holdout_peak_max": float(peaks.max())}
        return self

    def _raw_map(self, grid):
        gh, gw, D = grid.shape
        Z = (grid.reshape(-1, D) - self.mu) / self.sd
        d2 = np.stack([_mahalanobis_sq(Z, c, p) for c, p in zip(self.centers, self.precs)], 1).min(1)
        return _smooth_map(np.sqrt(d2 / D).reshape(gh, gw), self.size)

    # --------------------------------------------------------------- inference
    def predict_map(self, img_proc):
        return self._raw_map(feature_grid(img_proc)) / self.threshold

    # ------------------------------------------------------------- persistence
    def save(self, path: Path):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(path, mu=self.mu, sd=self.sd, centers=self.centers, precs=self.precs,
                            threshold=np.array(self.threshold),
                            meta=np.array(json.dumps({"name": self.name, "category": self.category,
                                                      "size": self.size, **self.meta})))

    @classmethod
    def load(cls, path: Path):
        z = np.load(path, allow_pickle=False)
        meta = json.loads(str(z["meta"]))
        m = cls(meta.get("name", ""), meta.get("category", ""), size=meta.get("size", 256))
        m.mu, m.sd, m.centers, m.precs = z["mu"], z["sd"], z["centers"], z["precs"]
        m.threshold = float(z["threshold"])
        m.meta = meta
        return m


class BaselineModel:
    """Self-referential robust detector: works with zero training data."""
    name = "baseline-self-reference"
    category = "any"
    K = 14.0  # MAD multiples above the median score

    def __init__(self, size=256):
        self.size = size

    def predict_map(self, img_proc):
        grid = feature_grid(img_proc)
        gh, gw, D = grid.shape
        X = grid.reshape(-1, D)
        med = np.median(X, 0)
        mad = np.median(np.abs(X - med), 0) * 1.4826 + 1e-6
        Z = (X - med) / mad
        Z = np.clip(Z, -25, 25)
        mean = Z.mean(0)
        keep = np.ones(len(Z), bool)
        for _ in range(2):
            Zk = Z[keep]
            cov = np.cov(Zk, rowvar=False)
            cov = cov + np.eye(D) * (0.05 * np.trace(cov) / D)
            prec = np.linalg.inv(cov)
            mean = Zk.mean(0)
            d = np.sqrt(_mahalanobis_sq(Z, mean, prec) / D)
            keep = d <= np.percentile(d, 90)
        med_d = np.median(d)
        mad_d = np.median(np.abs(d - med_d)) * 1.4826 + 1e-6
        thr = max(med_d + self.K * mad_d, med_d * 1.6)
        return _smooth_map(d.reshape(gh, gw), self.size) / thr


def _refine_mask(heat_comp, lab, residual, noise):
    """Sharpen a blurry heat-map blob into a tight pixel mask using the local colour residual."""
    ys, xs = np.where(heat_comp)
    pad = 6
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, heat_comp.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, heat_comp.shape[1])
    roi = residual[y0:y1, x0:x1]
    otsu, _ = cv2.threshold(np.clip(roi * 4, 0, 255).astype(np.uint8), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    thr = max(otsu / 4.0, 4 * noise + 2)
    m = np.zeros_like(heat_comp, np.uint8)
    m[y0:y1, x0:x1] = (roi > thr).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    m[~cv2.dilate(heat_comp.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)] = 0
    return m.astype(bool) if m.sum() >= 6 else heat_comp


def extract_regions(norm_map, img_proc, min_area_ratio=0.0003):
    """Threshold the normalised map at 1.0, then describe each connected blob on a refined pixel mask."""
    size = norm_map.shape[0]
    mask = (norm_map > 1.0).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    merged = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    n, labels, stats, cents = cv2.connectedComponentsWithStats(merged, 8)
    lab = cv2.cvtColor(img_proc, cv2.COLOR_BGR2LAB).astype(np.float32)
    background = cv2.cvtColor(cv2.medianBlur(img_proc, 21), cv2.COLOR_BGR2LAB).astype(np.float32)
    residual = cv2.blur(np.linalg.norm(lab - background, axis=2), (3, 3))
    noise = float(np.median(residual))
    gray = cv2.cvtColor(img_proc, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 60, 140)
    gx = cv2.Sobel(lab[..., 0], cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(lab[..., 0], cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = cv2.magnitude(gx, gy) / 4.0
    regions = []
    for i in range(1, n):
        heat = (labels == i) & (mask > 0)
        if int(heat.sum()) < min_area_ratio * size * size:
            continue
        comp = _refine_mask(heat, lab, residual, noise)
        area = int(comp.sum())
        comp_u8 = comp.astype(np.uint8)
        ys, xs = np.where(comp)
        x, y = int(xs.min()), int(ys.min())
        w, h = int(xs.max() - x + 1), int(ys.max() - y + 1)
        pad = 2
        x, y = max(x - pad, 0), max(y - pad, 0)
        w, h = min(w + 2 * pad, size - x), min(h + 2 * pad, size - y)
        cnts, _ = cv2.findContours(comp_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnt = np.concatenate(cnts)
        hull_area = max(cv2.contourArea(cv2.convexHull(cnt)), 1.0)
        (_, _), (rw, rh), _ = cv2.minAreaRect(cnt)
        major, minor = max(rw, rh, 1.0), max(min(rw, rh), 1.0)
        perim = max(cv2.arcLength(cnt, True), 1.0)
        ring = cv2.dilate(comp_u8, np.ones((15, 15), np.uint8)) - cv2.dilate(comp_u8, np.ones((5, 5), np.uint8))
        ring = ring > 0
        if ring.sum() < 20:
            ring = ~comp
        inside, outside = lab[comp].mean(0), lab[ring].mean(0)
        # --- texture-independent descriptors -------------------------------------------------
        ed_in, ed_out = float((edges[comp] > 0).mean()), float((edges[ring] > 0).mean())
        heat_u8 = heat.astype(np.uint8)
        hc, _ = cv2.findContours(heat_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        hcnt = np.concatenate(hc)
        heat_sol = float(min(heat.sum() / max(cv2.contourArea(cv2.convexHull(hcnt)), 1.0), 1.0))
        boundary = (cv2.dilate(comp_u8, np.ones((3, 3), np.uint8)) - cv2.erode(comp_u8, np.ones((3, 3), np.uint8))) > 0
        sharp = float(grad_mag[boundary].mean() / (float(np.linalg.norm(inside - outside)) + 8.0))
        regions.append({
            "bbox": [x / size, y / size, w / size, h / size],
            "centroid": [float((xs.mean()) / size), float((ys.mean()) / size)],
            "area_ratio": area / (size * size),
            "peak": float(norm_map[heat].max()),
            "mean_excess": float(norm_map[heat].mean()),
            "elongation": float(major / minor),
            "minor_px": float(minor),
            "solidity": float(min(area / hull_area, 1.0)),
            "circularity": float(min(4 * np.pi * area / perim ** 2, 1.0)),
            "dL": float(inside[0] - outside[0]),
            "dE": float(np.linalg.norm(inside - outside)),
            "dC": float(np.linalg.norm((inside - outside)[1:])),
            "mean_L": float(inside[0]),
            "dark_L": float(np.percentile(lab[comp][:, 0], 10)),
            "edge_density": ed_in,
            "edge_excess": ed_in - ed_out,
            "heat_solidity": heat_sol,
            "boundary_sharpness": sharp,
        })
    regions.sort(key=lambda r: -r["peak"])
    return regions[:12]
