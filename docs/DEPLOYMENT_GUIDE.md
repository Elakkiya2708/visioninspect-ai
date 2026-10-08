# Deployment Guide

Three ways to run VisionInspect AI, from simplest to production-style. The container images are the same everywhere.

## 1. Local development (no Docker)

```bash
cd backend && python -m venv .venv && .venv\Scripts\activate      # Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# new terminal
cd frontend && npm install && npm run dev                          # http://localhost:5173
```
SQLite is used automatically (`backend/data/visioninspect.db`).

## 2. Docker Compose (PostgreSQL + API + nginx)

```bash
cp .env.example .env          # set SECRET_KEY (long random) and POSTGRES_PASSWORD
docker compose up --build -d
docker compose ps             # backend should become "healthy"
```
Open **http://localhost:8080**. Data lives in the named volumes `pgdata` (database) and `appdata` (images + models).

Useful commands

| Task | Command |
|---|---|
| Logs | `docker compose logs -f backend` |
| Stop / start | `docker compose stop` / `docker compose start` |
| Rebuild after code change | `docker compose up --build -d` |
| Back up database | `docker compose exec db pg_dump -U visioninspect visioninspect > backup.sql` |
| Back up images & models | `docker run --rm -v visioninspect-ai_appdata:/data -v "$PWD":/b alpine tar czf /b/appdata.tgz -C /data .` |
| Wipe everything | `docker compose down -v` |

## 3. Cloud deployment

### 3a. AWS — single EC2 instance (simplest, recommended for the internship demo)

1. **Launch** an EC2 instance: Ubuntu 22.04/24.04, `t3.medium` (2 vCPU, 4 GB) or larger, 20 GB disk.
   Security group: inbound TCP 22 (your IP only), 80 and 443 (anywhere).
2. **Install Docker:**
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker $USER && newgrp docker
   ```
3. **Copy the project** (`git clone <your repo>` or `scp -r`), then:
   ```bash
   cp .env.example .env && nano .env      # strong SECRET_KEY + POSTGRES_PASSWORD, set SEED_DEMO_USERS=false for real use
   # edit docker-compose.yml: change  ports: ["8080:80"]  to  ports: ["80:80"]
   #                          and set CORS_ORIGINS to http://<your-domain-or-ip>
   docker compose up --build -d
   ```
4. Open `http://<EC2 public IP>`. For a domain + HTTPS, put the instance behind an **Application Load Balancer with an
   ACM certificate**, or install Caddy/nginx + Let's Encrypt on the host and proxy to port 80.
5. **Scaling path:** images and models → **S3**, database → **RDS PostgreSQL** (set `DATABASE_URL`), containers → **ECS Fargate**
   behind an ALB. Training jobs would then move to a queue (see Future Work in the technical documentation).

### 3b. Azure — Virtual Machine with Docker (same steps)

1. Create an Ubuntu VM (`Standard_B2s` or larger); open ports 80/443 in the Network Security Group.
2. Install Docker as above, copy the project, configure `.env`, run `docker compose up --build -d`.

### 3c. Azure — Container Apps (managed containers)

```bash
az group create -n visioninspect-rg -l centralindia
az acr create -g visioninspect-rg -n <uniqueAcrName> --sku Basic
az acr build -r <uniqueAcrName> -t backend:1 ./backend
az acr build -r <uniqueAcrName> -t frontend:1 ./frontend
az postgres flexible-server create -g visioninspect-rg -n <uniquePgName> --admin-user vi --admin-password '<strong-pw>' --sku-name Standard_B1ms
az containerapp env create -g visioninspect-rg -n vi-env -l centralindia
az containerapp create -g visioninspect-rg -n vi-backend --environment vi-env --image <acr>.azurecr.io/backend:1 \
   --target-port 8000 --ingress internal --min-replicas 1 --max-replicas 1 \
   --env-vars DATABASE_URL='postgresql+psycopg2://vi:<pw>@<pg>.postgres.database.azure.com:5432/postgres?sslmode=require' SECRET_KEY='<long-random>' DATA_DIR=/data
az containerapp create -g visioninspect-rg -n vi-frontend --environment vi-env --image <acr>.azurecr.io/frontend:1 \
   --target-port 80 --ingress external
```
Notes: keep **one backend replica** (training jobs and the login throttle are in-process); mount an Azure Files share at `/data`
for images and models; change the `proxy_pass` host in `frontend/nginx.conf` to the backend app's internal FQDN.
Names, SKUs and regions are examples — check current Azure CLI syntax before running; commands were not executed in this project.

## 4. Configuration reference (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | SQLite file in `DATA_DIR` | e.g. `postgresql+psycopg2://user:pw@host:5432/db` |
| `SECRET_KEY` | insecure default (warning logged) | JWT signing key — **must** be changed in production |
| `ACCESS_TOKEN_MINUTES` | 720 | token lifetime |
| `DATA_DIR` | `backend/data` | images, models, SQLite |
| `DATASET_ROOT` | `DATA_DIR/datasets/mvtec_ad` | where MVTec-style categories live |
| `MAX_UPLOAD_MB` | 20 | per-image limit |
| `INFERENCE_WORKERS` | min(4, CPUs) | threads for batch inspection |
| `CORS_ORIGINS` | localhost dev ports | comma-separated allowed origins |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin@visioninspect.ai / Admin@123 | seeded admin |
| `SEED_DEMO_USERS` | true | create the engineer + supervisor demo accounts |

## 5. Production checklist

- [ ] Strong `SECRET_KEY`, changed admin password, `SEED_DEMO_USERS=false`
- [ ] HTTPS in front of the app; `CORS_ORIGINS` set to the real origin
- [ ] Backups for the database and the `appdata` volume
- [ ] Run one backend instance (or move jobs/throttle to Redis + a queue before scaling out)
- [ ] Monitor `/api/health` (used by the Docker healthcheck)

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| UI loads, login says network error | backend not healthy: `docker compose logs backend` |
| 502 from nginx | backend still starting, or `proxy_pass` host wrong |
| `psycopg2` build error on local install | delete it from `requirements.txt` when using SQLite |
| Large uploads fail | raise `client_max_body_size` in `frontend/nginx.conf` |
| Training says "Need at least 8 good training images" | category has fewer than 8 images in `train/good` |
