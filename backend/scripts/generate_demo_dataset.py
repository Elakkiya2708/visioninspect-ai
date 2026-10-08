"""Create the synthetic MVTec-AD-style demo dataset.  Usage: python scripts/generate_demo_dataset.py [out_dir]"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import settings  # noqa: E402
from app.services.synthetic import generate_dataset  # noqa: E402

if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else settings.DATASET_ROOT
    print("Generated:", generate_dataset(out, progress=lambda p: print(f"  {p * 100:3.0f}%")), "->", out)
