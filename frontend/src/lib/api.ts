import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("vi_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type UserRole =
  | "quality_engineer"
  | "factory_supervisor"
  | "production_manager"
  | "admin";

export interface User {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department: string | null;
  is_active: boolean;
  created_at: string;
}

export type ImageStatus = "uploaded" | "validated" | "rejected" | "queued_for_inspection";

export interface ProductImage {
  id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  product_line: string | null;
  batch_code: string | null;
  source: string;
  status: ImageStatus;
  validation_notes: string | null;
  uploaded_by_id: string;
  created_at: string;
}

export function imageFileUrl(imageId: string): string {
  const token = localStorage.getItem("vi_token") || "";
  const base = import.meta.env.VITE_API_URL || "http://localhost:8000";
  return `${base}/api/images/${imageId}/file?token=${encodeURIComponent(token)}`;
}

export interface ImageStats {
  total_images: number;
  uploaded: number;
  validated: number;
  rejected: number;
  queued_for_inspection: number;
  total_storage_mb: number;
}

// ---------- Milestone 2: Defect Detection ----------

export interface ReferenceImage {
  id: string;
  product_line: string;
  file_name: string;
  width: number | null;
  height: number | null;
  created_at: string;
  updated_at: string;
}

export function referenceFileUrl(referenceId: string): string {
  const token = localStorage.getItem("vi_token") || "";
  const base = import.meta.env.VITE_API_URL || "http://localhost:8000";
  return `${base}/api/inspection/reference/${referenceId}/file?token=${encodeURIComponent(token)}`;
}

export interface DefectRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  area_ratio: number;

  // Milestone 3 — classification + severity. Optional because
  // predictions stored before Milestone 3 won't carry them.
  defect_type?: string | null;
  defect_label?: string | null;
  confidence?: number | null;
  size_score?: number | null;
  location_score?: number | null;
  type_score?: number | null;
  confidence_score?: number | null;
  severity_score?: number | null;
  severity_level?: string | null;
  recommended_action?: string | null;
}

export interface QualityReport {
  brightness: number;
  contrast: number;
  sharpness: number;
  is_blurry: boolean;
  is_underexposed: boolean;
  is_overexposed: boolean;
}

export type InspectionVerdict = "pass" | "fail" | "inconclusive";

export interface DefectPrediction {
  id: string;
  product_image_id: string;
  reference_image_id: string;
  similarity_score: number;
  defect_count: number;
  total_affected_area_pct: number;
  regions: DefectRegion[];
  verdict: InspectionVerdict;
  quality: QualityReport | null;
  quality_flags: string[];
  created_at: string;

  // Milestone 3 — quality decision
  overall_severity: number;
  severity_level: string;
  decision: "pass" | "rework" | "reject";
  recommendation: string | null;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}

// ---------- Personal account stats (Profile page) ----------

export interface UserStats {
  total_images: number;
  validated_images: number;
  rejected_images: number;
  total_inspections: number;
  passed_inspections: number;
  failed_inspections: number;
  pass_rate_pct: number | null;
}

// ---------- User Management (Factory Supervisor / Production Manager) ----------

export function canViewUsers(role: UserRole): boolean {
  return role === "factory_supervisor" || role === "production_manager" || role === "admin";
}

export function canEditRoles(role: UserRole): boolean {
  return role === "production_manager" || role === "admin";
}

// ---------- System-wide inspection stats (Supervisor / Manager dashboards) ----------

export interface InspectionStats {
  total_inspections: number;
  passed: number;
  failed: number;
  inconclusive: number;
  pass_rate_pct: number | null;
  avg_similarity_pct: number | null;
}

export interface DailyActivity {
  date: string;
  total: number;
  passed: number;
  failed: number;
}

// ---------- Milestone 3: Classification, Severity & Analytics ----------

export type SeverityLevel = "Critical" | "High" | "Medium" | "Low" | "None";
export type QualityDecision = "pass" | "rework" | "reject";

export interface DefectTypeCount {
  defect_type: string;
  label: string;
  count: number;
  avg_severity: number;
}

export interface SeverityDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface ProductLineQuality {
  product_line: string;
  inspections: number;
  passed: number;
  rework: number;
  rejected: number;
  pass_rate_pct: number | null;
  avg_severity: number;
}

export interface DefectTrendPoint {
  date: string;
  inspections: number;
  defects: number;
  avg_severity: number;
}

export interface AnalyticsOverview {
  total_inspections: number;
  total_defects: number;
  avg_severity: number;
  reject_rate_pct: number | null;
  severity_distribution: SeverityDistribution;
  defect_types: DefectTypeCount[];
  by_product_line: ProductLineQuality[];
  trend: DefectTrendPoint[];
}

export const SEVERITY_COLORS: Record<string, string> = {
  Critical: "#DC2626",
  High: "#EA8A0C",
  Medium: "#2563EB",
  Low: "#16A35E",
  None: "#94A3B8",
};

export const DECISION_STYLES: Record<QualityDecision, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-success/10 text-success border-success/30" },
  rework: { label: "Rework Required", className: "bg-warning/10 text-warning border-warning/30" },
  reject: { label: "Reject", className: "bg-critical/10 text-critical border-critical/30" },
};
