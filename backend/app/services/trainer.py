"""Dataset scanning, model training and evaluation (MVTec AD folder layout)."""
import time
from pathlib import Path

import cv2
import numpy as np

from .anomaly import AnomalyModel, extract_regions
from .preprocessing import MODEL_SIZE, preprocess

IMG_EXT = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}


def _imgs(folder: Path):
    return sorted(p for p in folder.glob("*") if p.suffix.lower() in IMG_EXT) if folder.exists() else []


def scan_categories(root: Path):
    root = Path(root)
    out = []
    if not root.exists():
        return out
    for cat in sorted(p for p in root.iterdir() if p.is_dir() and (p / "train" / "good").exists()):
        test = cat / "test"
        types = sorted(d.name for d in test.iterdir() if d.is_dir()) if test.exists() else []
        out.append({
            "name": cat.name,
            "train_good": len(_imgs(cat / "train" / "good")),
            "test_good": len(_imgs(test / "good")),
            "test_defect": sum(len(_imgs(test / t)) for t in types if t != "good"),
            "defect_types": [t for t in types if t != "good"],
            "has_ground_truth": (cat / "ground_truth").exists(),
        })
    return out


def _load_proc(path):
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    return preprocess(img, MODEL_SIZE)[0]


def train_category(category, root, out_path, version, max_train=200, k=4, progress=None):
    cat = Path(root) / category
    train_paths = _imgs(cat / "train" / "good")[:max_train]
    if len(train_paths) < 8:
        raise ValueError(f"Need at least 8 good training images in {cat / 'train' / 'good'} (found {len(train_paths)}).")
    t0 = time.perf_counter()
    images = []
    for i, p in enumerate(train_paths):
        images.append(_load_proc(p))
        if progress:
            progress(0.05 + 0.45 * (i + 1) / len(train_paths), f"Preprocessing {i + 1}/{len(train_paths)}")
    if progress:
        progress(0.55, "Fitting anomaly model")
    model = AnomalyModel(name=f"patchstat-{category}-v{version}", category=category, k=k).fit(images)
    model.save(out_path)
    train_s = time.perf_counter() - t0
    metrics = evaluate(model, cat, progress)
    metrics.update(train_seconds=round(train_s, 1), n_train=model.meta["n_train"],
                   n_holdout=model.meta["n_holdout"], threshold=round(model.threshold, 4))
    return model, metrics


def evaluate(model: AnomalyModel, cat: Path, progress=None):
    from sklearn.metrics import average_precision_score, roc_auc_score

    test = cat / "test"
    items = []  # (path, label, defect_type)
    for d in sorted(test.iterdir()) if test.exists() else []:
        if d.is_dir():
            for p in _imgs(d):
                items.append((p, 0 if d.name == "good" else 1, d.name))
    if not items or all(l == 0 for _, l, _ in items) or all(l == 1 for _, l, _ in items):
        return {"evaluated": False}
    scores, labels, ious, per_type = [], [], [], {}
    for i, (p, label, typ) in enumerate(items):
        proc = _load_proc(p)
        nm = model.predict_map(proc)
        scores.append(float(nm.max()))
        labels.append(label)
        pred_flag = nm.max() > 1.0
        per_type.setdefault(typ, []).append(pred_flag == bool(label))
        gt = cat / "ground_truth" / typ / f"{p.stem}_mask.png"
        if label == 1 and gt.exists():
            m = cv2.imread(str(gt), cv2.IMREAD_GRAYSCALE)
            m = cv2.resize(m, (nm.shape[1], nm.shape[0]), interpolation=cv2.INTER_NEAREST) > 127
            pm = nm > 1.0
            union = (m | pm).sum()
            ious.append(float((m & pm).sum() / union) if union else 0.0)
        if progress:
            progress(0.55 + 0.43 * (i + 1) / len(items), f"Evaluating {i + 1}/{len(items)}")
    s, y = np.array(scores), np.array(labels)
    pred = s > 1.0
    tp, fp = int((pred & (y == 1)).sum()), int((pred & (y == 0)).sum())
    tn, fn = int((~pred & (y == 0)).sum()), int((~pred & (y == 1)).sum())
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    return {
        "evaluated": True, "n_test": int(len(y)),
        "accuracy": round((tp + tn) / len(y), 4), "precision": round(prec, 4), "recall": round(rec, 4),
        "f1": round(2 * prec * rec / (prec + rec), 4) if prec + rec else 0.0,
        "auroc": round(float(roc_auc_score(y, s)), 4), "average_precision": round(float(average_precision_score(y, s)), 4),
        "false_alarm_rate": round(fp / (fp + tn), 4) if fp + tn else 0.0,
        "mean_pixel_iou": round(float(np.mean(ious)), 4) if ious else None,
        "confusion": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "per_type_accuracy": {k: round(float(np.mean(v)), 3) for k, v in per_type.items()},
    }
