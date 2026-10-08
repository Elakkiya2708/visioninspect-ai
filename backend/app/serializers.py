from .models import Defect, Inspection, ModelVersion, User


def iso(d):
    return d.isoformat() + "Z" if d else None


def user_out(u: User):
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active,
            "created_at": iso(u.created_at), "last_login": iso(u.last_login)}


def defect_out(d: Defect):
    return {"id": d.id, "type": d.type, "category": d.category, "bbox": d.bbox, "area_ratio": d.area_ratio,
            "confidence": d.confidence, "type_confidence": d.type_confidence,
            "scores": {"size": d.size_score, "location": d.location_score, "type": d.type_score,
                       "confidence": d.confidence_score},
            "severity_score": d.severity_score, "severity_level": d.severity_level}


def inspection_out(i: Inspection, detail=False):
    out = {
        "id": i.id, "code": i.code, "filename": i.filename, "source": i.source, "batch_id": i.batch_id,
        "category": i.category, "status": i.status, "decision": i.decision, "severity_level": i.severity_level,
        "severity_score": i.severity_score, "anomaly_score": i.anomaly_score, "needs_review": i.needs_review,
        "defect_count": len(i.defects), "top_defect": i.defects[0].type if i.defects else None,
        "quality_grade": (i.quality or {}).get("grade"), "model_name": i.model_name, "model_mode": i.model_mode,
        "processing_ms": i.processing_ms, "review_status": i.review_status, "gt_label": i.gt_label,
        "created_at": iso(i.created_at), "operator": i.user.full_name if i.user else None,
    }
    if detail:
        out.update({
            "width": i.width, "height": i.height, "validation": i.validation, "quality": i.quality,
            "features": i.features, "preprocessing": i.preprocessing, "recommendation": i.recommendation,
            "root_cause": i.root_cause, "review_note": i.review_note, "reviewed_at": iso(i.reviewed_at),
            "reviewer": i.reviewer.full_name if i.reviewer else None,
            "defects": [defect_out(d) for d in i.defects],
        })
    return out


def model_out(m: ModelVersion):
    return {"id": m.id, "category": m.category, "name": m.name, "version": m.version, "metrics": m.metrics,
            "active": m.active, "created_at": iso(m.created_at)}
