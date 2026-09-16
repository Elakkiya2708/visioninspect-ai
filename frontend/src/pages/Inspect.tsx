import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import PageShell from "../components/PageShell";
import ProgressBar from "../components/ProgressBar";
import {
  api,
  DECISION_STYLES,
  DefectPrediction,
  ProductImage,
  ReferenceImage,
  SEVERITY_COLORS,
  imageFileUrl,
  referenceFileUrl,
} from "../lib/api";

const SEVERITY_BADGE: Record<string, string> = {
  Critical: "bg-critical/10 text-critical border-critical/30",
  High: "bg-warning/10 text-warning border-warning/30",
  Medium: "bg-info/10 text-info border-info/30",
  Low: "bg-success/10 text-success border-success/30",
  None: "bg-surface-2 text-fg-muted border-border",
};

export default function Inspect() {
  const [references, setReferences] = useState<ReferenceImage[]>([]);
  const [candidateImages, setCandidateImages] = useState<ProductImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [result, setResult] = useState<DefectPrediction | null>(null);

  const [refProductLine, setRefProductLine] = useState("");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refUploading, setRefUploading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  async function loadReferences() {
    const res = await api.get<ReferenceImage[]>("/api/inspection/reference");
    setReferences(res.data);
  }

  async function loadCandidateImages() {
    const res = await api.get<ProductImage[]>("/api/images", {
      params: { status_filter: "validated", limit: 50 },
    });
    setCandidateImages(res.data);
  }

  useEffect(() => {
    loadReferences();
    loadCandidateImages();
  }, []);

  const referenceLines = new Set(references.map((r) => r.product_line.trim().toLowerCase()));
  const hasReference = (line: string | null) => !!line && referenceLines.has(line.trim().toLowerCase());
  const selectedImage = candidateImages.find((img) => img.id === selectedImageId) || null;

  async function handleUploadReference(e: FormEvent) {
    e.preventDefault();
    if (!refFile || !refProductLine.trim()) return;
    setRefUploading(true);
    setRefError(null);
    try {
      const formData = new FormData();
      formData.append("product_line", refProductLine.trim());
      formData.append("file", refFile);
      await api.post("/api/inspection/reference", formData);
      setRefProductLine("");
      setRefFile(null);
      await loadReferences();
    } catch (err: any) {
      setRefError(err?.response?.data?.detail || "Could not save the reference image.");
    } finally {
      setRefUploading(false);
    }
  }

  async function handleAnalyze() {
    if (!selectedImage) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    setResult(null);
    try {
      const res = await api.post<DefectPrediction>(`/api/inspection/analyze/${selectedImage.id}`);
      setResult(res.data);
    } catch (err: any) {
      setAnalyzeError(err?.response?.data?.detail || "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  // Drawing waits for the result <canvas> to actually mount — it only
  // exists once `result` is set, so drawing inside handleAnalyze would
  // find canvasRef.current still null.
  useEffect(() => {
    if (result) drawResult(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function drawResult(prediction: DefectPrediction) {
    const reference = references.find((r) => r.id === prediction.reference_image_id);
    const canvas = canvasRef.current;
    if (!canvas || !reference || !selectedImage) return;

    const w = reference.width || selectedImage.width || 800;
    const h = reference.height || selectedImage.height || 600;

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      prediction.regions.forEach((region, i) => {
        const color = SEVERITY_COLORS[region.severity_level || "None"] || "#DC2626";
        ctx.lineWidth = Math.max(2, w / 350);
        ctx.strokeStyle = color;
        ctx.strokeRect(region.x, region.y, region.width, region.height);

        const label = region.defect_label
          ? `${i + 1}. ${region.defect_label} · ${Math.round(region.severity_score || 0)}`
          : `defect ${i + 1}`;
        const fontSize = Math.max(13, Math.round(w / 70));
        ctx.font = `600 ${fontSize}px 'JetBrains Mono', monospace`;
        const textWidth = ctx.measureText(label).width;
        const labelH = fontSize + 8;
        ctx.fillStyle = color;
        ctx.fillRect(region.x - ctx.lineWidth / 2, region.y - labelH, textWidth + 10, labelH);
        ctx.fillStyle = "#FFFFFF";
        ctx.textBaseline = "top";
        ctx.fillText(label, region.x + 5 - ctx.lineWidth / 2, region.y - labelH + 4);
      });
    };
    img.src = imageFileUrl(selectedImage.id);
  }

  const decision = result ? DECISION_STYLES[result.decision] : null;

  return (
    <PageShell section="Defect Inspection" maxWidth="max-w-[1250px]">
      <p className="label-eyebrow mb-1">Defect Detection & Classification</p>
      <h1 className="font-display text-2xl font-semibold mb-8">Defect Inspection</h1>

      {/* Step 1 — references */}
      <section className="mb-8">
        <p className="label-eyebrow mb-3">1. Reference (Golden Sample) Images</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-4">
            {references.length === 0 ? (
              <p className="text-sm text-fg-subtle py-4 text-center">
                No reference images yet — add one for each product line.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {references.map((r) => (
                  <div key={r.id} className="bracket-frame rounded-md overflow-hidden border border-border">
                    <div className="aspect-video bg-surface-2">
                      <img src={referenceFileUrl(r.id)} alt={r.product_line} className="w-full h-full object-cover" />
                    </div>
                    <div className="px-2.5 py-2">
                      <p className="text-xs font-semibold capitalize truncate">{r.product_line}</p>
                      <p className="text-[10px] font-mono text-fg-subtle">{r.width}×{r.height}px</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleUploadReference} className="card p-4 space-y-3">
            <p className="text-sm font-medium">Add / replace a reference image</p>
            <input
              required
              value={refProductLine}
              onChange={(e) => setRefProductLine(e.target.value)}
              placeholder="Product line (e.g. bottle-cap)"
              className="input-field"
            />
            <label className="btn-secondary cursor-pointer inline-flex w-full">
              {refFile ? refFile.name : "Choose golden-sample image"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => setRefFile(e.target.files?.[0] || null)}
              />
            </label>
            {refError && <p className="text-xs text-critical">{refError}</p>}
            <button type="submit" disabled={refUploading || !refFile} className="btn-primary w-full">
              {refUploading ? "Saving…" : "Save reference image"}
            </button>
            <p className="text-[11px] text-fg-subtle leading-snug">
              Reference images are shared across the whole plant — every role inspects against the same
              golden sample. Matching is case-insensitive.
            </p>
          </form>
        </div>
      </section>

      {/* Step 2 — run */}
      <section className="mb-8">
        <p className="label-eyebrow mb-3">2. Run Inspection</p>
        <div className="card p-4">
          {candidateImages.length === 0 ? (
            <p className="text-sm text-fg-subtle py-4 text-center">
              No validated images yet — upload product images first in Image Acquisition.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-medium text-fg mb-1.5">Choose an inspected image</label>
                <select
                  value={selectedImageId}
                  onChange={(e) => {
                    setSelectedImageId(e.target.value);
                    setResult(null);
                    setAnalyzeError(null);
                  }}
                  className="input-field"
                >
                  <option value="">Select an image…</option>
                  {candidateImages.map((img) => (
                    <option key={img.id} value={img.id}>
                      {img.file_name} {img.product_line ? `— ${img.product_line}` : "(no product line)"}
                      {!hasReference(img.product_line) ? " ⚠ no reference set" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={handleAnalyze} disabled={!selectedImage || analyzing} className="btn-primary">
                {analyzing ? "Analysing…" : "Run defect analysis"}
              </button>
            </div>
          )}
          {selectedImage && !hasReference(selectedImage.product_line) && (
            <p className="text-xs text-warning mt-3">
              No reference image is set for "{selectedImage.product_line || "unassigned"}" — add one above first.
            </p>
          )}
          {analyzeError && <p className="text-xs text-critical mt-3">{analyzeError}</p>}
        </div>
      </section>

      {/* Step 3 — result */}
      {result && (
        <section>
          <p className="label-eyebrow mb-3">3. Inspection Result</p>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 mb-6">
            <div className="card overflow-hidden">
              <canvas ref={canvasRef} className="w-full h-auto block" />
            </div>

            <div className="space-y-3">
              {decision && (
                <div className={`rounded-lg border px-4 py-3 ${decision.className}`}>
                  <p className="text-[10px] font-mono uppercase tracking-[0.14em] opacity-80">Quality Decision</p>
                  <p className="text-base font-semibold mt-0.5">{decision.label}</p>
                </div>
              )}

              <div className="card px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="label-eyebrow">Overall Severity</p>
                  <span
                    className={`text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 ${
                      SEVERITY_BADGE[result.severity_level] || SEVERITY_BADGE.None
                    }`}
                  >
                    {result.severity_level}
                  </span>
                </div>
                <p className="font-mono text-2xl font-semibold">{result.overall_severity.toFixed(1)}</p>
                <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden mt-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, result.overall_severity)}%`,
                      backgroundColor: SEVERITY_COLORS[result.severity_level] || SEVERITY_COLORS.None,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="card px-4 py-3">
                  <p className="label-eyebrow mb-1">Defects</p>
                  <p className="font-mono text-lg font-semibold">{result.defect_count}</p>
                </div>
                <div className="card px-4 py-3">
                  <p className="label-eyebrow mb-1">Similarity</p>
                  <p className="font-mono text-lg font-semibold">
                    {(result.similarity_score * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="card px-4 py-3 space-y-2">
                <p className="label-eyebrow mb-1">Severity Breakdown</p>
                {[
                  { label: "Critical", value: result.critical_count, color: SEVERITY_COLORS.Critical },
                  { label: "High", value: result.high_count, color: SEVERITY_COLORS.High },
                  { label: "Medium", value: result.medium_count, color: SEVERITY_COLORS.Medium },
                  { label: "Low", value: result.low_count, color: SEVERITY_COLORS.Low },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-fg-muted">{s.label}</span>
                    <span className="font-mono font-semibold ml-auto">{s.value}</span>
                  </div>
                ))}
              </div>

              {result.recommendation && (
                <div className="card px-4 py-3">
                  <p className="label-eyebrow mb-1.5">Recommended Action</p>
                  <p className="text-xs text-fg-muted leading-relaxed">{result.recommendation}</p>
                </div>
              )}

              {result.quality_flags.length > 0 && (
                <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-2.5">
                  <p className="text-xs font-semibold text-warning mb-1">Image quality warning</p>
                  <p className="text-xs text-fg-muted capitalize">{result.quality_flags.join(", ")}</p>
                </div>
              )}
            </div>
          </div>

          {/* Per-defect classification table */}
          {result.regions.length > 0 && (
            <>
              <p className="label-eyebrow mb-3">Classified Defects &amp; Severity Scores</p>
              <div className="card overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="label-eyebrow font-normal px-4 py-3">#</th>
                      <th className="label-eyebrow font-normal px-4 py-3">Defect Type</th>
                      <th className="label-eyebrow font-normal px-4 py-3">Size (30%)</th>
                      <th className="label-eyebrow font-normal px-4 py-3">Location (25%)</th>
                      <th className="label-eyebrow font-normal px-4 py-3">Type (25%)</th>
                      <th className="label-eyebrow font-normal px-4 py-3">Confidence (20%)</th>
                      <th className="label-eyebrow font-normal px-4 py-3">Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.regions.map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-mono text-fg-subtle">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: SEVERITY_COLORS[r.severity_level || "None"] }}
                            />
                            <span className="font-medium">{r.defect_label || "Unclassified"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-fg-muted">{r.size_score?.toFixed(1) ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-fg-muted">{r.location_score?.toFixed(1) ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-fg-muted">{r.type_score?.toFixed(1) ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-fg-muted">{r.confidence_score?.toFixed(1) ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[10px] font-mono uppercase border rounded px-1.5 py-0.5 ${
                              SEVERITY_BADGE[r.severity_level || "None"]
                            }`}
                          >
                            {r.severity_score?.toFixed(1) ?? "—"} {r.severity_level}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-fg-subtle">
                Severity = (Size × 30%) + (Location × 25%) + (Defect Type × 25%) + (Confidence × 20%).
                Levels: Critical 80–100, High 60–79, Medium 40–59, Low 0–39.
              </p>
            </>
          )}
        </section>
      )}
    </PageShell>
  );
}
