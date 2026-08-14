#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { findBrowser } from "./capture.js";
import { resolveUrlInputs } from "./input.js";
import { readManifest } from "./manifest.js";
import { createManifest, runManifest, type ProgressEvent } from "./runner.js";
import type { BrowserPreference, CaptureFormat, CaptureQualityScale, CaptureSettings, FilenameMode, JobManifest } from "./types.js";
import { startUiServer } from "./ui-server.js";
import { clampInteger, timestampForPath } from "./utils.js";

const HELP = `
拾页 Shiye — 批量完整网页截图

用法：
  shiye capture <网址或列表文件...> [选项]
  shiye ui [--port 4310] [--no-open]
  shiye status <results.json> [--json]
  shiye retry <results.json> [--json]

capture 选项：
  -o, --output <目录>       输出目录（默认：captures/时间）
  -c, --concurrency <数量>  并发页面数，1-8（默认：1）
  -r, --retry <次数>        失败重试次数，0-5（默认：1）
  -t, --timeout <秒>        单页打开超时，10-600（默认：60）
      --format <png|jpeg>   图片格式（默认：png）
      --browser <浏览器>    auto、edge 或 chrome（默认：auto）
      --browser-path <路径> 指定 Chromium 浏览器程序路径
      --quality <档位>      standard、high 或 ultra（1×、1.5×、2×）
      --filename <方式>     title 或 sequence（默认：title）
      --viewport <宽x高>    浏览器视口（默认：1440x900）
      --visible             显示浏览器执行窗口
      --headless            后台静默运行（默认）
      --profile <目录>      使用专用浏览器登录档案
      --cookie <策略>       reject、accept 或 none（默认：reject）
      --max-height <像素>   最长截取高度（默认：60000）
      --max-scrolls <次数>  最大滚动次数（默认：300）
      --no-expand           不自动点击“阅读全文”
      --json                只向 stdout 输出机器可读结果

输入文件支持 TXT、CSV、TSV 和 JSON。也可以通过 stdin 传入网址。

示例：
  shiye ui
  shiye capture urls.txt -o D:\\网页剪报
  shiye capture https://example.com --json
  shiye retry D:\\网页剪报\\results.json
`;

interface ParsedCapture {
  sources: string[];
  settings: CaptureSettings;
  json: boolean;
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} 缺少参数`);
  return value;
}

function parseViewport(value: string): [number, number] {
  const match = /^(\d{3,4})x(\d{3,4})$/i.exec(value);
  if (!match) throw new Error("--viewport 格式应为 1440x900");
  return [
    clampInteger(match[1], 800, 3840, "视口宽度"),
    clampInteger(match[2], 600, 2160, "视口高度")
  ];
}

function parseCaptureArgs(args: string[]): ParsedCapture {
  let outputDirectory = path.resolve("captures", timestampForPath());
  let concurrency = 1;
  let retries = 1;
  let timeoutSeconds = 60;
  let format: CaptureFormat = "png";
  let browser: BrowserPreference = "auto";
  let browserPath: string | undefined;
  let qualityScale: CaptureQualityScale = 1;
  let filenameMode: FilenameMode = "title";
  let visible = false;
  let viewportWidth = 1440;
  let viewportHeight = 900;
  let profileDirectory: string | undefined;
  let cookiePreference: "reject" | "accept" | "none" = "reject";
  let expandArticles = true;
  let maxScrolls = 300;
  let maxHeight = 60_000;
  let json = false;
  const sources: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-o" || arg === "--output") {
      outputDirectory = path.resolve(valueAfter(args, index, arg));
      index += 1;
    } else if (arg === "-c" || arg === "--concurrency") {
      concurrency = clampInteger(valueAfter(args, index, arg), 1, 8, "并发数");
      index += 1;
    } else if (arg === "-r" || arg === "--retry") {
      retries = clampInteger(valueAfter(args, index, arg), 0, 5, "重试次数");
      index += 1;
    } else if (arg === "-t" || arg === "--timeout") {
      timeoutSeconds = clampInteger(valueAfter(args, index, arg), 10, 600, "超时秒数");
      index += 1;
    } else if (arg === "--format") {
      const value = valueAfter(args, index, arg);
      if (value !== "png" && value !== "jpeg") throw new Error("--format 只支持 png 或 jpeg");
      format = value;
      index += 1;
    } else if (arg === "--browser") {
      const value = valueAfter(args, index, arg);
      if (value !== "auto" && value !== "edge" && value !== "chrome") {
        throw new Error("--browser 只支持 auto、edge 或 chrome");
      }
      browser = value;
      index += 1;
    } else if (arg === "--browser-path") {
      browserPath = path.resolve(valueAfter(args, index, arg));
      index += 1;
    } else if (arg === "--quality") {
      const value = valueAfter(args, index, arg);
      const scales: Record<string, CaptureQualityScale> = { standard: 1, high: 1.5, ultra: 2 };
      if (!scales[value]) throw new Error("--quality 只支持 standard、high 或 ultra");
      qualityScale = scales[value];
      index += 1;
    } else if (arg === "--filename") {
      const value = valueAfter(args, index, arg);
      if (value !== "title" && value !== "sequence") throw new Error("--filename 只支持 title 或 sequence");
      filenameMode = value;
      index += 1;
    } else if (arg === "--viewport") {
      [viewportWidth, viewportHeight] = parseViewport(valueAfter(args, index, arg));
      index += 1;
    } else if (arg === "--visible") {
      visible = true;
    } else if (arg === "--headless") {
      visible = false;
    } else if (arg === "--profile") {
      profileDirectory = path.resolve(valueAfter(args, index, arg));
      index += 1;
    } else if (arg === "--cookie") {
      const value = valueAfter(args, index, arg);
      if (value !== "reject" && value !== "accept" && value !== "none") {
        throw new Error("--cookie 只支持 reject、accept 或 none");
      }
      cookiePreference = value;
      index += 1;
    } else if (arg === "--max-height") {
      maxHeight = clampInteger(valueAfter(args, index, arg), 10_000, 200_000, "最大页面高度");
      index += 1;
    } else if (arg === "--max-scrolls") {
      maxScrolls = clampInteger(valueAfter(args, index, arg), 10, 1_000, "最大滚动次数");
      index += 1;
    } else if (arg === "--no-expand") {
      expandArticles = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg.startsWith("-")) {
      throw new Error(`未知选项：${arg}`);
    } else {
      sources.push(arg);
    }
  }

  return {
    sources,
    json,
    settings: {
      outputDirectory,
      concurrency,
      retries,
      timeoutSeconds,
      format,
      visible,
      viewportWidth,
      viewportHeight,
      browser,
      browserPath,
      qualityScale,
      filenameMode,
      profileDirectory,
      cookiePreference,
      expandArticles,
      maxScrolls,
      maxHeight,
      tiledThreshold: 28_000
    }
  };
}

async function readStdinIfNeeded(hasSources: boolean): Promise<string> {
  if (hasSources || process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function summary(manifest: JobManifest) {
  const completed = manifest.items.filter((item) => item.status === "completed").length;
  const failed = manifest.items.filter((item) => item.status === "failed").length;
  return {
    ok: failed === 0,
    jobId: manifest.jobId,
    status: manifest.status,
    total: manifest.items.length,
    completed,
    failed,
    browser: manifest.settings.browser || "auto",
    outputDirectory: manifest.settings.outputDirectory,
    manifestPath: manifest.manifestPath,
    items: manifest.items.map((item) => ({
      id: item.id,
      url: item.url,
      status: item.status,
      attempts: item.attempts,
      title: item.title,
      outputFile: item.outputFile,
      captureMode: item.captureMode,
      capturedHeight: item.capturedHeight,
      warning: item.warning,
      interventionReason: item.interventionReason,
      error: item.error
    }))
  };
}

function humanReporter(json: boolean) {
  return (event: ProgressEvent) => {
    const output = json ? process.stderr : process.stdout;
    if (event.type === "start") {
      output.write(`任务 ${event.manifest.jobId}：${event.total} 个网页\n`);
    } else if (event.type === "attempt" && event.item && event.index !== undefined) {
      output.write(`[${event.index + 1}/${event.total}] 打开 ${event.item.url}（第 ${event.item.attempts} 次）\n`);
    } else if (event.type === "completed" && event.item && event.index !== undefined) {
      output.write(`[${event.index + 1}/${event.total}] 完成 ${event.item.title || event.item.url}\n`);
    } else if (event.type === "failed" && event.item && event.index !== undefined) {
      output.write(`[${event.index + 1}/${event.total}] 失败 ${event.item.url}：${event.item.error}\n`);
    }
  };
}

function printHumanSummary(manifest: JobManifest): void {
  const result = summary(manifest);
  process.stdout.write(`\n完成：${result.completed}/${result.total}，失败：${result.failed}\n`);
  process.stdout.write(`图片目录：${result.outputDirectory}\n`);
  process.stdout.write(`任务清单：${result.manifestPath}\n`);
}

async function captureCommand(args: string[]): Promise<void> {
  const parsed = parseCaptureArgs(args);
  const stdin = await readStdinIfNeeded(parsed.sources.length > 0);
  const urls = await resolveUrlInputs(parsed.sources, stdin);
  const resolvedBrowser = await findBrowser(parsed.settings.browser || "auto", parsed.settings.browserPath);
  parsed.settings.browser = resolvedBrowser.kind;
  const manifest = createManifest(urls, parsed.settings);
  const readline = parsed.settings.visible && process.stdin.isTTY
    ? createInterface({ input: process.stdin, output: process.stderr })
    : undefined;
  const controller = new AbortController();
  const control = parsed.settings.visible
    ? {
        signal: controller.signal,
        checkpoint: async () => undefined,
        waitForIntervention: async (_manifest: JobManifest, _item: JobManifest["items"][number], reason: string) => {
          if (!readline) throw new Error(`需要人工处理：${reason}；请在控制台中使用可见模式`);
          await readline.question(`\n页面需要人工处理：${reason}\n请在浏览器中处理完成后按 Enter 继续…`);
        }
      }
    : undefined;
  const result = await runManifest(manifest, humanReporter(parsed.json), false, control);
  readline?.close();
  if (parsed.json) process.stdout.write(`${JSON.stringify(summary(result))}\n`);
  else printHumanSummary(result);
  if (result.status !== "completed") process.exitCode = 2;
}

function parseSimpleFlags(args: string[]): { json: boolean; positional: string[] } {
  const positional: string[] = [];
  let json = false;
  for (const arg of args) {
    if (arg === "--json") json = true;
    else if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    } else if (arg.startsWith("-")) throw new Error(`未知选项：${arg}`);
    else positional.push(arg);
  }
  return { json, positional };
}

async function statusCommand(args: string[]): Promise<void> {
  const parsed = parseSimpleFlags(args);
  if (parsed.positional.length !== 1) throw new Error("status 需要一个 results.json 路径");
  const manifest = await readManifest(parsed.positional[0]);
  if (parsed.json) process.stdout.write(`${JSON.stringify(summary(manifest))}\n`);
  else printHumanSummary(manifest);
}

async function retryCommand(args: string[]): Promise<void> {
  const parsed = parseSimpleFlags(args);
  if (parsed.positional.length !== 1) throw new Error("retry 需要一个 results.json 路径");
  const manifest = await readManifest(parsed.positional[0]);
  const result = await runManifest(manifest, humanReporter(parsed.json), true);
  if (parsed.json) process.stdout.write(`${JSON.stringify(summary(result))}\n`);
  else printHumanSummary(result);
  if (result.status !== "completed") process.exitCode = 2;
}

async function uiCommand(args: string[]): Promise<void> {
  let port = 4310;
  let openBrowser = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--port") {
      port = clampInteger(valueAfter(args, index, arg), 1, 65_535, "端口");
      index += 1;
    } else if (arg === "--no-open") {
      openBrowser = false;
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      return;
    } else {
      throw new Error(`未知选项：${arg}`);
    }
  }
  const { url } = await startUiServer({ port, openBrowser });
  process.stdout.write(`拾页 Shiye 控制台已启动：${url}\n`);
  process.stdout.write("保持此窗口运行；按 Ctrl+C 退出。\n");
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(HELP);
    return;
  }
  if (command === "capture") return captureCommand(args);
  if (command === "ui") return uiCommand(args);
  if (command === "status") return statusCommand(args);
  if (command === "retry") return retryCommand(args);
  throw new Error(`未知命令：${command}\n${HELP}`);
}

main().catch((error) => {
  process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
