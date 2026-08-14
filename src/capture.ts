import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import sharp from "sharp";
import type { BrowserPreference, CaptureItem, CaptureSettings, PageMetadata } from "./types.js";
import { safeFilename } from "./utils.js";

const EDGE_PATHS = [
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
  process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe")
].filter((candidate): candidate is string => Boolean(candidate));

const CHROME_PATHS = [
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
  process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe")
].filter((candidate): candidate is string => Boolean(candidate));

const browserIdentity = {
  locale: "zh-CN",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
};

export class InterventionRequiredError extends Error {
  constructor(public readonly reason: string) {
    super(`需要人工处理：${reason}`);
    this.name = "InterventionRequiredError";
  }
}

export class CaptureCancelledError extends Error {
  constructor() {
    super("任务已取消");
    this.name = "CaptureCancelledError";
  }
}

export interface CaptureHooks {
  signal?: AbortSignal;
  checkpoint?: () => Promise<void>;
  waitForIntervention?: (item: CaptureItem, reason: string) => Promise<void>;
}

interface PageLease {
  page: Page;
  release: () => Promise<void>;
}

export interface CaptureSession {
  createPage: () => Promise<PageLease>;
  close: () => Promise<void>;
}

export interface ResolvedBrowser {
  kind: Exclude<BrowserPreference, "auto">;
  executablePath: string;
}

async function findFirstExecutable(candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      const details = await stat(candidate);
      if (details.isFile()) return candidate;
    } catch {
      // Try the next installation location.
    }
  }
  return undefined;
}

export async function findEdge(): Promise<string> {
  const override = process.env.SHIYE_EDGE_PATH || process.env.CLIPPER_EDGE_PATH;
  const candidates = override ? [override, ...EDGE_PATHS] : EDGE_PATHS;
  const executable = await findFirstExecutable(candidates);
  if (executable) return executable;
  throw new Error("未找到 Microsoft Edge；可用 --browser-path 或 SHIYE_EDGE_PATH 指定 msedge.exe");
}

export async function findChrome(): Promise<string> {
  const override = process.env.SHIYE_CHROME_PATH || process.env.CLIPPER_CHROME_PATH;
  const candidates = override ? [override, ...CHROME_PATHS] : CHROME_PATHS;
  const executable = await findFirstExecutable(candidates);
  if (executable) return executable;
  throw new Error("未找到 Google Chrome；可用 --browser-path 或 SHIYE_CHROME_PATH 指定 chrome.exe");
}

export async function findBrowser(preference: BrowserPreference = "auto", customPath?: string): Promise<ResolvedBrowser> {
  if (customPath) {
    const executable = await findFirstExecutable([customPath]);
    if (!executable) throw new Error(`浏览器路径不存在或不是文件：${customPath}`);
    const executableName = path.basename(executable).toLowerCase();
    const inferredKind = executableName.includes("chrome") || executableName.includes("chromium") ? "chrome" : "edge";
    return { kind: preference === "auto" ? inferredKind : preference, executablePath: executable };
  }

  if (preference === "edge") return { kind: "edge", executablePath: await findEdge() };
  if (preference === "chrome") return { kind: "chrome", executablePath: await findChrome() };

  try {
    return { kind: "edge", executablePath: await findEdge() };
  } catch {
    try {
      return { kind: "chrome", executablePath: await findChrome() };
    } catch {
      throw new Error("未找到可用浏览器；请安装 Microsoft Edge 或 Google Chrome，或使用 --browser-path 指定 Chromium 浏览器");
    }
  }
}

function contextOptions(settings: CaptureSettings) {
  return {
    viewport: { width: settings.viewportWidth, height: settings.viewportHeight },
    deviceScaleFactor: settings.qualityScale || 1,
    ...browserIdentity
  };
}

export async function launchCaptureSession(settings: CaptureSettings): Promise<CaptureSession> {
  const resolvedBrowser = await findBrowser(settings.browser || "auto", settings.browserPath);
  const launchOptions = {
    executablePath: resolvedBrowser.executablePath,
    headless: !settings.visible,
    args: ["--disable-blink-features=AutomationControlled"]
  };

  if (settings.profileDirectory) {
    await mkdir(settings.profileDirectory, { recursive: true });
    const context = await chromium.launchPersistentContext(settings.profileDirectory, {
      ...launchOptions,
      ...contextOptions(settings)
    });
    return {
      createPage: async () => {
        const page = await context.newPage();
        return { page, release: () => page.close().catch(() => undefined) };
      },
      close: () => context.close().catch(() => undefined)
    };
  }

  const browser: Browser = await chromium.launch(launchOptions);
  return {
    createPage: async () => {
      const context = await browser.newContext(contextOptions(settings));
      const page = await context.newPage();
      return { page, release: () => context.close().catch(() => undefined) };
    },
    close: () => browser.close().catch(() => undefined)
  };
}

async function checkpoint(hooks: CaptureHooks): Promise<void> {
  if (hooks.signal?.aborted) throw new CaptureCancelledError();
  await hooks.checkpoint?.();
  if (hooks.signal?.aborted) throw new CaptureCancelledError();
}

async function clickFirstMatchingText(page: Page, texts: string[]): Promise<boolean> {
  const candidates = page.locator('button, [role="button"], input[type="button"], input[type="submit"], a');
  const count = Math.min(await candidates.count(), 250);
  const wanted = texts.map((value) => value.toLocaleLowerCase());
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const text = ((await candidate.innerText().catch(() => "")) || (await candidate.getAttribute("value")) || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase();
    if (wanted.includes(text)) {
      await candidate.click({ timeout: 2_000 }).catch(() => undefined);
      await page.waitForTimeout(250);
      return true;
    }
  }
  return false;
}

async function applySafePageRules(page: Page, settings: CaptureSettings): Promise<void> {
  const preference = settings.cookiePreference || "reject";
  if (preference === "reject") {
    await clickFirstMatchingText(page, [
      "拒绝全部", "全部拒绝", "仅必要 cookie", "仅使用必要 cookie", "reject all", "decline all", "only necessary"
    ]);
  } else if (preference === "accept") {
    await clickFirstMatchingText(page, [
      "接受全部", "全部接受", "同意并继续", "accept all", "allow all", "agree and continue"
    ]);
  }

  const closeButton = page.locator(
    '[role="dialog"] button[aria-label*="close" i], [role="dialog"] button[title*="close" i], [role="dialog"] button[aria-label*="关闭"], .modal button[aria-label*="close" i]'
  ).first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  }

  if (settings.expandArticles !== false) {
    await clickFirstMatchingText(page, ["展开全文", "阅读全文", "显示全文", "继续阅读", "read more", "show more", "continue reading"]);
  }
}

async function detectInterventionReason(page: Page): Promise<string | undefined> {
  const url = page.url().toLocaleLowerCase();
  const title = (await page.title().catch(() => "")).toLocaleLowerCase();
  const bodyText = ((await page.locator("body").innerText({ timeout: 3_000 }).catch(() => "")) || "").slice(0, 12_000);
  const frames = page.frames().map((frame) => frame.url().toLocaleLowerCase());

  if (/\/(login|signin|sign-in|auth)(\/|\?|$)/.test(url) || /登录后(查看|继续|阅读)|请先登录/.test(bodyText)) {
    return "页面要求登录";
  }
  if (
    /captcha|recaptcha|hcaptcha|turnstile/.test(frames.join(" ")) ||
    /captcha|verify you are human|checking your browser|请完成验证|验证您是真人|安全验证/.test(`${title}\n${bodyText}`.toLocaleLowerCase())
  ) {
    return "页面要求完成验证码或安全检查";
  }
  if (
    /subscribe to continue|subscribe to read|订阅后(继续|阅读|查看)|购买后阅读|开通会员后阅读/.test(bodyText.toLocaleLowerCase())
  ) {
    return "内容受订阅或付费权限限制";
  }
  if (/just a moment|attention required|access denied/.test(title)) {
    return "网站阻止了自动访问";
  }
  return undefined;
}

async function preparePage(
  page: Page,
  item: CaptureItem,
  settings: CaptureSettings,
  hooks: CaptureHooks
): Promise<void> {
  await applySafePageRules(page, settings);
  let reason = await detectInterventionReason(page);
  if (!reason) return;

  item.interventionReason = reason;
  if (!settings.visible || !hooks.waitForIntervention) throw new InterventionRequiredError(reason);
  await hooks.waitForIntervention(item, reason);
  await checkpoint(hooks);
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
  await applySafePageRules(page, settings);
  reason = await detectInterventionReason(page);
  if (reason) throw new InterventionRequiredError(`${reason}；人工处理后页面仍未通过检查`);
  item.interventionReason = undefined;
}

async function waitForLazyContent(page: Page, settings: CaptureSettings, hooks: CaptureHooks) {
  const viewport = settings.viewportHeight;
  const maxScrolls = settings.maxScrolls || 300;
  const maxHeight = settings.maxHeight || 60_000;
  let previousHeight = 0;
  let stableRounds = 0;
  let scrolls = 0;
  let truncated = false;

  for (; scrolls < maxScrolls; scrolls += 1) {
    await checkpoint(hooks);
    const metrics = await page.evaluate(() => ({
      y: window.scrollY,
      height: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      )
    }));
    if (metrics.height >= maxHeight) {
      truncated = metrics.height > maxHeight;
      break;
    }
    const nextY = Math.min(metrics.y + Math.round(viewport * 0.78), metrics.height);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), nextY);
    await page.waitForTimeout(160);
    const current = await page.evaluate(() => ({
      y: window.scrollY,
      height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      viewport: window.innerHeight
    }));
    const atBottom = current.y + current.viewport >= current.height - 2;
    if (current.height === previousHeight && atBottom) stableRounds += 1;
    else stableRounds = 0;
    previousHeight = current.height;
    if (stableRounds >= 3) break;
  }

  if (scrolls >= maxScrolls) truncated = true;
  await page.waitForFunction(() => Array.from(document.images).every((image) => image.complete), undefined, { timeout: 5_000 }).catch(() => undefined);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(250);
  return { truncated, scrolls };
}

async function extractMetadata(page: Page): Promise<PageMetadata> {
  return page.evaluate(() => {
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content?.trim();
    const twitterTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content?.trim();
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content?.trim();
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.trim();
    const twitterDescription = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.content?.trim();
    return {
      title: ogTitle || twitterTitle || document.title || "未命名网页",
      description: ogDescription || description || twitterDescription || "",
      siteName: document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content?.trim() || "",
      publishedAt:
        document.querySelector<HTMLMetaElement>('meta[property="article:published_time"]')?.content?.trim() ||
        document.querySelector<HTMLMetaElement>('meta[name="date"]')?.content?.trim() ||
        document.querySelector<HTMLMetaElement>('meta[name="pubdate"]')?.content?.trim() ||
        ""
    };
  });
}

async function markFixedElements(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if ((style.position === "fixed" || style.position === "sticky") && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight) {
        element.setAttribute("data-clipper-fixed", "true");
      }
    }
  });
}

async function captureTiled(
  page: Page,
  outputFile: string,
  settings: CaptureSettings,
  captureHeight: number,
  hooks: CaptureHooks
): Promise<void> {
  await markFixedElements(page);
  const scale = settings.qualityScale || 1;
  const pixelWidth = Math.round(settings.viewportWidth * scale);
  const pixelCaptureHeight = Math.round(captureHeight * scale);
  const tiles: Array<{ input: Buffer; top: number; left: number }> = [];
  let targetY = 0;
  let previousY = -1;

  try {
    while (targetY < captureHeight) {
      await checkpoint(hooks);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), targetY);
      await page.waitForTimeout(120);
      const actualY = await page.evaluate(() => Math.round(window.scrollY));
      if (actualY <= previousY) break;
      previousY = actualY;
      const screenshot = await page.screenshot({ type: "png", fullPage: false, scale: "device", animations: "disabled", caret: "hide" });
      const tileHeight = Math.min(settings.viewportHeight, captureHeight - actualY);
      const pixelTileHeight = Math.round(tileHeight * scale);
      const cropped = tileHeight < settings.viewportHeight
        ? await sharp(screenshot).extract({ left: 0, top: 0, width: pixelWidth, height: pixelTileHeight }).png().toBuffer()
        : screenshot;
      tiles.push({ input: cropped, top: Math.round(actualY * scale), left: 0 });
      if (actualY === 0) {
        await page.addStyleTag({ content: '[data-clipper-fixed="true"]{visibility:hidden!important}' });
      }
      if (actualY + settings.viewportHeight >= captureHeight) break;
      targetY = actualY + settings.viewportHeight;
    }

    let image = sharp({
      create: { width: pixelWidth, height: pixelCaptureHeight, channels: 3, background: { r: 255, g: 255, b: 255 } },
      limitInputPixels: false
    }).composite(tiles);
    image = settings.format === "jpeg" ? image.jpeg({ quality: 88 }) : image.png();
    await image.toFile(outputFile);
  } finally {
    await page.evaluate(() => {
      document.querySelectorAll('[data-clipper-fixed="true"]').forEach((element) => element.removeAttribute("data-clipper-fixed"));
    }).catch(() => undefined);
  }
}

export async function captureItem(
  session: CaptureSession,
  item: CaptureItem,
  settings: CaptureSettings,
  hooks: CaptureHooks = {}
): Promise<Omit<CaptureItem, "id" | "url" | "status" | "attempts">> {
  const lease = await session.createPage();
  const page = lease.page;
  const abort = () => { void page.close().catch(() => undefined); };
  hooks.signal?.addEventListener("abort", abort, { once: true });

  try {
    await checkpoint(hooks);
    const timeoutMs = settings.timeoutSeconds * 1_000;
    page.setDefaultTimeout(Math.min(timeoutMs, 20_000));
    await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 10_000) }).catch(() => undefined);
    await preparePage(page, item, settings, hooks);
    const scrollResult = await waitForLazyContent(page, settings, hooks);
    const metadata = await extractMetadata(page);
    const dimensions = await page.evaluate(() => ({
      width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    }));
    const qualityScale = settings.qualityScale || 1;
    const configuredMaxHeight = settings.maxHeight || 60_000;
    const maxPhysicalPixels = 180_000_000;
    const maxHeightForMemory = Math.floor(maxPhysicalPixels / (settings.viewportWidth * qualityScale * qualityScale));
    const effectiveMaxHeight = Math.max(settings.viewportHeight, Math.min(configuredMaxHeight, maxHeightForMemory));
    const captureHeight = Math.min(dimensions.height, effectiveMaxHeight);
    const extension = settings.format === "jpeg" ? "jpg" : "png";
    const filenameBase = settings.filenameMode === "sequence"
      ? String(item.sequence || 1).padStart(4, "0")
      : `${safeFilename(metadata.title)}-${item.id.slice(-6)}`;
    const fileName = `${filenameBase}.${extension}`;
    const outputFile = path.join(settings.outputDirectory, fileName);
    await mkdir(settings.outputDirectory, { recursive: true });

    let captureMode: "full_page" | "tiled" = "full_page";
    const tiledThreshold = settings.tiledThreshold || 28_000;
    if (captureHeight * qualityScale > tiledThreshold || captureHeight < dimensions.height) {
      captureMode = "tiled";
      await captureTiled(page, outputFile, settings, captureHeight, hooks);
    } else {
      try {
        if (settings.format === "jpeg") {
          await page.screenshot({ path: outputFile, fullPage: true, type: "jpeg", quality: 88, scale: "device", animations: "disabled", caret: "hide" });
        } else {
          await page.screenshot({ path: outputFile, fullPage: true, type: "png", scale: "device", animations: "disabled", caret: "hide" });
        }
      } catch {
        captureMode = "tiled";
        await captureTiled(page, outputFile, settings, captureHeight, hooks);
      }
    }

    const file = await stat(outputFile);
    const outputMetadata = await sharp(outputFile).metadata();
    const truncated = scrollResult.truncated || dimensions.height > captureHeight;
    return {
      completedAt: new Date().toISOString(),
      title: metadata.title,
      description: metadata.description,
      siteName: metadata.siteName,
      publishedAt: metadata.publishedAt,
      finalUrl: page.url(),
      outputFile,
      width: Math.min(dimensions.width, settings.viewportWidth),
      height: dimensions.height,
      pixelWidth: outputMetadata.width,
      pixelHeight: outputMetadata.height,
      capturedHeight: captureHeight,
      bytes: file.size,
      captureMode,
      warning: truncated ? `页面达到截取上限，已保存前 ${captureHeight} CSS 像素（输出 ${Math.round(captureHeight * qualityScale)} 像素）` : undefined,
      interventionReason: undefined,
      error: undefined
    };
  } catch (error) {
    try {
      await mkdir(settings.outputDirectory, { recursive: true });
      const diagnosticFile = path.join(settings.outputDirectory, `失败现场-${item.id.slice(-6)}.png`);
      await page.screenshot({ path: diagnosticFile, type: "png", fullPage: false, scale: "device", animations: "disabled", caret: "hide" });
      item.diagnosticFile = diagnosticFile;
      item.finalUrl = page.url();
      item.title = (await page.title().catch(() => "")) || item.title;
    } catch {
      // Diagnostics are best-effort and must not hide the original error.
    }
    if (hooks.signal?.aborted) throw new CaptureCancelledError();
    throw error;
  } finally {
    hooks.signal?.removeEventListener("abort", abort);
    await lease.release();
  }
}
