import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import {
  api,
  DefectPrediction,
  ProductImage,
  ReferenceImage,
  imageFileUrl,
  referenceFileUrl,
} from "../lib/api";

const VERDICT_STYLES: Record<string, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-success/10 text-success border-success/30" },
  fail: { label: "Fail — Defect Detected", className: "bg-critical/10 text-critical border-critical/30" },
  inconclusive: { label: "Inconclusive", className: "bg-warning/10 text-warning border-warning/30" },
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

  // Case-insensitive membership check, matching the backend's matching rule.
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
      drawResult(res.data);
    } catch (err: any) {
      setAnalyzeError(err?.response?.data?.detail || "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

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
        ctx.lineWidth = Math.max(2, w / 350);
        ctx.strokeStyle = "#E85A5A";
        ctx.strokeRect(region.x, region.y, region.width, region.height);

        const label = `defect ${i + 1}`;
        const fontSize = Math.max(13, Math.round(w / 70));
        ctx.font = `600 ${fontSize}px 'JetBrains Mono', monospace`;
        const textWidth = ctx.measureText(label).width;
        const labelH = fontSize + 8;
        ctx.fillStyle = "#E85A5A";
        ctx.fillRect(region.x - ctx.lineWidth / 2, region.y - labelH, textWidth + 10, labelH);
        ctx.fillStyle = "#FFFFFF";
        ctx.textBaseline = "top";
        ctx.fillText(label, region.x + 5 - ctx.lineWidth / 2, region.y - labelH + 4);
      });
    };
    img.src = imageFileUrl(selectedImage.id);
  }

  const verdict = result ? VERDICT_STYLES[result.verdict] : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7 max-w-[1200px]">
        <p className="label-eyebrow mb-1">Defect Detection Module</p>
        <h1 className="font-display text-2xl font-semibold mb-8">Defect Inspection</h1>

        {/* Step 1: reference images */}
        <section className="mb-8">
          <p className="label-eyebrow mb-3">1. Reference (Golden Sample) Images</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-4">
              {references.length === 0 ? (
                <p className="text-sm text-fg-subtle py-4 text-center">
                  No reference images yet — add one for each product line below.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {references.map((r) => (
                    <div key={r.id} className="bracket-frame rounded-md overflow-hidden border border-border">
                      <div className="aspect-video bg-surface-2">
                        <img
                          src={referenceFileUrl(r.id)}
                          alt={r.product_line}
                          className="w-full h-full object-cover"
                        />
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
                Matching is case-insensitive — "Bottle" and "bottle" are treated as the same product line.
              </p>
            </form>
          </div>
        </section>

        {/* Step 2: run inspection */}
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
                <button
                  onClick={handleAnalyze}
                  disabled={!selectedImage || analyzing}
                  className="btn-primary"
                >
                  {analyzing ? "Analyzing…" : "Run defect analysis"}
                </button>
              </div>
            )}
            {selectedImage && !hasReference(selectedImage.product_line) && (
              <p className="text-xs text-warning mt-3">
                No reference image is set for "{selectedImage.product_line || "unassigned"}" yet — add one above first.
              </p>
            )}
            {analyzeError && <p className="text-xs text-critical mt-3">{analyzeError}</p>}
          </div>
        </section>

        {/* Step 3: result */}
        {result && (
          <section>
            <p className="label-eyebrow mb-3">3. Inspection Result</p>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
              <div className="card overflow-hidden">
                <canvas ref={canvasRef} className="w-full h-auto block" />
              </div>

              <div className="space-y-3">
                {verdict && (
                  <div className={`rounded-md border px-3.5 py-2.5 text-sm font-semibold ${verdict.className}`}>
                    {verdict.label}
                  </div>
                )}

                <div className="card px-4 py-3">
                  <p className="label-eyebrow mb-1">Similarity to reference</p>
                  <p className="font-mono text-xl font-semibold">
                    {(result.similarity_score * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="card px-4 py-3">
                  <p className="label-eyebrow mb-1">Defects found</p>
                  <p className="font-mono text-xl font-semibold">{result.defect_count}</p>
                </div>
                <div className="card px-4 py-3">
                  <p className="label-eyebrow mb-1">Affected area</p>
                  <p className="font-mono text-xl font-semibold">
                    {result.total_affected_area_pct.toFixed(2)}%
                  </p>
                </div>

                {result.quality_flags.length > 0 && (
                  <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-2.5">
                    <p className="text-xs font-semibold text-warning mb-1">Image quality warning</p>
                    <p className="text-xs text-fg-muted capitalize">{result.quality_flags.join(", ")}</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
