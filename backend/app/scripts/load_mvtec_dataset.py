"""
Milestone 1 deliverable: "Load MVTec AD Dataset."

Walks a local MVTec Anomaly Detection dataset folder and registers every
image as a ProductImage record (source="dataset").

Usage:
    python -m app.scripts.load_mvtec_dataset /path/to/mvtec_ad --user-email admin@visioninspect.ai
"""
import argparse
import sys
from pathlib import Path

from PIL import Image

sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.db.database import SessionLocal
from app.db.models import ImageStatus, ProductImage, User

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"}


def load_dataset(dataset_root: Path, user_email: str) -> int:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            raise SystemExit(
                f"No user found with email '{user_email}'. Register that account first."
            )

        imported = 0
        for category_dir in sorted(p for p in dataset_root.iterdir() if p.is_dir()):
            product_line = category_dir.name
            for image_path in category_dir.rglob("*"):
                if image_path.suffix.lower() not in IMAGE_EXTS:
                    continue
                batch_code = image_path.parent.name
                try:
                    with Image.open(image_path) as img:
                        width, height = img.size
                except Exception:
                    continue

                record = ProductImage(
                    file_name=image_path.name,
                    stored_path=str(image_path),
                    content_type=f"image/{image_path.suffix.lstrip('.').lower()}",
                    size_bytes=image_path.stat().st_size,
                    width=width,
                    height=height,
                    product_line=product_line,
                    batch_code=batch_code,
                    source="dataset",
                    status=ImageStatus.VALIDATED,
                    validation_notes="Imported from MVTec AD reference dataset",
                )
                record.uploaded_by = user
                db.add(record)
                imported += 1

        db.commit()
        return imported
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import the MVTec AD dataset into VisionInspect AI.")
    parser.add_argument("dataset_path", type=Path, help="Path to the extracted MVTec AD folder")
    parser.add_argument("--user-email", required=True, help="Existing account to attribute the import to")
    args = parser.parse_args()

    if not args.dataset_path.exists():
        raise SystemExit(f"Dataset path does not exist: {args.dataset_path}")

    count = load_dataset(args.dataset_path, args.user_email)
    print(f"Imported {count} images from MVTec AD dataset.")
