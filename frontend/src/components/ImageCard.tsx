import { useState } from "react";
import { ProductImage, imageFileUrl } from "../lib/api";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  validated: { label: "Validated", className: "bg-success/10 text-success border-success/30" },
  uploaded: { label: "Uploaded", className: "bg-info/10 text-info border-info/30" },
  rejected: { label: "Rejected", className: "bg-critical/10 text-critical border-critical/30" },
  queued_for_inspection: {
    label: "Queued",
    className: "bg-warning/10 text-warning border-warning/30",
  },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ImageCard({ image }: { image: ProductImage }) {
  const status = STATUS_STYLES[image.status] ?? STATUS_STYLES.uploaded;
  const [imgFailed, setImgFailed] = useState(false);
  const hasFile = image.status !== "rejected";

  return (
    <div className="bracket-frame group card overflow-hidden hover:border-border-strong transition-colors">
      <div className="aspect-[4/3] bg-surface-2 bg-grid-pattern bg-grid flex items-center justify-center relative overflow-hidden">
        {hasFile && !imgFailed ? (
          <img
            src={imageFileUrl(image.id)}
            alt={image.file_name}
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="text-fg-subtle">
            <path
              d="M4 16l4.5-5.5a1 1 0 011.5-.1L14 14l2-2.5a1 1 0 011.6 0L21 16"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="8" cy="8.5" r="1.4" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        )}
        <span
          className={`absolute top-2.5 right-2.5 text-[10px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5 ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <div className="p-3.5">
        <p className="text-sm font-medium truncate" title={image.file_name}>
          {image.file_name}
        </p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="label-eyebrow">{image.product_line || "Unassigned"}</span>
          <span className="text-[11px] font-mono text-fg-subtle">{formatSize(image.size_bytes)}</span>
        </div>
        {image.width && image.height && (
          <p className="text-[11px] font-mono text-fg-subtle mt-1">
            {image.width}×{image.height}px · {image.source.replace("_", " ")}
          </p>
        )}
        {image.validation_notes && (
          <p className="text-[11px] text-critical mt-1.5 leading-snug">{image.validation_notes}</p>
        )}
      </div>
    </div>
  );
}
