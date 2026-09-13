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
