# User Guide

## Roles

| Role | Can do |
|---|---|
| **Administrator** | everything: users & roles, audit trail, models, review, delete inspections |
| **Quality Engineer** | inspect, manage dataset & train models, analytics |
| **Factory Supervisor** | inspect, **review/approve decisions**, analytics |

Demo accounts: `admin@visioninspect.ai / Admin@123`, `engineer@visioninspect.ai / Engineer@123`, `supervisor@visioninspect.ai / Supervisor@123`.

## First-time setup (Engineer or Admin)

1. **Models & Dataset → Generate demo dataset** (or copy real MVTec AD categories into `backend/data/datasets/mvtec_ad/`).
2. Click a category card → **Train & activate model** (10–30 s). Accuracy, precision, recall, F1, AUROC and the false-alarm rate appear in the model registry.
3. **Inspect samples** to fill the dashboards with realistic history (set *Defective share* to ~15 % for a realistic factory).

## Inspecting parts

* **New Inspection → Upload:** drop one or many images (JPG, PNG, BMP, TIFF, WebP ≤ 20 MB). One image opens its report; several create a **batch** with a results list. Files that fail validation are listed with the reason.
* **Camera simulation:** captures simulated frames from the line and inspects them automatically.
* Pick the **product category** first — it selects the trained model. Without a trained model the baseline detector is used (banner shows which).

## Reading a report

* **Banner:** decision (PASS / REVIEW / REWORK / REJECT), severity score, number of defects, processing time, recommendation.
* **Image tabs:** Detections (interactive boxes — hover or click to link with the table), Original, Preprocessed (model input), Anomaly heatmap.
* **Severity breakdown:** size 30 %, location 25 %, type 25 %, confidence 20 %.
* **Quality-control action:** recommendation, probable root cause, review state, PDF certificate.
* **Image quality report:** sharpness, brightness, contrast, noise, exposure and warnings (re-capture if the grade is D).

| Severity | Score | Decision |
|---|---|---|
| Critical | 80–100 | REJECT |
| High | 60–79 | REWORK |
| Medium | 40–59 | REVIEW |
| Low | 0–39 | PASS (REVIEW if confidence < 70 %) |

## Reviewing (Supervisor / Admin)

Open an inspection → **Approve**, **Rework** or **Reject** → add a note → Confirm. The review is stored with your name and time and appears on the PDF.
*Inspections → Needs review* lists the queue.

## Analytics

* **Dashboard:** KPIs vs the previous period, volume & defect-rate trend, defect types, severity, insights, alerts (e.g. defect rate above 35 % in the last 20 parts, or 3 consecutive rejects), recent inspections.
* **Analytics:** decisions per day, defect-rate/severity trend, severity levels, quality-risk table, per-category production quality, **CSV production report**. If simulated/dataset samples exist it also shows decision accuracy, detection rate and false-defect rate against their known labels.

## Administration

**User Management:** add users, change roles, disable accounts, view the audit trail.
