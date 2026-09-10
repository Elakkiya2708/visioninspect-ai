import { ChangeEvent, DragEvent, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import { api, ProductImage } from "../lib/api";

interface QueuedFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  result?: ProductImage;
  error?: string;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function Upload() {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [productLine, setProductLine] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next: QueuedFile[] = Array.from(fileList).map((file) => ({
      id: makeId(),
      file,
      status: "pending",
    }));
    setQueue((q) => [...q, ...next]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function removeFromQueue(id: string) {
    setQueue((q) => q.filter((item) => item.id !== id));
  }

  async function handleUploadAll() {
    if (submittingRef.current) return;
    const toUpload = queue.filter((item) => item.status === "pending");
    if (toUpload.length === 0) return;

    submittingRef.current = true;
    setSubmitting(true);

    const uploadIds = new Set(toUpload.map((item) => item.id));
    setQueue((q) => q.map((item) => (uploadIds.has(item.id) ? { ...item, status: "uploading" } : item)));

    const formData = new FormData();
    toUpload.forEach((item) => formData.append("files", item.file));
    if (productLine) formData.append("product_line", productLine);
    if (batchCode) formData.append("batch_code", batchCode);

    try {
      // Let the browser set Content-Type (it appends the required multipart
      // boundary automatically). Forcing it manually breaks the upload.
      const res = await api.post<ProductImage[]>("/api/images/upload-batch", formData);

      const resultById = new Map<string, ProductImage>();
      toUpload.forEach((item, i) => {
        if (res.data[i]) resultById.set(item.id, res.data[i]);
      });

      setQueue((q) =>
        q.map((item) => {
          if (!uploadIds.has(item.id)) return item;
          const result = resultById.get(item.id);
          return result
            ? {
                ...item,
                status: result.status === "rejected" ? "error" : "done",
                result,
                error: result.validation_notes ?? undefined,
              }
            : { ...item, status: "error", error: "No response for this file" };
        })
      );
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => d?.msg || JSON.stringify(d)).join("; ")
          : err?.message || "Upload failed";

      setQueue((q) =>
        q.map((item) => (uploadIds.has(item.id) ? { ...item, status: "error", error: message } : item))
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const pendingCount = queue.filter((q) => q.status === "pending").length;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 px-8 py-7 max-w-[1000px]">
        <p className="label-eyebrow mb-1">Image Acquisition Module</p>
        <h1 className="font-display text-2xl font-semibold mb-1">Upload Product Images</h1>
        <p className="text-sm text-fg-subtle mb-8">
          Manual upload, batch processing, and image validation for the inspection pipeline. Fill in
          "Product line" if you plan to run defect inspection on these images later — it must match
          the reference image's product line exactly.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">
              Product line <span className="text-fg-subtle">(recommended)</span>
            </label>
            <input
              value={productLine}
              onChange={(e) => setProductLine(e.target.value)}
              placeholder="e.g. bottle, cable-assembly"
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">
              Batch code <span className="text-fg-subtle">(optional)</span>
            </label>
            <input
              value={batchCode}
              onChange={(e) => setBatchCode(e.target.value)}
              placeholder="e.g. RUN-2026-08-26-A"
              className="input-field"
            />
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`bracket-frame rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragActive ? "border-accent bg-accent/5" : "border-border bg-surface-2/40"
          }`}
        >
          <svg width="30" height="30" viewBox="0 0 16 16" fill="none" className="mx-auto mb-3 text-fg-subtle">
            <path d="M8 11V2M8 2L4.5 5.5M8 2l3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 11.5v1a1.5 1.5 0 001.5 1.5h9a1.5 1.5 0 001.5-1.5v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <p className="font-medium mb-1">Drag and drop product images</p>
          <p className="text-sm text-fg-subtle mb-4">JPG, PNG, BMP, TIFF or WebP — up to 10MB each, 50 per batch</p>
          <label className="btn-secondary cursor-pointer inline-flex">
            Browse files
            <input type="file" multiple accept="image/*" onChange={handleFileInput} className="hidden" />
          </label>
        </div>

        {queue.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <p className="label-eyebrow">Queue ({queue.length})</p>
              <button
                onClick={handleUploadAll}
                disabled={submitting || pendingCount === 0}
                className="btn-primary"
              >
                {submitting ? "Uploading…" : `Upload ${pendingCount || queue.length} image(s)`}
              </button>
            </div>

            <div className="space-y-2">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-surface border border-border rounded-md px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.file.name}</p>
                    <p className="text-[11px] font-mono text-fg-subtle">
                      {(item.file.size / 1024).toFixed(0)} KB
                      {item.error ? ` · ${item.error}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusPill status={item.status} />
                    {item.status === "pending" && (
                      <button
                        onClick={() => removeFromQueue(item.id)}
                        className="text-fg-subtle hover:text-critical text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: QueuedFile["status"] }) {
  const map: Record<QueuedFile["status"], { label: string; className: string }> = {
    pending: { label: "Pending", className: "text-fg-subtle border-border-strong" },
    uploading: { label: "Uploading…", className: "text-info border-info/40 animate-pulse" },
    done: { label: "Validated", className: "text-success border-success/40" },
    error: { label: "Rejected", className: "text-critical border-critical/40" },
  };
  const s = map[status];
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5 ${s.className}`}>
      {s.label}
    </span>
  );
}
