from collections import Counter, defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import current_user
from ..models import Defect, Inspection, User, utcnow
from ..services.insights import build_alerts, build_insights

router = APIRouter(prefix="/analytics", tags=["analytics"])
LEVELS = ["None", "Low", "Medium", "High", "Critical"]


def _rows(db, days, offset_days=0):
    end = utcnow() - timedelta(days=offset_days)
    return (db.query(Inspection).options(selectinload(Inspection.defects))
            .filter(Inspection.status == "completed", Inspection.created_at >= end - timedelta(days=days),
                    Inspection.created_at <= end).all())


def _pct(a, b):
    return round(a / b * 100, 1) if b else 0.0


def _kpis(rows):
    n = len(rows)
    fail = sum(r.decision != "PASS" for r in rows)
    return {"total": n, "passed": n - fail, "failed": fail, "pass_rate": _pct(n - fail, n), "defect_rate": _pct(fail, n),
            "critical": sum(r.severity_level == "Critical" for r in rows),
            "rejected": sum(r.decision == "REJECT" for r in rows),
            "avg_severity": round(sum(r.severity_score for r in rows if r.severity_score) / max(1, sum(1 for r in rows if r.severity_score)), 1),
            "avg_processing_ms": round(sum(r.processing_ms for r in rows) / n) if n else 0,
            "automation_rate": _pct(sum(1 for r in rows if not r.needs_review or r.review_status), n)}


@router.get("/summary")
def summary(days: int = Query(14, ge=1, le=365), db: Session = Depends(get_db), _: User = Depends(current_user)):
    cur, prev = _rows(db, days), _rows(db, days, days)
    k, p = _kpis(cur), _kpis(prev)
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    k["today"] = sum(1 for r in cur if r.created_at >= today)
    k["pending_review"] = db.query(Inspection).filter(Inspection.needs_review.is_(True), Inspection.review_status.is_(None)).count()
    labelled = [r for r in cur if r.gt_label]
    if labelled:
        good = [r for r in labelled if r.gt_label == "good"]
        bad = [r for r in labelled if r.gt_label != "good"]
        correct = sum((r.decision == "PASS") == (r.gt_label == "good") for r in labelled)
        k["accuracy"] = _pct(correct, len(labelled))
        k["false_defect_rate"] = _pct(sum(r.decision != "PASS" for r in good), len(good))
        k["detection_rate"] = _pct(sum(r.decision != "PASS" for r in bad), len(bad))
        k["labelled_samples"] = len(labelled)
    k["previous"] = {"total": p["total"], "defect_rate": p["defect_rate"], "avg_severity": p["avg_severity"],
                     "avg_processing_ms": p["avg_processing_ms"]}
    k["days"] = days
    return k


@router.get("/trends")
def trends(days: int = Query(14, ge=1, le=90), db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = _rows(db, days)
    by = defaultdict(list)
    for r in rows:
        by[r.created_at.date()].append(r)
    start = (utcnow() - timedelta(days=days - 1)).date()
    out = []
    for i in range(days):
        d = start + timedelta(days=i)
        rs = by.get(d, [])
        dec = Counter(r.decision for r in rs)
        sev = [r.severity_score for r in rs if r.severity_score]
        out.append({"date": d.isoformat(), "label": d.strftime("%d %b"), "inspected": len(rs), "pass": dec["PASS"],
                    "review": dec["REVIEW"], "rework": dec["REWORK"], "reject": dec["REJECT"],
                    "defect_rate": _pct(len(rs) - dec["PASS"], len(rs)) if rs else None,
                    "avg_severity": round(sum(sev) / len(sev), 1) if sev else (0 if rs else None)})
    return out


@router.get("/defect-types")
def defect_types(days: int = Query(14, ge=1, le=365), db: Session = Depends(get_db), _: User = Depends(current_user)):
    since = utcnow() - timedelta(days=days)
    ds = db.query(Defect).join(Inspection).filter(Inspection.created_at >= since, Inspection.status == "completed").all()
    c = Counter(d.type for d in ds)
    cat = Counter(d.category for d in ds)
    sev = defaultdict(list)
    for d in ds:
        sev[d.type].append(d.severity_score)
    return {"types": [{"type": t, "count": n, "avg_severity": round(sum(sev[t]) / len(sev[t]), 1)} for t, n in c.most_common()],
            "categories": [{"category": t, "count": n} for t, n in cat.most_common()], "total": len(ds)}


@router.get("/severity")
def severity(days: int = Query(14, ge=1, le=365), db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = _rows(db, days)
    c = Counter(r.severity_level for r in rows)
    dec = Counter(r.decision for r in rows)
    return {"levels": [{"level": l, "count": c.get(l, 0)} for l in LEVELS],
            "decisions": [{"decision": d, "count": dec.get(d, 0)} for d in ["PASS", "REVIEW", "REWORK", "REJECT"]]}


@router.get("/categories")
def categories(days: int = Query(14, ge=1, le=365), db: Session = Depends(get_db), _: User = Depends(current_user)):
    by = defaultdict(list)
    for r in _rows(db, days):
        by[r.category].append(r)
    out = []
    for cat, rs in by.items():
        k = _kpis(rs)
        top = Counter(r.defects[0].type for r in rs if r.defects).most_common(1)
        out.append({"category": cat, "inspected": k["total"], "defect_rate": k["defect_rate"], "avg_severity": k["avg_severity"],
                    "rejected": k["rejected"], "top_defect": top[0][0] if top else None})
    return sorted(out, key=lambda x: -x["inspected"])


@router.get("/insights")
def insights(days: int = Query(14, ge=1, le=90), db: Session = Depends(get_db), _: User = Depends(current_user)):
    return {"insights": build_insights(db, days), "alerts": build_alerts(db)}
