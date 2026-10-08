"""Rule-based operational insights and trend alerts."""
from collections import Counter
from datetime import timedelta

from sqlalchemy.orm import selectinload

from ..models import Inspection, utcnow


def _rate(rows):
    return (sum(1 for r in rows if r.decision != "PASS") / len(rows) * 100) if rows else 0.0


def build_insights(db, days=14):
    now = utcnow()
    cur = db.query(Inspection).options(selectinload(Inspection.defects)).filter(Inspection.status == "completed", Inspection.created_at >= now - timedelta(days=days)).all()
    prev = db.query(Inspection).filter(Inspection.status == "completed", Inspection.created_at >= now - timedelta(days=2 * days),
                                       Inspection.created_at < now - timedelta(days=days)).all()
    out = []
    if not cur:
        return [{"level": "info", "title": "No inspection data yet",
                 "text": "Run an inspection or load demo data to see operational insights."}]
    cr, pr = _rate(cur), _rate(prev)
    if prev:
        delta = cr - pr
        if delta > 3:
            out.append({"level": "warning", "title": "Defect rate is rising",
                        "text": f"Non-pass rate is {cr:.1f}% vs {pr:.1f}% in the previous {days} days (+{delta:.1f} pts)."})
        elif delta < -3:
            out.append({"level": "success", "title": "Quality is improving",
                        "text": f"Non-pass rate fell to {cr:.1f}% from {pr:.1f}% ({delta:.1f} pts)."})
    types = Counter(i.defects[0].type for i in cur if i.defects)
    if types:
        t, n = types.most_common(1)[0]
        share = n / sum(types.values()) * 100
        out.append({"level": "info", "title": f"Top defect: {t}",
                    "text": f"{share:.0f}% of defective parts in the last {days} days. Focus root-cause work here."})
    cats = Counter()
    tot = Counter()
    for i in cur:
        tot[i.category] += 1
        cats[i.category] += i.decision != "PASS"
    worst = max(((c, cats[c] / tot[c] * 100, tot[c]) for c in tot if tot[c] >= 5), key=lambda x: x[1], default=None)
    if worst and worst[1] > 0:
        out.append({"level": "warning" if worst[1] > 30 else "info", "title": f"Highest defect rate: {worst[0]}",
                    "text": f"{worst[1]:.0f}% non-pass across {worst[2]} inspections."})
    review = sum(1 for i in cur if i.needs_review and not i.review_status)
    if review:
        out.append({"level": "warning", "title": f"{review} inspections awaiting review",
                    "text": "Low-confidence or medium-severity results need a supervisor decision."})
    crit = sum(1 for i in cur if i.severity_level == "Critical")
    if crit:
        out.append({"level": "danger", "title": f"{crit} critical defects",
                    "text": "Critical parts were rejected. Check the root-cause suggestions on each record."})
    avg_ms = sum(i.processing_ms for i in cur) / len(cur)
    out.append({"level": "success", "title": "Automation throughput",
                "text": f"{len(cur)} parts inspected automatically, avg {avg_ms:.0f} ms per image."})
    return out


def build_alerts(db, window=20, threshold=35.0):
    rows = db.query(Inspection).filter(Inspection.status == "completed").order_by(Inspection.created_at.desc()).limit(window).all()
    alerts = []
    if len(rows) >= 10:
        r = _rate(rows)
        if r >= threshold:
            alerts.append({"level": "danger", "title": "Defect-rate threshold exceeded",
                           "text": f"{r:.0f}% of the last {len(rows)} parts were not passed (limit {threshold:.0f}%)."})
    streak = 0
    for i in rows:
        if i.decision == "REJECT":
            streak += 1
        else:
            break
    if streak >= 3:
        alerts.append({"level": "danger", "title": f"{streak} consecutive rejects",
                       "text": "Possible process drift - stop the line and inspect tooling."})
    return alerts
