# VisionInspect AI — Milestone 1 & 2

**Manufacturing Defect Detection & Quality Inspection System**
Milestone 1: Project Initialization, Design Process & Core Setup
Milestone 2: Image Processing & Defect Detection

## Milestone 1 — what's included

- **User Management** — registration, JWT login, role-based access control
  (Quality Engineer / Factory Supervisor / Production Manager / Admin), role
  management endpoints.
- **Image Acquisition Module** — single upload, batch upload (up to 50 images),
  a camera-integration simulation endpoint, and image validation (type, size,
  integrity checks via Pillow).
- **Inspection Dashboard** — live stats (total / validated / uploaded /
  rejected / storage used), status filtering, and real image thumbnails.
- **Object Detection preview** — a working, general-purpose multi-object
  detector (TensorFlow.js + COCO-SSD, runs entirely client-side, no backend/
  GPU setup) that boxes and labels every recognizable object in an uploaded
  image with a confidence score. Demonstrates the live detection pipeline;
  the manufacturing-defect–specific model is Milestone 2.
- **Light / dark theme** — toggle in the sidebar and on the auth pages,
  persisted per-browser, professional navy/blue palette, no flash-of-
  wrong-theme on load.
- **MVTec AD dataset loader** — `backend/app/scripts/load_mvtec_dataset.py`.
- Dockerfiles + `docker-compose.yml` for both services.

## Milestone 2 — what's included

**Technique:** reference-image (golden-sample) differencing — the same
principle real Automated Optical Inspection (AOI) machines use on
production lines. This is a classical computer-vision pipeline
(OpenCV + scikit-image SSIM), not a trained neural network — it needs
no dataset or GPU and works immediately once a reference image exists
for a product line. A CNN/YOLO-based detector trained on labeled defect
images (e.g. MVTec AD) is a natural upgrade path once enough labeled
data is available.

- **Image Processing** (`app/vision/preprocessing.py`) — denoising
  (non-local means), contrast enhancement (CLAHE), and an image-quality
  report (brightness / contrast / sharpness, flags blurry/under/over-exposed
  shots) for every inspected image.
- **Defect Detection** (`app/vision/defect_detector.py`) — aligns the test
  image to a stored reference, computes a structural-similarity (SSIM)
  difference map, thresholds it (Otsu), cleans it up (morphological
  open/close), and extracts bounding boxes for each differing region via
  contour detection.
- **API** (`app/routers/inspection.py`):
  - `POST /api/inspection/reference` — set/replace the golden-sample image
    for a product line
  - `GET /api/inspection/reference` — list reference images
  - `POST /api/inspection/analyze/{image_id}` — run detection on an
    already-uploaded product image, store and return the prediction
  - `GET /api/inspection/predictions` — list past predictions
- **UI** — "Defect Inspection" page: upload a reference image per product
  line, pick an inspected image, run analysis, see the defect regions
  drawn as bounding boxes over the image, plus similarity score, affected
  area %, and a pass/fail/inconclusive verdict.

**Important — how product lines are matched:** an image can only be
analyzed if its `product_line` (set at upload time, in Image Acquisition)
matches a reference image's product line. This match is **case-insensitive
and whitespace-trimmed** ("Bottle", "bottle", " bottle " are all the same
line), but the image must still have *some* product line set — an image
uploaded with that field left blank has nothing to match against, and the
Defect Inspection page will show "⚠ no reference set" for it.

## End-to-end test checklist (do this in order)

1. Register an account, log in.
2. **Image Acquisition** → upload an image, filling in **Product line**
   (e.g. `bottle`). Confirm it shows "Validated".
3. **Defect Inspection** → Step 1, add a reference image for the exact same
   product line (`bottle`) — ideally a "known good" photo.
4. Upload a second, different test image for the same product line via
   Image Acquisition (different angle, or a visibly different/damaged item
   makes the defect boxes obvious).
5. **Defect Inspection** → Step 2, select that test image, click
   "Run defect analysis". You should see a similarity score, a pass/fail
   verdict, and (if the images differ) red bounding boxes around the
   differing regions.
6. **Object Detection** → upload any common object photo (bottle, cup,
   laptop, person) and confirm labeled bounding boxes appear.
7. Toggle light/dark theme from the sidebar and confirm it persists on
   refresh.

## Project structure

```
visioninspect-ai/
├── backend/                 FastAPI service
│   ├── app/
│   │   ├── core/             config.py, security.py (JWT + bcrypt)
│   │   ├── db/                database.py, models.py
│   │   ├── routers/           auth.py, images.py, inspection.py
│   │   ├── vision/            preprocessing.py, defect_detector.py
│   │   ├── scripts/           load_mvtec_dataset.py
│   │   ├── dependencies.py    get_current_user / require_role
│   │   ├── schemas.py
│   │   └── main.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                 React + TypeScript + Tailwind (Vite)
│   └── src/
│       ├── pages/             Login, Register, Dashboard, Upload,
│       │                      Inspect (Milestone 2), Detect
│       ├── components/        Sidebar, StatCard, ImageCard, Logo,
│       │                      ThemeToggle, ProtectedRoute
│       ├── context/           AuthContext, ThemeContext
│       └── lib/api.ts
└── docker-compose.yml
```

## Run locally

### Backend

**macOS / Linux:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

**Windows (Command Prompt):**
```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs — visit `/api/health` to confirm the server is up.

**Note:** `opencv-python-headless` and `scikit-image` are larger downloads
than the Milestone 1 packages — the first `pip install` will take longer
(2-5 minutes) and needs roughly 600MB–1GB of free disk space. This is
expected, not an error. If `pip install` fails with "No space left on
device", free up disk space (see below) and re-run it — already-downloaded
packages are cached and won't re-download.

### Frontend

**macOS / Linux:**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

**Windows (Command Prompt):**
```bat
cd frontend
npm install
copy .env.example .env
npm run dev
```

App: http://localhost:5173 — run this in a **second** terminal window while the backend keeps running in the first.

### With Docker

```bash
docker compose up --build
```

## Load the MVTec AD dataset (optional)

```bash
cd backend
python -m app.scripts.load_mvtec_dataset /path/to/mvtec_ad --user-email you@plant.com
```

(Register an account first — the import attributes records to an existing user.)

## Roles

| Role | Can do |
|---|---|
| Quality Engineer | Upload/view images, run inspections, view dashboard |
| Factory Supervisor | Above + view all user accounts |
| Production Manager | Above + reassign user roles |
| Admin | Full access |

## Tech stack

**Backend:** FastAPI, SQLAlchemy, SQLite (swap `DATABASE_URL` for
PostgreSQL), JWT (python-jose), bcrypt (passlib), Pillow, OpenCV
(opencv-python-headless), scikit-image (SSIM), NumPy.
**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, React Router,
Axios, TensorFlow.js + COCO-SSD (CDN).

## Troubleshooting (issues hit and fixed during real setup)

| Symptom | Cause | Fix |
|---|---|---|
| `ImportError: email-validator is not installed` | Missing dependency for pydantic `EmailStr` | Already in `requirements.txt` |
| `ValueError: password cannot be longer than 72 bytes` on register | `passlib` + `bcrypt` 4.1+ incompatibility | `bcrypt==4.0.1` pinned in `requirements.txt` |
| Batch upload always "Rejected" / `[object Object]` | Manually-set multipart `Content-Type` header lacked the boundary | Already fixed — browser sets the header itself |
| Upload silently fails with 422 "Field required" | React state race condition — files read from state before it updated | Already fixed — stable per-file IDs + a synchronous submit lock |
| `numpy`/`opencv` fail to install with a compiler error | An exact version pin lacked a prebuilt wheel for your Python version | `requirements.txt` uses version *ranges* for these, so pip picks a compatible wheel automatically |
| `pip install` fails with "No space left on device" | Not enough free disk space (Milestone 2 deps need ~600MB–1GB) | Free space (`pip cache purge`, delete old `.venv`/`node_modules` copies, Windows Disk Cleanup), then re-run `pip install` |
| Defect Inspection shows "⚠ no reference set" for every image | The image's Product line field was left blank at upload, or doesn't match the reference's product line | Re-upload with Product line filled in — matching is case-insensitive but the field must be set |
| `'source' is not recognized` / `'cp' is not recognized` on Windows | Windows cmd doesn't have these Unix commands | Use `.venv\Scripts\activate` and `copy` instead |
