"""Milestone 4 validation: detection accuracy, classification quality and latency benchmark.

Usage:  python scripts/validate_models.py [--out ../docs/validation] [--train 60] [--per-defect 12]
Generates a fresh synthetic MVTec-style dataset in a temp folder (so results are reproducible),
trains one model per category, evaluates on held-out test images and writes JSON + PNG figures.
Point --dataset at a real MVTec AD root to validate on real data instead.
"""
import argparse
import json
import statistics
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import cv2  # noqa: E402
import numpy as np  # noqa: E402

from app.services import synthetic, trainer  # noqa: E402
from app.services.pipeline import inspect_image  # noqa: E402

TRUTH = {"scratch": "Scratch", "crack": "Crack", "stain": "Stain / Contamination",
         "hole": "Hole / Missing Material", "dent": "Dent / Deformation"}
LABELS = list(TRUTH.values()) + ["Discoloration", "Surface Anomaly", "MISSED"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "docs" / "validation"))
    ap.add_argument("--train", type=int, default=60)
    ap.add_argument("--per-defect", type=int, default=12)
    ap.add_argument("--good", type=int, default=30)
    ap.add_argument("--seed", type=int, default=2026)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp())
    synthetic.generate_dataset(tmp / "ds", n_train=a.train, n_test_good=a.good, n_test_per_defect=a.per_defect, seed=a.seed)

    report = {"config": vars(a), "categories": {}, "classification": {}, "performance": {}}
    conf = {t: {l: 0 for l in LABELS} for t in TRUTH.values()}
    latencies, severity_by_truth, decisions = [], {}, {}
    fp = n_good = 0
    samples_saved = 0

    for style in synthetic.STYLES:
        cat = f"demo_{style}"
        model, metrics = trainer.train_category(cat, tmp / "ds", tmp / f"{cat}.npz", 1)
        report["categories"][cat] = metrics
        print(f"{cat}: AUROC {metrics['auroc']} F1 {metrics['f1']} recall {metrics['recall']} FAR {metrics['false_alarm_rate']}")
        for f in sorted((tmp / "ds" / cat / "test" / "good").glob("*.png")):
            r = inspect_image(f.read_bytes(), f.name, model)
            n_good += 1
            fp += bool(r["is_anomalous"])
            latencies.append(r["processing_ms"])
            decisions.setdefault("good", {}).setdefault(r["decision"], 0)
            decisions["good"][r["decision"]] += 1
        for kind, truth in TRUTH.items():
            for f in sorted((tmp / "ds" / cat / "test" / kind).glob("*.png")):
                r = inspect_image(f.read_bytes(), f.name, model)
                latencies.append(r["processing_ms"])
                pred = r["defects"][0]["type"] if r["defects"] else "MISSED"
                conf[truth][pred] += 1
                severity_by_truth.setdefault(truth, []).append(r["severity_score"])
                decisions.setdefault(kind, {}).setdefault(r["decision"], 0)
                decisions[kind][r["decision"]] += 1
                if samples_saved < 6 and style == "metal_plate" and f.stem == "000":
                    for k in ("overlay", "heatmap"):
                        (out / f"sample_{kind}_{k}.jpg").write_bytes(r["images"][k])
                    (out / f"sample_{kind}_original.jpg").write_bytes(r["images"]["original"])
                    samples_saved += 1

    total = sum(sum(v.values()) for v in conf.values())
    correct = sum(conf[t][t] for t in conf)
    detected = total - sum(conf[t]["MISSED"] for t in conf)
    report["classification"] = {
        "samples": total, "detection_rate": round(detected / total, 4),
        "type_accuracy_all": round(correct / total, 4),
        "type_accuracy_of_detected": round(correct / max(detected, 1), 4),
        "per_type_recall": {t: round(conf[t][t] / max(sum(conf[t].values()), 1), 3) for t in conf},
        "confusion": conf, "good_parts": n_good, "good_parts_flagged": fp,
        "false_defect_rate": round(fp / max(n_good, 1), 4),
        "mean_severity_by_defect": {t: round(statistics.mean(v), 1) for t, v in severity_by_truth.items()},
        "decisions": decisions,
    }

    # ---- single-image latency + batch throughput
    lat = sorted(latencies)
    report["performance"]["latency_ms"] = {"mean": round(statistics.mean(lat)), "p50": lat[len(lat) // 2],
                                           "p95": lat[int(len(lat) * 0.95) - 1], "max": lat[-1], "n": len(lat)}
    files = sorted((tmp / "ds" / "demo_metal_plate" / "test" / "crack").glob("*.png")) * 3
    blobs = [f.read_bytes() for f in files[:24]]
    from concurrent.futures import ThreadPoolExecutor
    for workers in (1, 2, 4):
        t = time.perf_counter()
        with ThreadPoolExecutor(workers) as ex:
            list(ex.map(lambda b: inspect_image(b, "x.png", None), blobs))
        dt = time.perf_counter() - t
        report["performance"][f"throughput_{workers}_workers_img_per_s"] = round(len(blobs) / dt, 2)
    t = time.perf_counter()
    inspect_image(blobs[0], "x.png", None)
    report["performance"]["cold_single_baseline_ms"] = round((time.perf_counter() - t) * 1000)

    (out / "validation_results.json").write_text(json.dumps(report, indent=2))
    make_figures(report, out)
    print(json.dumps({k: report[k] for k in ("classification", "performance")}, indent=1)[:2500])


def make_figures(rep, out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    navy, indigo, cyan, rose = "#0b1220", "#4f46e5", "#06b6d4", "#e11d48"
    plt.rcParams.update({"font.family": "DejaVu Sans", "axes.spines.top": False, "axes.spines.right": False})

    # 1 detection metrics per category
    cats = list(rep["categories"])
    keys = [("accuracy", "Accuracy"), ("precision", "Precision"), ("recall", "Recall"), ("f1", "F1"), ("auroc", "AUROC")]
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=160)
    w = 0.16
    for i, (k, lbl) in enumerate(keys):
        vals = [rep["categories"][c][k] for c in cats]
        ax.bar(np.arange(len(cats)) + (i - 2) * w, vals, w, label=lbl, color=[indigo, cyan, "#10b981", "#f59e0b", rose][i])
    ax.set_xticks(range(len(cats)))
    ax.set_xticklabels([c.replace("demo_", "") for c in cats])
    ax.set_ylim(0, 1.08)
    ax.set_title("Defect detection - held-out test set", fontweight="bold", loc="left")
    ax.legend(ncol=5, frameon=False, fontsize=8, loc="lower center", bbox_to_anchor=(0.5, -0.22))
    fig.tight_layout()
    fig.savefig(out / "fig_detection_metrics.png")
    plt.close(fig)

    # 2 confusion matrix
    conf = rep["classification"]["confusion"]
    rows = list(conf)
    cols = [c for c in LABELS if any(conf[r][c] for r in rows) or c in rows]
    M = np.array([[conf[r][c] for c in cols] for r in rows], float)
    Mn = M / np.maximum(M.sum(1, keepdims=True), 1)
    fig, ax = plt.subplots(figsize=(8, 4.6), dpi=160)
    ax.imshow(Mn, cmap="Blues", vmin=0, vmax=1)
    ax.set_xticks(range(len(cols)))
    ax.set_xticklabels([c.replace(" / ", "/\n") for c in cols], fontsize=7)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels(rows, fontsize=8)
    for i in range(len(rows)):
        for j in range(len(cols)):
            if M[i, j]:
                ax.text(j, i, int(M[i, j]), ha="center", va="center", fontsize=8, color="white" if Mn[i, j] > 0.5 else navy)
    ax.set_xlabel("Predicted type")
    ax.set_ylabel("True defect")
    ax.set_title("Defect-type classification - confusion matrix", fontweight="bold", loc="left")
    fig.tight_layout()
    fig.savefig(out / "fig_confusion_matrix.png")
    plt.close(fig)

    # 3 throughput
    p = rep["performance"]
    ws = [1, 2, 4]
    vals = [p[f"throughput_{w}_workers_img_per_s"] for w in ws]
    fig, ax = plt.subplots(figsize=(5.2, 3.6), dpi=160)
    bars = ax.bar([f"{w} worker{'s' if w > 1 else ''}" for w in ws], vals, color=[cyan, indigo, navy])
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v, f"{v}", ha="center", va="bottom", fontsize=9, fontweight="bold")
    ax.set_ylabel("images / second")
    ax.set_title("Batch throughput (baseline detector)", fontweight="bold", loc="left", fontsize=10)
    fig.tight_layout()
    fig.savefig(out / "fig_throughput.png")
    plt.close(fig)


if __name__ == "__main__":
    main()
