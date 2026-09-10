// Type declarations for the TensorFlow.js / COCO-SSD globals loaded via
// CDN <script> tags in index.html.
export interface DetectedObject {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

export interface CocoSsdModel {
  detect: (
    input: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
    maxNumBoxes?: number,
    minScore?: number
  ) => Promise<DetectedObject[]>;
}

declare global {
  interface Window {
    cocoSsd?: {
      load: (config?: { base?: "lite_mobilenet_v2" | "mobilenet_v1" | "mobilenet_v2" }) => Promise<CocoSsdModel>;
    };
    tf?: unknown;
  }
}
