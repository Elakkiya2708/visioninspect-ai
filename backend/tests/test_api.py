"""End-to-end API tests (auth, RBAC, inspection pipeline, analytics, training jobs).

Run:  cd backend && pytest
"""
import time

import cv2
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import synthetic

ADMIN = ("admin@visioninspect.ai", "Admin@123")
ENGINEER = ("engineer@visioninspect.ai", "Engineer@123")
SUPERVISOR = ("supervisor@visioninspect.ai", "Supervisor@123")


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # runs lifespan: create tables + seed users
        yield c


def auth(client, creds):
    r = client.post("/api/auth/login", json={"email": creds[0], "password": creds[1]})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def png(kind=None, seed=11, style="metal_plate"):
    img = synthetic.make_good(style, seed)
    if kind:
        img, _ = synthetic.inject_defect(img, kind, seed)
    ok, buf = cv2.imencode(".png", img)
    return buf.tobytes()


def wait_job(client, headers, job_id, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = client.get(f"/api/dataset/jobs/{job_id}", headers=headers).json()
        if j["status"] != "running":
            return j
        time.sleep(1)
    raise AssertionError("job timed out")


# ------------------------------------------------------------------ system / auth
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_login_me_and_bad_credentials(client):
    h = auth(client, ADMIN)
    me = client.get("/api/auth/me", headers=h).json()
    assert me["role"] == "admin" and me["email"] == ADMIN[0]
    assert client.post("/api/auth/login", json={"email": ADMIN[0], "password": "wrong"}).status_code == 401
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_register_rules(client):
    body = {"email": "new.user@example.com", "full_name": "New User", "password": "Passw0rd!x", "role": "factory_supervisor"}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201 and r.json()["user"]["role"] == "factory_supervisor"
    assert client.post("/api/auth/register", json=body).status_code == 409
    assert client.post("/api/auth/register", json={**body, "email": "x@example.com", "role": "admin"}).status_code == 400
    assert client.post("/api/auth/register", json={**body, "email": "y@example.com", "password": "short"}).status_code == 422


def test_login_rate_limit(client):
    for _ in range(8):
        assert client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope"}).status_code == 429


# ------------------------------------------------------------------ RBAC / users
def test_rbac(client):
    eng, sup, adm = auth(client, ENGINEER), auth(client, SUPERVISOR), auth(client, ADMIN)
    assert client.get("/api/users", headers=eng).status_code == 403
    assert client.get("/api/users", headers=adm).status_code == 200
    assert client.post("/api/dataset/generate-demo", headers=sup).status_code == 403


def test_admin_user_management(client):
    adm = auth(client, ADMIN)
    r = client.post("/api/users", headers=adm, json={"email": "ops@example.com", "full_name": "Ops Person", "password": "Passw0rd!x", "role": "quality_engineer"})
    assert r.status_code == 201
    uid = r.json()["id"]
    assert client.patch(f"/api/users/{uid}", headers=adm, json={"role": "factory_supervisor"}).json()["role"] == "factory_supervisor"
    assert client.patch(f"/api/users/{uid}", headers=adm, json={"is_active": False}).json()["is_active"] is False
    me = client.get("/api/auth/me", headers=adm).json()
    assert client.patch(f"/api/users/{me['id']}", headers=adm, json={"role": "quality_engineer"}).status_code == 400
    assert client.get("/api/users/audit", headers=adm).status_code == 200


# ------------------------------------------------------------------ inspection pipeline
def test_invalid_upload_is_reported_not_crashed(client):
    h = auth(client, ENGINEER)
    r = client.post("/api/inspections", headers=h, data={"category": "general"},
                    files=[("files", ("bad.png", b"not really an image", "image/png"))])
    assert r.status_code == 201
    res = r.json()["results"][0]
    assert res["status"] == "invalid" and "decoded" in res["error"]
    r = client.post("/api/inspections", headers=h, data={"category": "general"},
                    files=[("files", ("bad.gif", b"GIF89a", "image/gif"))])
    assert r.json()["results"][0]["status"] == "invalid"


def test_single_inspection_detail_images_and_pdf(client):
    h = auth(client, ENGINEER)
    r = client.post("/api/inspections", headers=h, data={"category": "general"},
                    files=[("files", ("crack.png", png("crack"), "image/png"))])
    assert r.status_code == 201
    res = r.json()["results"][0]
    assert res["status"] == "completed" and res["code"].startswith("INS-")
    assert res["decision"] in {"PASS", "REVIEW", "REWORK", "REJECT"}
    iid = res["id"]
    d = client.get(f"/api/inspections/{iid}", headers=h).json()
    assert d["quality"]["grade"] in "ABCD" and "preprocessing" in d and isinstance(d["defects"], list)
    for kind in ("original", "processed", "heatmap", "overlay"):
        img = client.get(f"/api/inspections/{iid}/image/{kind}", headers=h)
        assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert client.get(f"/api/inspections/{iid}/image/nope", headers=h).status_code == 404
    pdf = client.get(f"/api/inspections/{iid}/report.pdf", headers=h)
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
    assert client.get(f"/api/inspections/{iid}").status_code == 401


def test_batch_and_camera(client):
    h = auth(client, ENGINEER)
    files = [("files", (f"p{i}.png", png(k, seed=20 + i), "image/png")) for i, k in enumerate([None, "scratch", "hole"])]
    r = client.post("/api/inspections", headers=h, data={"category": "general"}, files=files).json()
    assert r["batch_id"] and r["summary"]["completed"] == 3
    c = client.post("/api/inspections/camera", headers=h, json={"category": "demo_metal_plate", "count": 2, "defect_probability": 1.0})
    assert c.status_code == 201 and len(c.json()["results"]) == 2
    assert all(x["source"] == "camera" for x in c.json()["results"])


def test_review_workflow_and_permissions(client):
    eng, sup = auth(client, ENGINEER), auth(client, SUPERVISOR)
    r = client.post("/api/inspections", headers=eng, data={"category": "general"}, files=[("files", ("h.png", png("hole"), "image/png"))])
    iid = r.json()["results"][0]["id"]
    assert client.post(f"/api/inspections/{iid}/review", headers=eng, json={"action": "approved"}).status_code == 403
    assert client.post(f"/api/inspections/{iid}/review", headers=sup, json={"action": "bogus"}).status_code == 422
    out = client.post(f"/api/inspections/{iid}/review", headers=sup, json={"action": "rework", "note": "re-machine edge"})
    assert out.status_code == 200 and out.json()["review_status"] == "rework" and out.json()["needs_review"] is False


def test_list_filter_search_export_and_delete(client):
    h = auth(client, ADMIN)
    page = client.get("/api/inspections?page=1&page_size=5", headers=h).json()
    assert page["total"] >= 4 and len(page["items"]) <= 5 and page["pages"] >= 1
    code = page["items"][0]["code"]
    assert client.get(f"/api/inspections?search={code}", headers=h).json()["total"] == 1
    only = client.get("/api/inspections?decision=PASS", headers=h).json()["items"]
    assert all(i["decision"] == "PASS" for i in only)
    csv = client.get("/api/inspections/export.csv", headers=h)
    assert csv.status_code == 200 and "text/csv" in csv.headers["content-type"] and code in csv.text
    iid = page["items"][0]["id"]
    eng = auth(client, ENGINEER)
    assert client.delete(f"/api/inspections/{iid}", headers=eng).status_code == 403
    assert client.delete(f"/api/inspections/{iid}", headers=h).status_code == 204
    assert client.get(f"/api/inspections/{iid}", headers=h).status_code == 404


# ------------------------------------------------------------------ analytics
def test_analytics_endpoints(client):
    h = auth(client, SUPERVISOR)
    s = client.get("/api/analytics/summary?days=14", headers=h).json()
    assert s["total"] >= 3 and 0 <= s["pass_rate"] <= 100 and "previous" in s
    t = client.get("/api/analytics/trends?days=7", headers=h).json()
    assert len(t) == 7 and {"label", "inspected", "defect_rate"} <= set(t[0])
    assert "types" in client.get("/api/analytics/defect-types", headers=h).json()
    sev = client.get("/api/analytics/severity", headers=h).json()
    assert [x["level"] for x in sev["levels"]] == ["None", "Low", "Medium", "High", "Critical"]
    assert isinstance(client.get("/api/analytics/categories", headers=h).json(), list)
    ins = client.get("/api/analytics/insights", headers=h).json()
    assert ins["insights"] and "alerts" in ins


# ------------------------------------------------------------------ dataset -> train -> inspect
def test_dataset_training_and_sample_jobs(client):
    h = auth(client, ADMIN)
    job = wait_job(client, h, client.post("/api/dataset/generate-demo", headers=h).json()["job_id"])
    assert job["status"] == "completed", job
    status = client.get("/api/dataset/status", headers=h).json()
    names = {c["name"] for c in status["categories"]}
    assert {"demo_metal_plate", "demo_fabric", "demo_ceramic_tile"} <= names
    assert client.post("/api/dataset/train", headers=h, json={"category": "does_not_exist"}).status_code == 404
    assert client.post("/api/dataset/train", headers=h, json={"category": "../etc"}).status_code in (400, 404)

    job = wait_job(client, h, client.post("/api/dataset/train", headers=h, json={"category": "demo_metal_plate", "clusters": 4, "max_train_images": 40}).json()["job_id"])
    assert job["status"] == "completed", job
    m = job["result"]
    assert m["active"] is True and m["metrics"]["auroc"] >= 0.9
    models = client.get("/api/dataset/models?category=demo_metal_plate", headers=h).json()
    assert len(models) == 1

    job = wait_job(client, h, client.post("/api/dataset/inspect-samples", headers=h, json={"category": "demo_metal_plate", "count": 8, "spread_days": 5, "defect_ratio": 0.5}).json()["job_id"])
    assert job["status"] == "completed" and job["result"]["mode"] == "trained"
    s = client.get("/api/analytics/summary?days=14", headers=h).json()
    assert s["labelled_samples"] >= 8 and "accuracy" in s

    res = client.post("/api/inspections", headers=h, data={"category": "demo_metal_plate"}, files=[("files", ("c.png", png("crack", seed=999), "image/png"))]).json()["results"][0]
    assert res["model_mode"] == "trained" and res["model_name"].startswith("patchstat-demo_metal_plate")
