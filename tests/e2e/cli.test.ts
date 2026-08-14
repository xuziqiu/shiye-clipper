import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { findChrome } from "../../src/capture.js";

const execFileAsync = promisify(execFile);

test("CLI auto-selects Edge and keeps stdout machine-readable for AI agents", { timeout: 120_000 }, async () => {
  const fixtureServer = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<!doctype html><title>AI CLI contract</title><main style='height:1800px'>capture target</main>");
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  const address = fixtureServer.address();
  assert.ok(address && typeof address === "object");

  const temporary = await mkdtemp(path.join(os.tmpdir(), "shiye-cli-contract-"));
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      "--import",
      "tsx",
      path.resolve("src/cli.ts"),
      "capture",
      `http://127.0.0.1:${address.port}/`,
      "--output",
      path.join(temporary, "captures"),
      "--json"
    ], {
      cwd: path.resolve("."),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    });

    const result = JSON.parse(stdout.trim()) as {
      ok: boolean;
      status: string;
      total: number;
      completed: number;
      failed: number;
      browser: string;
      outputDirectory: string;
      manifestPath: string;
      items: Array<{ status: string; outputFile?: string }>;
    };
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.total, 1);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 0);
    assert.equal(result.browser, "edge");
    assert.equal(result.items[0]?.status, "completed");
    assert.ok(stderr.trim().length > 0, "progress should be written to stderr");
    await stat(result.manifestPath);
    await stat(result.items[0]?.outputFile || "");
  } finally {
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("CLI captures with Google Chrome when explicitly selected", { timeout: 120_000 }, async (context) => {
  try {
    await findChrome();
  } catch {
    context.skip("Google Chrome is not installed on this test machine");
    return;
  }

  const fixtureServer = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<!doctype html><title>Chrome capture</title><main style='height:1800px'>chrome target</main>");
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
  const address = fixtureServer.address();
  assert.ok(address && typeof address === "object");

  const temporary = await mkdtemp(path.join(os.tmpdir(), "shiye-cli-chrome-"));
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      "--import",
      "tsx",
      path.resolve("src/cli.ts"),
      "capture",
      `http://127.0.0.1:${address.port}/`,
      "--output",
      path.join(temporary, "captures"),
      "--browser",
      "chrome",
      "--json"
    ], {
      cwd: path.resolve("."),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    });

    const result = JSON.parse(stdout.trim()) as {
      ok: boolean;
      status: string;
      browser: string;
      manifestPath: string;
      items: Array<{ status: string; outputFile?: string }>;
    };
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.browser, "chrome");
    assert.equal(result.items[0]?.status, "completed");
    await stat(result.manifestPath);
    await stat(result.items[0]?.outputFile || "");
  } finally {
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
    await rm(temporary, { recursive: true, force: true });
  }
});
