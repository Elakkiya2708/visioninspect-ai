# VisionInspect AI — Manufacturing Defect Detection & Quality Inspection

Full-stack platform covering **Milestones 1-3** of the internship brief.

| Layer | Tech |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy (SQLite by default, PostgreSQL via `DATABASE_URL`), JWT auth |
| Computer vision | OpenCV, NumPy, scikit-learn (patch-feature anomaly model) |
| Frontend | React 18 + Vite, Tailwind CSS, Recharts, React Router |
| DevOps | Docker, Docker Compose, nginx |

## Quick start (local)

```bash
# 1) Backend  (Python 3.11+)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000               # API docs: http://localhost:8000/docs

# 2) Frontend (Node 18+) - new terminal
cd frontend
npm install
npm run dev                                              # http://localhost:5173
```

Demo logins (seeded on first start; change them via `.env` / `ADMIN_PASSWORD`):

| Role | Email | Password |
|---|---|---|
| Admin | admin@visioninspect.ai | Admin@123 |
| Quality Engineer | engineer@visioninspect.ai | Engineer@123 |
| Factory Supervisor | supervisor@visioninspect.ai | Supervisor@123 |

**First run walk-through:** Models & Dataset → *Generate demo dataset* → select `demo_metal_plate` → *Train & activate model* → *Inspect samples* (fills the dashboards) → open Dashboard / Analytics. Then try New Inspection (upload or camera simulation).

### Using the real MVTec AD dataset
Download from <https://www.mvtec.com/company/research/datasets/mvtec-ad> and extract categories (`bottle/`, `carpet/`, …) into `backend/data/datasets/mvtec_ad/` (or set `DATASET_ROOT`). The expected layout is the original one: `<cat>/train/good`, `<cat>/test/<defect>`, `<cat>/ground_truth/<defect>/*_mask.png`. They appear automatically in the UI. Use more clusters (4-8) for object categories (bottle, screw), 1-2 for textures (carpet, leather).

### Docker
```bash
cp .env.example .env   # set SECRET_KEY / passwords
docker compose up --build   # UI on http://localhost:8080 (PostgreSQL + API + nginx)
```

### Tests
```bash
cd backend
pytest                              # engine tests + 15 API tests (needs requirements.txt installed)
python tests/test_engine.py         # engine tests only
python scripts/validate_models.py   # regenerates docs/validation/* (metrics, figures)
```

## Milestone coverage

| Milestone | Delivered |
|---|---|
| **1 - Setup & core** | Architecture + DB schema (`models.py`), JWT auth, 3 roles with RBAC, user management + audit trail, image upload / batch / camera simulation / validation, inspection dashboard, dataset loader (MVTec layout) |
| **2 - Processing & detection** | Preprocessing pipeline (resize, non-local-means denoise, CLAHE), image-quality analysis report (sharpness, exposure, contrast, noise, grade), global feature extraction, trainable anomaly model with calibration + evaluation (accuracy, precision, recall, F1, AUROC, AP, false-alarm rate, pixel IoU), baseline detector that works with no training data, defect localisation (boxes, heat-map), model registry with versions |
| **3 - Classification & analytics** | Defect-type classification, **severity scoring framework** (30/25/25/20), QC decision engine (PASS / REVIEW / REWORK / REJECT), manual review workflow for supervisors, root-cause hints, PDF inspection certificate, CSV production report, dashboards (KPIs, trends, defect distribution, severity, per-category quality, quality-risk table), insights + trend alerts |
| **4 - Testing, deployment & docs** | Validation & benchmark script with real measured results (`docs/VALIDATION_REPORT.md`), improved classifier (72 % → 88 % type accuracy among detected defects on held-out data), API test-suite + CI workflow, performance work (eager loading, gzip, caching, code-splitting, thread-pooled batches), login throttling + security headers, Docker Compose with health checks, AWS/Azure deployment guide, technical documentation, user guide, demo script, presentation |

## Documentation
`docs/TECHNICAL_DOCUMENTATION.md` · `docs/VALIDATION_REPORT.md` · `docs/DEPLOYMENT_GUIDE.md` · `docs/USER_GUIDE.md` · `docs/DEMO_SCRIPT.md`

## How detection works

1. **Preprocess** each image to 256x256 (denoise + CLAHE).
2. **Features:** dense two-scale patch statistics (colour, local contrast, gradient energy/orientation).
3. **Model:** Mahalanobis distance to a k-cluster Gaussian model of *normal* patches, learned from `train/good`. The threshold is calibrated on held-out good images, so `1.0 == detection threshold`.
4. **Localise:** threshold the anomaly map, refine each blob to a tight mask, measure shape and contrast.
5. **Classify** (rules on elongation, solidity, darkness, colour shift...) and **score severity**:

`Severity = Size x 30% + Location x 25% + Defect-type x 25% + Confidence x 20%`
Critical >= 80 (reject) · High 60-79 (rework) · Medium 40-59 (review) · Low < 40 (pass). Detections under 70% confidence always go to manual review.

> **Note on the brief's worked example:** inputs 85/90/95/92 with the stated weights give **90.2**, not 88 as printed in the PDF (level is still Critical). The code and test follow the formula.

## Limitations (be upfront in your presentation)
* Defect classification is **rule-based** (7 classes). It reaches ~88% type accuracy among detected defects on held-out synthetic data (see the validation report); on MVTec you would replace/extend it with a supervised classifier trained on the labelled `test/<defect>` folders.
* The anomaly model is classical (patch statistics), not deep. It is fast and needs no GPU; for state-of-the-art MVTec numbers swap `AnomalyModel` for PatchCore / a YOLO or U-Net model behind the same `predict_map()` interface (`services/anomaly.py`).
* Location score treats the image centre as the "functional area". Make it per-product with a zone mask for real use.
* Training/inspection jobs run in background threads inside the API process - fine for a single instance; use a task queue (Celery/RQ) to scale out.
* Validated on synthetic data only (see `docs/VALIDATION_REPORT.md`); real MVTec AD results are not measured yet.

## Project layout
```
backend/app/{main,config,database,models,schemas,security,deps,serializers,seed}.py
backend/app/routers/      auth, users, inspections, analytics, dataset
backend/app/services/     validation, preprocessing, quality, anomaly, classification, severity,
                          pipeline, trainer, registry, insights, reports, synthetic
backend/tests/            engine tests
frontend/src/pages/       Login, Dashboard, NewInspection, Inspections, InspectionDetail, Analytics, Models, Users
```
