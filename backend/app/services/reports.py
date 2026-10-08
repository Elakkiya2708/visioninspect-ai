"""CSV export and PDF inspection certificate."""
import csv
import io
from pathlib import Path


def inspections_csv(rows):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["code", "created_at_utc", "filename", "category", "source", "decision", "severity_level",
                "severity_score", "defects", "top_defect", "anomaly_score", "needs_review", "review_status",
                "quality_grade", "processing_ms", "model"])
    for i in rows:
        w.writerow([i.code, i.created_at.isoformat(), i.filename, i.category, i.source, i.decision, i.severity_level,
                    i.severity_score, len(i.defects), i.defects[0].type if i.defects else "", i.anomaly_score,
                    i.needs_review, i.review_status or "", (i.quality or {}).get("grade", ""), i.processing_ms, i.model_name])
    return buf.getvalue().encode("utf-8-sig")


def inspection_pdf(ins, overlay_path: Path | None):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm)
    st = getSampleStyleSheet()
    dec_col = {"PASS": colors.HexColor("#059669"), "REVIEW": colors.HexColor("#d97706"),
               "REWORK": colors.HexColor("#ea580c"), "REJECT": colors.HexColor("#dc2626")}[ins.decision]
    el = [Paragraph("VisionInspect AI - Inspection Certificate", st["Title"]),
          Paragraph(f"Report <b>{ins.code}</b> &nbsp;|&nbsp; {ins.created_at:%Y-%m-%d %H:%M} UTC", st["Normal"]), Spacer(1, 6 * mm)]
    head = Table([[f"DECISION: {ins.decision}", f"Severity: {ins.severity_level} ({ins.severity_score})",
                   f"Defects: {len(ins.defects)}"]], colWidths=[60 * mm, 60 * mm, 50 * mm])
    head.setStyle(TableStyle([("BACKGROUND", (0, 0), (0, 0), dec_col), ("TEXTCOLOR", (0, 0), (0, 0), colors.white),
                              ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"), ("PADDING", (0, 0), (-1, -1), 8),
                              ("BOX", (0, 0), (-1, -1), 0.5, colors.lightgrey)]))
    el += [head, Spacer(1, 5 * mm)]
    if overlay_path and overlay_path.exists():
        el += [Image(str(overlay_path), width=90 * mm, height=90 * mm, kind="proportional"), Spacer(1, 4 * mm)]
    meta = [["File", ins.filename], ["Product category", ins.category], ["Source", ins.source],
            ["Model", f"{ins.model_name} ({ins.model_mode})"], ["Image quality", f"grade {(ins.quality or {}).get('grade', '-')}"],
            ["Processing time", f"{ins.processing_ms} ms"]]
    t = Table(meta, colWidths=[45 * mm, 125 * mm])
    t.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
                           ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey)]))
    el += [t, Spacer(1, 5 * mm), Paragraph("<b>Recommendation</b>", st["Heading4"]), Paragraph(ins.recommendation or "-", st["Normal"])]
    if ins.root_cause:
        el += [Spacer(1, 3 * mm), Paragraph("<b>Probable root cause</b>", st["Heading4"]), Paragraph(ins.root_cause, st["Normal"])]
    if ins.defects:
        rows = [["#", "Type", "Conf.", "Size", "Loc.", "Type", "Conf.", "Severity"]]
        for n, d in enumerate(ins.defects, 1):
            rows.append([n, d.type, f"{d.confidence * 100:.0f}%", d.size_score, d.location_score, d.type_score,
                         d.confidence_score, f"{d.severity_score} {d.severity_level}"])
        dt = Table(rows, repeatRows=1)
        dt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                                ("FONTSIZE", (0, 0), (-1, -1), 8), ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey)]))
        el += [Spacer(1, 5 * mm), Paragraph("<b>Detected defects</b> (severity = 30% size + 25% location + 25% type + 20% confidence)", st["Heading4"]), dt]
    if ins.review_status:
        el += [Spacer(1, 4 * mm), Paragraph(f"<b>Manual review:</b> {ins.review_status} - {ins.review_note or ''}", st["Normal"])]
    doc.build(el)
    return buf.getvalue()
