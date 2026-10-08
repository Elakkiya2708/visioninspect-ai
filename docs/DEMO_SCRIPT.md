# Demo Script (≈ 8 minutes)

**Before you start:** backend and frontend running, demo dataset generated, `demo_metal_plate` trained, *Inspect samples* run with 60 images, 14 days, 15 % defective. Have `backend/data/datasets/mvtec_ad/demo_metal_plate/test/crack/000.png` ready on the desktop.

| Min | Do | Say |
|---|---|---|
| 0:00 | Login page → sign in as **Quality Engineer** | "Three roles with role-based access; JWT authentication." |
| 0:30 | **Models & Dataset** → show categories, registry metrics | "Trained on defect-free images only; evaluated on held-out test images: accuracy, precision, recall, F1, AUROC, false-alarm rate." |
| 1:30 | **New Inspection** → drag in `crack/000.png` | "Validation, quality analysis, preprocessing, detection, classification, scoring — about 140 ms." |
| 2:00 | Report page: **Detections** tab, hover a box, then **Heatmap** and **Preprocessed** | "The heatmap shows where the model sees abnormal texture; boxes are linked to the defect table." |
| 3:00 | Severity breakdown panel | "30 % size, 25 % location, 25 % type, 20 % confidence. Critical ≥ 80 rejects the part; below 70 % confidence always goes to a human." |
| 4:00 | Click **PDF certificate** | "Traceable inspection record." |
| 4:15 | **Camera simulation** → 5 frames, 30 % defects | "Line-camera simulation; batch results with decisions." |
| 5:00 | Log out → **Supervisor** → open a REVIEW item → **Approve** with a note | "Human-in-the-loop; reviews are audited." |
| 5:45 | **Dashboard** → KPIs, trend, defect types, insights | "Live production quality, drift alerts, operational insights." |
| 6:30 | **Analytics** → risk table, categories, CSV export | "Quality-risk assessment per defect type and per product category." |
| 7:15 | Log in as **Admin** → User Management → audit trail | "Role management and a full audit trail." |
| 7:45 | Slide: validation results & limitations | "Validated on synthetic data; next step is real MVTec AD and a deep model." |

**Likely questions**

* *Why is the dashboard defect rate high?* — Sample images come from a test set that is mostly defective; set *Defective share* to ~15 %.
* *Is it deep learning?* — No: patch-statistics anomaly model (fast, no GPU). The `predict_map()` interface lets PatchCore / U-Net be swapped in.
* *How accurate is it?* — On synthetic held-out data: 90.6 % of defective parts detected, 0 of 90 good parts flagged, 88 % type accuracy among detected defects. Real-data accuracy is not yet measured.
* *Why does the severity example in the brief say 88?* — With the stated weights it is 90.2; both are Critical.
