"""
Milestone 3 — Quality Control Module.

Turns a list of classified, severity-scored defects into a single
auditable quality decision for the product: an overall severity, a
pass / rework / reject verdict, and a plain-language recommendation the
operator on the line can act on.
"""
from dataclasses import dataclass

from app.vision.classifier import ClassifiedDefect, severity_level_for


@dataclass
class QualityDecision:
    overall_severity: float     # 0-100
    severity_level: str         # Critical | High | Medium | Low | None
    decision: str               # pass | rework | reject
    recommendation: str
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int

    def to_dict(self) -> dict:
        return {
            "overall_severity": round(self.overall_severity, 2),
            "severity_level": self.severity_level,
            "decision": self.decision,
            "recommendation": self.recommendation,
            "critical_count": self.critical_count,
            "high_count": self.high_count,
            "medium_count": self.medium_count,
            "low_count": self.low_count,
        }


def decide(defects: list[ClassifiedDefect]) -> QualityDecision:
    """
    The product's overall severity is driven by its *worst* defect, not
    the average — one critical crack must fail the unit even if every
    other finding is cosmetic. Additional defects add a smaller
    cumulative penalty, so a part with many medium defects can still be
    escalated above a part with a single one.
    """
    if not defects:
        return QualityDecision(
            overall_severity=0.0,
            severity_level="None",
            decision="pass",
            recommendation="No defects detected — product meets quality standards.",
            critical_count=0,
            high_count=0,
            medium_count=0,
            low_count=0,
        )

    counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for d in defects:
        counts[d.severity_level] += 1

    worst = max(d.severity_score for d in defects)
    # Each extra defect beyond the worst one adds up to 3 points, capped
    # at 10 total, so volume matters but can't by itself manufacture a
    # critical verdict out of purely cosmetic findings.
    volume_penalty = min(10.0, (len(defects) - 1) * 3.0)
    overall = min(100.0, worst + volume_penalty)
    level = severity_level_for(overall)

    if level == "Critical":
        decision = "reject"
        recommendation = "Reject product and trigger the quality inspection workflow immediately."
    elif level == "High":
        decision = "rework"
        recommendation = "Send to rework — repair required before this unit can be dispatched."
    elif level == "Medium":
        decision = "rework"
        recommendation = "Hold for manual inspection review before releasing the batch."
    else:
        decision = "pass"
        recommendation = "Minor cosmetic defects only — product is acceptable for dispatch."

    return QualityDecision(
        overall_severity=overall,
        severity_level=level,
        decision=decision,
        recommendation=recommendation,
        critical_count=counts["Critical"],
        high_count=counts["High"],
        medium_count=counts["Medium"],
        low_count=counts["Low"],
    )
