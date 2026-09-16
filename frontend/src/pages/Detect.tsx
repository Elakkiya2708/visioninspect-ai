import { ChangeEvent, useEffect, useRef, useState } from "react";
import PageShell from "../components/PageShell";
import type { CocoSsdModel, DetectedObject } from "../lib/cocoSsd";

type ModelState = "loading-scripts" | "loading-model" | "ready" | "error";

const BOX_COLORS = [
  "#2FBD9E", "#E8A94A", "#6CA0E0", "#E85B5F",
  "#B48CE0", "#4FC0D0", "#D4A03C", "#8FBF5A",
];

export default function Detect() {
  const [modelState, setModelState] = useState<ModelState>("loading-scripts");
  const [modelError, setModelError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detections, setDetections] = useState<DetectedObject[]>([]);
  const [imageName, setImageName] = useState<string | null>(null);

  const modelRef = useRef<CocoSsdModel | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function waitForScriptsAndLoadModel() {
      const start = Date.now();
      while (!window.cocoSsd) {
        if (Date.now() - start > 15000) {
          if (!cancelled) {
            setModelState("error");
            setModelError(
              "Could not reach the detection model (cdn.jsdelivr.net). Check your internet connection and reload."
            );
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (cancelled) return;
      setModelState("loading-model");
      try {
        const model = await window.cocoSsd!.load({ base: "mobilenet_v2" });
        if (cancelled) return;
        modelRef.current = model;
        setModelState("ready");
      } catch (err: any) {
        if (!cancelled) {
          setModelState("error");
          setModelError(err?.message || "Failed to load the detection model.");
        }
      }
    }

    waitForScriptsAndLoadModel();
    return () => {
      cancelled = true;
    };
  }, []);

  function drawDetections(results: DetectedObject[]) {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const fontSize = Math.max(14, Math.round(canvas.width / 60));
    ctx.font = `600 ${fontSize}px 'JetBrains Mono', monospace`;
    ctx.textBaseline = "top";

    results.forEach((det, i) => {
      const [x, y, w, h] = det.bbox;
      const color = BOX_COLORS[i % BOX_COLORS.length];
      const label = `${det.class} ${(det.score * 100).toFixed(0)}%`;

      ctx.lineWidth = Math.max(2, canvas.width / 400);
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, w, h);

      const padding = 5;
      const textWidth = ctx.measureText(label).width;
      const labelHeight = fontSize + padding * 2;
      ctx.fillStyle = color;
      ctx.fillRect(x - ctx.lineWidth / 2, y - labelHeight, textWidth + padding * 2, labelHeight);

      ctx.fillStyle = "#0B0D0F";
      ctx.fillText(label, x + padding - ctx.lineWidth / 2, y - labelHeight + padding);
    });
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !modelRef.current) return;

    setImageName(file.name);
    setDetections([]);
    setDetecting(true);

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      imgRef.current = img;
      try {
        // maxNumBoxes=20, minScore=0.6 — filters out the low-confidence,
        // noisy guesses a general-purpose model tends to throw off on
        // unusual/damaged shapes, keeping only detections it's fairly sure of.
        const results = await modelRef.current!.detect(img, 20, 0.6);
        results.sort((a, b) => b.score - a.score);
        setDetections(results);
        drawDetections(results);
      } catch (err) {
        console.error(err);
      } finally {
        setDetecting(false);
        URL.revokeObjectURL(url);
      }
    };
    img.src = url;
  }

  const counts = detections.reduce<Record<string, number>>((acc, d) => {
    acc[d.class] = (acc[d.class] || 0) + 1;
    return acc;
  }, {});

  return (
    <PageShell section="Object Detection" maxWidth="max-w-[1100px]">
        <p className="label-eyebrow mb-1">Detection Preview</p>
        <h1 className="font-display text-2xl font-semibold mb-8">Multi-Object Detection</h1>

        {modelState !== "ready" && modelState !== "error" && (
          <div className="card px-5 py-4 mb-6 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            <p className="text-sm text-fg-muted font-mono">
              {modelState === "loading-scripts" ? "Fetching detection engine…" : "Loading detection model (first time only)…"}
            </p>
          </div>
        )}

        {modelState === "error" && (
          <div className="card border-critical/30 px-5 py-4 mb-6">
            <p className="text-sm text-critical">{modelError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div>
            <div className="bracket-frame rounded-xl border-2 border-dashed border-border px-6 py-10 text-center bg-surface-2/40 mb-4">
              <label className={`btn-primary cursor-pointer inline-flex ${modelState !== "ready" ? "pointer-events-none opacity-40" : ""}`}>
                {detecting ? "Analyzing…" : "Choose an image to analyze"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={modelState !== "ready" || detecting}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-fg-subtle mt-3">JPG or PNG — detection runs locally, nothing is uploaded</p>
            </div>

            <div className="card overflow-hidden">
              {imageName ? (
                <canvas ref={canvasRef} className="w-full h-auto block" />
              ) : (
                <div className="aspect-video flex items-center justify-center text-fg-subtle text-sm bg-grid-pattern bg-grid">
                  Choose an image to see detections here
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="label-eyebrow mb-3">
              Detected Objects {detections.length > 0 && `(${detections.length})`}
            </p>
            {detections.length === 0 ? (
              <p className="text-sm text-fg-subtle">No detections yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(counts).map(([cls, count], i) => (
                  <div key={cls} className="card px-3.5 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: BOX_COLORS[i % BOX_COLORS.length] }}
                      />
                      <span className="text-sm font-medium capitalize">{cls}</span>
                    </div>
                    <span className="text-xs font-mono text-fg-muted">×{count}</span>
                  </div>
                ))}

                <div className="pt-3 mt-3 border-t border-border space-y-2">
                  {detections.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs font-mono text-fg-muted">
                      <span className="capitalize">{d.class}</span>
                      <span>{(d.score * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
    </PageShell>
  );
}
