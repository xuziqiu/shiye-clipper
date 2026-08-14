import path from "node:path";
import {
  CaptureCancelledError,
  captureItem,
  launchCaptureSession,
  type CaptureSession
} from "./capture.js";
import { ManifestWriter } from "./manifest.js";
import type { CaptureItem, CaptureSettings, JobManifest } from "./types.js";
import { makeId } from "./utils.js";

export interface ProgressEvent {
  type: "start" | "attempt" | "completed" | "failed" | "done";
  index?: number;
  total: number;
  item?: CaptureItem;
  manifest: JobManifest;
}

export type ProgressReporter = (event: ProgressEvent) => void;

export interface RunControl {
  signal: AbortSignal;
  checkpoint: (manifest: JobManifest, item?: CaptureItem) => Promise<void>;
  waitForIntervention: (manifest: JobManifest, item: CaptureItem, reason: string) => Promise<void>;
}

export function createManifest(urls: string[], settings: CaptureSettings): JobManifest {
  const now = new Date().toISOString();
  const outputDirectory = path.resolve(settings.outputDirectory);
  return {
    version: 1,
    jobId: makeId("job"),
    status: "running",
    createdAt: now,
    updatedAt: now,
    manifestPath: path.join(outputDirectory, "results.json"),
    settings: { ...settings, outputDirectory },
    items: urls.map((url, index) => ({ id: makeId("clip"), sequence: index + 1, url, status: "queued", attempts: 0 }))
  };
}

export async function runManifest(
  manifest: JobManifest,
  reporter: ProgressReporter = () => undefined,
  onlyFailed = false,
  control?: RunControl
): Promise<JobManifest> {
  const writer = new ManifestWriter(manifest);
  const candidates = manifest.items.filter((item) => !onlyFailed || item.status === "failed" || item.status === "cancelled");
  for (const item of candidates) {
    if (item.status !== "completed") {
      item.status = "queued";
      item.error = undefined;
    }
  }
  manifest.status = "running";
  manifest.completedAt = undefined;
  await writer.save();
  reporter({ type: "start", total: candidates.length, manifest });

  if (control?.signal.aborted) {
    for (const item of candidates) {
      if (item.status !== "completed") {
        item.status = "cancelled";
        item.error = "任务已取消";
        item.completedAt = new Date().toISOString();
      }
    }
    manifest.status = "cancelled";
    manifest.completedAt = new Date().toISOString();
    await writer.save();
    reporter({ type: "done", total: candidates.length, manifest });
    return manifest;
  }

  if (candidates.length === 0) {
    manifest.status = manifest.items.some((item) => item.status === "failed")
      ? "completed_with_errors"
      : "completed";
    manifest.completedAt = new Date().toISOString();
    await writer.save();
    reporter({ type: "done", total: 0, manifest });
    return manifest;
  }

  let session: CaptureSession | undefined;
  let nextIndex = 0;
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);

  try {
    session = await launchCaptureSession(manifest.settings);
    const requestedConcurrency = manifest.settings.profileDirectory ? 1 : manifest.settings.concurrency;
    const workerCount = Math.min(requestedConcurrency, candidates.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (!interrupted && !control?.signal.aborted) {
        const candidateIndex = nextIndex++;
        if (candidateIndex >= candidates.length) return;
        const item = candidates[candidateIndex];
        const absoluteIndex = manifest.items.indexOf(item);

        for (let attempt = 0; attempt <= manifest.settings.retries && !interrupted && !control?.signal.aborted; attempt += 1) {
          await control?.checkpoint(manifest, item);
          item.status = "running";
          item.attempts += 1;
          item.startedAt = new Date().toISOString();
          item.error = undefined;
          await writer.save();
          reporter({ type: "attempt", index: absoluteIndex, total: manifest.items.length, item, manifest });

          try {
            Object.assign(item, await captureItem(session!, item, manifest.settings, {
              signal: control?.signal,
              checkpoint: () => control?.checkpoint(manifest, item) || Promise.resolve(),
              waitForIntervention: control
                ? (_item, reason) => control.waitForIntervention(manifest, item, reason)
                : undefined
            }));
            item.status = "completed";
            await writer.save();
            reporter({ type: "completed", index: absoluteIndex, total: manifest.items.length, item, manifest });
            break;
          } catch (error) {
            if (error instanceof CaptureCancelledError || control?.signal.aborted) {
              item.status = "cancelled";
              item.completedAt = new Date().toISOString();
              item.error = "任务已取消";
              await writer.save();
              break;
            }
            item.status = "failed";
            item.completedAt = new Date().toISOString();
            item.error = error instanceof Error ? error.message : String(error);
            await writer.save();
            if (attempt < manifest.settings.retries) {
              await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
            } else {
              reporter({ type: "failed", index: absoluteIndex, total: manifest.items.length, item, manifest });
            }
          }
        }
      }
    }));
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await session?.close().catch(() => undefined);
  }

  manifest.status = control?.signal.aborted
    ? "cancelled"
    : interrupted
    ? "interrupted"
    : manifest.items.some((item) => item.status === "failed")
      ? "completed_with_errors"
      : "completed";
  if (manifest.status === "cancelled") {
    for (const item of manifest.items) {
      if (item.status === "queued" || item.status === "running" || item.status === "paused") {
        item.status = "cancelled";
        item.error = "任务已取消";
        item.completedAt = new Date().toISOString();
      }
    }
  }
  manifest.completedAt = new Date().toISOString();
  await writer.save();
  reporter({ type: "done", total: candidates.length, manifest });
  return manifest;
}
