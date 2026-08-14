import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { findEdge } from "../../src/capture.js";
import { startUiServer } from "../../src/ui-server.js";

test("web console creates and completes a clipping job", { timeout: 120_000 }, async () => {
  const fixtureHtml = await readFile(path.resolve("tests/fixtures/long-page.html"), "utf8");
  const fixtureServer = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(fixtureHtml);
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  const fixtureAddress = fixtureServer.address();
  assert.ok(fixtureAddress && typeof fixtureAddress === "object");

  const temporary = await mkdtemp(path.join(os.tmpdir(), "clipper-ui-"));
  const { server, url } = await startUiServer({
    port: 0,
    openBrowser: false,
    historyFilePath: path.join(temporary, "ui-jobs.json"),
    outputRoot: path.join(temporary, "captures")
  });
  const browser = await chromium.launch({ executablePath: await findEdge(), headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(url);
    await page.getByRole("heading", { name: "网页剪报控制台" }).waitFor();
    await page.locator("#urls").fill(`http://127.0.0.1:${fixtureAddress.port}/long-page.html`);
    await mkdir(path.join(temporary, "artifacts"), { recursive: true });
    await page.screenshot({ path: path.join(temporary, "artifacts", "ui-dashboard.png"), fullPage: true });
    await page.getByRole("button", { name: "开始完整截图" }).click();
    await page.locator(".status-chip.completed").waitFor({ timeout: 90_000 });
    await page.getByRole("link", { name: "查看长图" }).waitFor();
    await assert.doesNotReject(() => page.locator("#empty-state").waitFor({ state: "hidden" }));
    await page.screenshot({ path: path.join(temporary, "artifacts", "ui-completed.png"), fullPage: true });
    assert.match(await page.locator(".progress-row span").first().innerText(), /1 成功/);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fixtureServer.close();
    await rm(temporary, { recursive: true, force: true });
  }
});

test("web console rejects non-local and cross-site control requests", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "shiye-security-"));
  const { server, url } = await startUiServer({
    port: 0,
    openBrowser: false,
    historyFilePath: path.join(temporary, "ui-jobs.json"),
    outputRoot: path.join(temporary, "captures")
  });

  try {
    const localResponse = await fetch(`${url}/api/config`);
    assert.equal(localResponse.status, 200);
    assert.equal(localResponse.headers.get("x-frame-options"), "DENY");
    assert.equal(localResponse.headers.get("x-content-type-options"), "nosniff");
    assert.equal(localResponse.headers.get("cache-control"), "no-store");
    assert.match(localResponse.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);

    const crossSiteResponse = await fetch(`${url}/api/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.invalid",
        "sec-fetch-site": "cross-site"
      },
      body: JSON.stringify({ urlsText: "https://example.com" })
    });
    assert.equal(crossSiteResponse.status, 403);

    const hostileHostStatus = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(url, { headers: { host: "attacker.invalid" } }, (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode || 0));
      });
      request.once("error", reject);
      request.end();
    });
    assert.equal(hostileHostStatus, 403);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("web console can pause, resume and cancel a running job", { timeout: 120_000 }, async () => {
  const longSections = Array.from({ length: 80 }, (_, index) => `<section>第 ${index + 1} 屏</section>`).join("");
  const fixtureServer = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><title>任务控制测试</title><style>body{margin:0}section{height:800px}</style>${longSections}`);
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  const fixtureAddress = fixtureServer.address();
  assert.ok(fixtureAddress && typeof fixtureAddress === "object");

  const temporary = await mkdtemp(path.join(os.tmpdir(), "clipper-control-"));
  const { server, url } = await startUiServer({
    port: 0,
    openBrowser: false,
    historyFilePath: path.join(temporary, "ui-jobs.json"),
    outputRoot: path.join(temporary, "captures")
  });
  const browser = await chromium.launch({ executablePath: await findEdge(), headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(url);
    await page.locator("#urls").fill(`http://127.0.0.1:${fixtureAddress.port}/long.html`);
    await page.getByRole("button", { name: "开始完整截图" }).click();
    await page.locator(".status-chip.running").waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "暂停" }).click();
    await page.locator(".status-chip.paused").waitFor({ timeout: 15_000 });
    await page.getByRole("button", { name: "继续任务" }).click();
    await page.locator(".status-chip.running").waitFor({ timeout: 15_000 });
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "取消" }).click();
    await page.locator(".status-chip.cancelled").waitFor({ timeout: 20_000 });
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fixtureServer.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
