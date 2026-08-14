export type ItemStatus = "queued" | "running" | "waiting_for_user" | "paused" | "completed" | "failed" | "cancelled";
export type JobStatus = "queued" | "running" | "waiting_for_user" | "paused" | "completed" | "completed_with_errors" | "interrupted" | "cancelled";
export type CaptureFormat = "png" | "jpeg";
export type CaptureQualityScale = 1 | 1.5 | 2;
export type FilenameMode = "title" | "sequence";
export type BrowserPreference = "auto" | "edge" | "chrome";

export interface CaptureSettings {
  outputDirectory: string;
  concurrency: number;
  retries: number;
  timeoutSeconds: number;
  format: CaptureFormat;
  visible: boolean;
  viewportWidth: number;
  viewportHeight: number;
  browser?: BrowserPreference;
  browserPath?: string;
  qualityScale?: CaptureQualityScale;
  filenameMode?: FilenameMode;
  profileDirectory?: string;
  cookiePreference?: "reject" | "accept" | "none";
  expandArticles?: boolean;
  maxScrolls?: number;
  maxHeight?: number;
  tiledThreshold?: number;
}

export interface CaptureItem {
  id: string;
  sequence?: number;
  url: string;
  status: ItemStatus;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  title?: string;
  description?: string;
  siteName?: string;
  publishedAt?: string;
  finalUrl?: string;
  outputFile?: string;
  diagnosticFile?: string;
  width?: number;
  height?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  bytes?: number;
  captureMode?: "full_page" | "tiled";
  capturedHeight?: number;
  warning?: string;
  interventionReason?: string;
  error?: string;
}

export interface JobManifest {
  version: 1;
  jobId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  manifestPath: string;
  settings: CaptureSettings;
  items: CaptureItem[];
}

export interface PageMetadata {
  title: string;
  description: string;
  siteName: string;
  publishedAt: string;
}
