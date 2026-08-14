import { spawn, execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import express from "express";
import { resolveUrlInputs } from "./input.js";
import { ManifestWriter, readManifest } from "./manifest.js";
import { createManifest, runManifest, type RunControl } from "./runner.js";
import type { CaptureFormat, CaptureItem, JobManifest } from "./types.js";
import { clampInteger, timestampForPath } from "./utils.js";

const execFileAsync = promisify(execFile);
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const sourceParent = path.resolve(sourceDir, "..");
const rootDir = path.basename(sourceParent).toLowerCase() === "dist" ? path.resolve(sourceParent, "..") : sourceParent;
const publicDir = path.join(rootDir, "public");
const defaultOutputRoot = path.join(rootDir, "captures", "ui");

function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const normalized = hostHeader.trim().toLowerCase();
  const hostname = normalized.startsWith("[")
    ? normalized.slice(0, normalized.indexOf("]") + 1)
    : normalized.split(":", 1)[0];
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
}

function isSameLocalOrigin(originHeader: string, hostHeader: string): boolean {
  try {
    const origin = new URL(originHeader);
    return origin.protocol === "http:"
      && isLoopbackHost(origin.host)
      && origin.host.toLowerCase() === hostHeader.trim().toLowerCase();
  } catch {
    return false;
  }
}

class UiJobRegistry {
  private readonly jobs = new Map<string, JobManifest>();
  private writeChain = Promise.resolve();

  constructor(private readonly indexPath: string) {}

  async init(): Promise<void> {
    try {
      const paths = JSON.parse(await readFile(this.indexPath, "utf8")) as string[];
      for (const manifestPath of paths) {
        try {
          const manifest = await readManifest(manifestPath);
          if (["running", "queued", "paused", "waiting_for_user"].includes(manifest.status)) {
            manifest.status = "interrupted";
            manifest.completedAt = new Date().toISOString();
            for (const item of manifest.items) {
              if (["running", "queued", "paused", "waiting_for_user"].includes(item.status)) {
                item.status = "failed";
                item.error = "控制台在任务完成前退出";
              }
            }
            await new ManifestWriter(manifest).save();
          }
          this.jobs.set(manifest.jobId, manifest);
        } catch {
          // Ignore a history entry when its manifest was moved or removed.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  list(): JobManifest[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(jobId: string): JobManifest | undefined {
    return this.jobs.get(jobId);
  }

  async add(manifest: JobManifest): Promise<void> {
    this.jobs.set(manifest.jobId, manifest);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const snapshot = JSON.stringify(this.list().map((job) => job.manifestPath), null, 2);
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(path.dirname(this.indexPath), { recursive: true });
      const temporary = `${this.indexPath}.tmp`;
      await writeFile(temporary, snapshot, "utf8");
      await rename(temporary, this.indexPath);
    });
    await this.writeChain;
  }
}

class UiJobControl implements RunControl {
  private readonly controller = new AbortController();
  private paused = false;
  private readonly pauseWaiters = new Set<() => void>();
  private readonly interventionWaiters = new Map<string, () => void>();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  async pause(manifest: JobManifest): Promise<void> {
    if (this.signal.aborted) return;
    this.paused = true;
    manifest.status = "paused";
    await new ManifestWriter(manifest).save();
  }

  async resume(manifest: JobManifest): Promise<void> {
    this.paused = false;
    for (const resolve of this.pauseWaiters) resolve();
    this.pauseWaiters.clear();
    if (!this.signal.aborted && manifest.status === "paused") {
      manifest.status = "running";
      await new ManifestWriter(manifest).save();
    }
  }

  async cancel(manifest: JobManifest): Promise<void> {
    this.controller.abort();
    this.paused = false;
    for (const resolve of this.pauseWaiters) resolve();
    this.pauseWaiters.clear();
    for (const resolve of this.interventionWaiters.values()) resolve();
    this.interventionWaiters.clear();
    manifest.status = "cancelled";
    await new ManifestWriter(manifest).save();
  }

  async continueItem(itemId: string): Promise<boolean> {
    const resolve = this.interventionWaiters.get(itemId);
    if (!resolve) return false;
    this.interventionWaiters.delete(itemId);
    resolve();
    return true;
  }

  async checkpoint(manifest: JobManifest, item?: CaptureItem): Promise<void> {
    if (!this.paused || this.signal.aborted) return;
    manifest.status = "paused";
    if (item && item.status === "running") item.status = "paused";
    await new ManifestWriter(manifest).save();
    await new Promise<void>((resolve) => this.pauseWaiters.add(resolve));
    if (!this.signal.aborted) {
      manifest.status = "running";
      if (item?.status === "paused") item.status = "running";
      await new ManifestWriter(manifest).save();
    }
  }

  async waitForIntervention(manifest: JobManifest, item: CaptureItem, reason: string): Promise<void> {
    item.status = "waiting_for_user";
    item.interventionReason = reason;
    manifest.status = "waiting_for_user";
    await new ManifestWriter(manifest).save();
    await new Promise<void>((resolve) => this.interventionWaiters.set(item.id, resolve));
    if (!this.signal.aborted) {
      item.status = "running";
      manifest.status = "running";
      await new ManifestWriter(manifest).save();
    }
  }
}

class UiTaskQueue {
  private pending: Array<{ manifest: JobManifest; onlyFailed: boolean; control: UiJobControl }> = [];
  private running = false;

  enqueue(manifest: JobManifest, control: UiJobControl, onlyFailed = false): void {
    this.pending.push({ manifest, onlyFailed, control });
    void this.work();
  }

  private async work(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const task = this.pending.shift()!;
        await runManifest(task.manifest, () => undefined, task.onlyFailed, task.control);
      }
    } finally {
      this.running = false;
    }
  }
}

function jobForClient(job: JobManifest) {
  const completed = job.items.filter((item) => item.status === "completed").length;
  const failed = job.items.filter((item) => item.status === "failed").length;
  const cancelled = job.items.filter((item) => item.status === "cancelled").length;
  return {
    ...job,
    progress: { completed, failed, cancelled, total: job.items.length },
    items: job.items.map((item) => ({
      ...item,
      imageUrl: item.outputFile ? `/api/jobs/${job.jobId}/items/${item.id}/image` : undefined,
      diagnosticUrl: item.diagnosticFile ? `/api/jobs/${job.jobId}/items/${item.id}/diagnostic` : undefined
    }))
  };
}

async function chooseWindowsFolder(): Promise<string> {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
    "$dialog=New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description='选择网页剪报保存目录'",
    "$dialog.ShowNewFolderButton=$true",
    "if($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){[Console]::Write($dialog.SelectedPath)}"
  ].join(";");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-STA", "-Command", script], {
    encoding: "utf8",
    windowsHide: true
  });
  return stdout.trim();
}

export interface UiServerOptions {
  port?: number;
  openBrowser?: boolean;
  historyFilePath?: string;
  outputRoot?: string;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<{ server: Server; url: string }> {
  const registry = new UiJobRegistry(options.historyFilePath || path.join(rootDir, "data", "ui-jobs.json"));
  await registry.init();
  const queue = new UiTaskQueue();
  const controls = new Map<string, UiJobControl>();
  const configuredOutputRoot = path.resolve(options.outputRoot || defaultOutputRoot);
  const app = express();
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    if (request.path.startsWith("/api/")) response.setHeader("Cache-Control", "no-store");

    const host = request.get("host");
    if (!isLoopbackHost(host)) {
      response.status(403).json({ error: "只允许从本机访问控制台" });
      return;
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.get("origin");
      const fetchSite = request.get("sec-fetch-site")?.toLowerCase();
      const untrustedOrigin = origin && host ? !isSameLocalOrigin(origin, host) : false;
      const crossSiteRequest = fetchSite && !["same-origin", "none"].includes(fetchSite);
      if (untrustedOrigin || crossSiteRequest) {
        response.status(403).json({ error: "已拒绝跨站控制请求" });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(publicDir));

  app.get("/api/config", (_request, response) => {
    response.json({ defaultOutputRoot: configuredOutputRoot, maxUrls: 5_000 });
  });

  app.get("/api/jobs", (_request, response) => {
    response.json({ jobs: registry.list().map(jobForClient) });
  });

  app.get("/api/jobs/:jobId", (request, response) => {
    const job = registry.get(request.params.jobId);
    if (!job) return response.status(404).json({ error: "任务不存在" });
    response.json({ job: jobForClient(job) });
  });

  app.post("/api/jobs", async (request, response) => {
    try {
      const urls = await resolveUrlInputs([], String(request.body?.urlsText || ""));
      const outputRoot = path.resolve(String(request.body?.outputRoot || configuredOutputRoot));
      const format: CaptureFormat = request.body?.format === "jpeg" ? "jpeg" : "png";
      const requestedScale = Number(request.body?.qualityScale);
      const qualityScale = requestedScale === 1.5 || requestedScale === 2 ? requestedScale : 1;
      const filenameMode = request.body?.filenameMode === "sequence" ? "sequence" : "title";
      const useProfile = request.body?.useProfile === true;
      const requestedConcurrency = clampInteger(request.body?.concurrency ?? 1, 1, 8, "并发数");
      const outputDirectory = path.join(outputRoot, timestampForPath());
      const manifest = createManifest(urls, {
        outputDirectory,
        concurrency: useProfile ? 1 : requestedConcurrency,
        retries: clampInteger(request.body?.retries ?? 1, 0, 5, "重试次数"),
        timeoutSeconds: clampInteger(request.body?.timeoutSeconds ?? 60, 10, 600, "超时秒数"),
        format,
        visible: request.body?.visible === true,
        viewportWidth: 1440,
        viewportHeight: 900,
        qualityScale,
        filenameMode,
        profileDirectory: useProfile ? path.join(rootDir, "data", "browser-profile") : undefined,
        cookiePreference: ["reject", "accept", "none"].includes(request.body?.cookiePreference)
          ? request.body.cookiePreference
          : "reject",
        expandArticles: request.body?.expandArticles !== false,
        maxScrolls: clampInteger(request.body?.maxScrolls ?? 300, 10, 1_000, "最大滚动次数"),
        maxHeight: clampInteger(request.body?.maxHeight ?? 60_000, 10_000, 200_000, "最大页面高度"),
        tiledThreshold: 28_000
      });
      manifest.status = "queued";
      await new ManifestWriter(manifest).save();
      await registry.add(manifest);
      const control = new UiJobControl();
      controls.set(manifest.jobId, control);
      queue.enqueue(manifest, control);
      response.status(202).json({ job: jobForClient(manifest) });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/jobs/:jobId/retry", async (request, response) => {
    const job = registry.get(request.params.jobId);
    if (!job) return response.status(404).json({ error: "任务不存在" });
    if (job.status === "running" || job.status === "queued") {
      return response.status(409).json({ error: "任务仍在执行" });
    }
    if (!job.items.some((item) => item.status === "failed" || item.status === "cancelled")) {
      return response.status(400).json({ error: "没有需要重试的失败项" });
    }
    if (request.body?.visible === true) {
      job.settings.visible = true;
      job.settings.profileDirectory = path.join(rootDir, "data", "browser-profile");
      job.settings.concurrency = 1;
    }
    job.status = "queued";
    job.completedAt = undefined;
    await new ManifestWriter(job).save();
    const control = new UiJobControl();
    controls.set(job.jobId, control);
    queue.enqueue(job, control, true);
    response.status(202).json({ job: jobForClient(job) });
  });

  app.post("/api/jobs/:jobId/pause", async (request, response) => {
    const job = registry.get(request.params.jobId);
    const control = controls.get(request.params.jobId);
    if (!job || !control) return response.status(404).json({ error: "运行中的任务不存在" });
    await control.pause(job);
    response.json({ job: jobForClient(job) });
  });

  app.post("/api/jobs/:jobId/resume", async (request, response) => {
    const job = registry.get(request.params.jobId);
    const control = controls.get(request.params.jobId);
    if (!job || !control) return response.status(404).json({ error: "暂停的任务不存在" });
    await control.resume(job);
    response.json({ job: jobForClient(job) });
  });

  app.post("/api/jobs/:jobId/cancel", async (request, response) => {
    const job = registry.get(request.params.jobId);
    const control = controls.get(request.params.jobId);
    if (!job || !control) return response.status(404).json({ error: "运行中的任务不存在" });
    await control.cancel(job);
    response.json({ job: jobForClient(job) });
  });

  app.post("/api/jobs/:jobId/items/:itemId/continue", async (request, response) => {
    const job = registry.get(request.params.jobId);
    const control = controls.get(request.params.jobId);
    if (!job || !control) return response.status(404).json({ error: "等待中的任务不存在" });
    const continued = await control.continueItem(request.params.itemId);
    if (!continued) return response.status(409).json({ error: "该网页当前不需要人工处理" });
    response.json({ ok: true });
  });

  app.get("/api/jobs/:jobId/items/:itemId/image", (request, response) => {
    const job = registry.get(request.params.jobId);
    const item = job?.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item?.outputFile) return response.status(404).json({ error: "截图不存在" });
    response.sendFile(path.resolve(item.outputFile));
  });

  app.get("/api/jobs/:jobId/items/:itemId/diagnostic", (request, response) => {
    const job = registry.get(request.params.jobId);
    const item = job?.items.find((candidate) => candidate.id === request.params.itemId);
    if (!item?.diagnosticFile) return response.status(404).json({ error: "失败现场不存在" });
    response.sendFile(path.resolve(item.diagnosticFile));
  });

  app.post("/api/jobs/:jobId/open-folder", (request, response) => {
    const job = registry.get(request.params.jobId);
    if (!job) return response.status(404).json({ error: "任务不存在" });
    spawn("explorer.exe", [job.settings.outputDirectory], { detached: true, stdio: "ignore" }).unref();
    response.json({ ok: true });
  });

  app.post("/api/pick-folder", async (_request, response) => {
    try {
      const selectedPath = await chooseWindowsFolder();
      response.json({ selectedPath });
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/*splat", (_request, response) => response.sendFile(path.join(publicDir, "index.html")));

  const port = options.port ?? 4310;
  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(port, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  const address = server.address();
  const actualPort = address && typeof address === "object" ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}`;

  if (options.openBrowser !== false) {
    spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  }
  return { server, url };
}
