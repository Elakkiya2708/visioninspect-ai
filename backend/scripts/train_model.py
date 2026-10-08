"""Train + evaluate a category from the command line.  Usage: python scripts/train_model.py <category> [clusters]"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import settings  # noqa: E402
from app.services import trainer  # noqa: E402

if __name__ == "__main__":
    cat = sys.argv[1]
    k = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    out = settings.model_dir / cat / "cli.npz"
    _, metrics = trainer.train_category(cat, settings.DATASET_ROOT, out, "cli", k=k, progress=lambda p, m: print(f"{p * 100:3.0f}% {m}"))
    print(json.dumps(metrics, indent=2))
    print("Model saved to", out, "(register it from the UI by training there, or use the UI to retrain)")
