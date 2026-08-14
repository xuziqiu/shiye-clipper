import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createManifest, runManifest } from "../../src/runner.js";

test("renders ultra-clear tiled screenshots and keeps numeric filenames", { timeout: 90_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><title>超清截图测试</title>
      <style>html,body{margin:0;width:100%}main{height:1800px;background:linear-gradient(#fff,#ccc);font:32px sans-serif}</style>
      <main>双倍像素输出</main>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "clipper-ultra-"));

  try {
    const manifest = createManifest([`http://127.0.0.1:${address.port}/`], {
      outputDirectory,
      concurrency: 1,
      retries: 0,
      timeoutSeconds: 30,
      format: "png",
      visible: false,
      viewportWidth: 800,
      viewportHeight: 600,
      qualityScale: 2,
      filenameMode: "sequence",
      tiledThreshold: 1_000,
      maxHeight: 10_000
    });
    await runManifest(manifest);
    assert.equal(manifest.status, "completed", manifest.items[0].error);
    assert.equal(manifest.items[0].sequence, 1);
    assert.equal(path.basename(manifest.items[0].outputFile || ""), "0001.png");
    assert.equal(manifest.items[0].captureMode, "tiled");
    const image = await sharp(manifest.items[0].outputFile!).metadata();
    assert.equal(image.width, 1600);
    assert.equal(image.height, 3600);
    assert.equal(manifest.items[0].pixelWidth, 1600);
    assert.equal(manifest.items[0].pixelHeight, 3600);
  } finally {
    server.close();
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("captures a long page after scroll-triggered lazy content", { timeout: 90_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><title>本地长页面测试</title>
      <style>body{margin:0}section{height:1100px;padding:30px;background:#eee}section:nth-child(even){background:#ccc}</style>
      <section>第一屏</section><section>第二屏</section><section>第三屏</section>
      <script>
        let added=false;
        addEventListener('scroll',()=>{
          if(!added && scrollY + innerHeight > document.body.scrollHeight - 100){
            added=true; const section=document.createElement('section'); section.textContent='滚动后加载'; document.body.append(section);
          }
        });
      </script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "clipper-e2e-"));

  try {
    const manifest = createManifest([`http://127.0.0.1:${address.port}/`], {
      outputDirectory,
      concurrency: 1,
      retries: 0,
      timeoutSeconds: 30,
      format: "png",
      visible: false,
      viewportWidth: 1000,
      viewportHeight: 700,
      tiledThreshold: 2_000,
      maxHeight: 20_000,
      maxScrolls: 100,
      cookiePreference: "reject",
      expandArticles: true
    });
    await runManifest(manifest);
    assert.equal(manifest.status, "completed", manifest.items[0].error);
    assert.equal(manifest.items[0].status, "completed");
    assert.ok((manifest.items[0].height || 0) > 4_000);
    assert.equal(manifest.items[0].captureMode, "tiled");
    assert.ok(manifest.items[0].outputFile);
    assert.ok((await stat(manifest.items[0].outputFile!)).size > 1_000);
  } finally {
    server.close();
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("applies safe cookie and article expansion rules", { timeout: 90_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><title>安全规则测试</title>
      <style>
        body{margin:0}.hero{height:1000px}.cookie{position:fixed;inset:0;background:#fff;z-index:10}.expanded{height:2600px;background:#ddd}
      </style>
      <div class="cookie"><button id="reject">拒绝全部</button></div>
      <main><div class="hero">新闻开头</div><button id="expand">展开全文</button><div id="rest" hidden>完整正文</div></main>
      <script>
        reject.onclick=()=>document.querySelector('.cookie').remove();
        expand.onclick=()=>{rest.hidden=false;rest.className='expanded';expand.remove()};
      </script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "clipper-rules-"));
  try {
    const manifest = createManifest([`http://127.0.0.1:${address.port}/`], {
      outputDirectory,
      concurrency: 1,
      retries: 0,
      timeoutSeconds: 30,
      format: "png",
      visible: false,
      viewportWidth: 1000,
      viewportHeight: 700,
      cookiePreference: "reject",
      expandArticles: true,
      maxHeight: 20_000,
      maxScrolls: 100
    });
    await runManifest(manifest);
    assert.equal(manifest.status, "completed", manifest.items[0].error);
    assert.ok((manifest.items[0].height || 0) > 3_000);
  } finally {
    server.close();
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("reports security challenges as requiring human intervention", { timeout: 90_000 }, async () => {
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end("<!doctype html><title>Just a moment</title><h1>请完成验证</h1><p>验证您是真人</p>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "clipper-challenge-"));
  try {
    const manifest = createManifest([`http://127.0.0.1:${address.port}/`], {
      outputDirectory,
      concurrency: 1,
      retries: 0,
      timeoutSeconds: 30,
      format: "png",
      visible: false,
      viewportWidth: 1000,
      viewportHeight: 700
    });
    await runManifest(manifest);
    assert.equal(manifest.status, "completed_with_errors");
    assert.match(manifest.items[0].error || "", /需要人工处理/);
    assert.ok(manifest.items[0].diagnosticFile);
    assert.ok((await stat(manifest.items[0].diagnosticFile!)).size > 500);
  } finally {
    server.close();
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("dedicated browser profile preserves login cookies across jobs", { timeout: 120_000 }, async () => {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    if (request.url === "/set-session") {
      response.setHeader("set-cookie", "clipper_auth=ready; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax");
      response.end("<!doctype html><title>登录状态已保存</title><main>会话创建成功</main>");
      return;
    }
    if (request.headers.cookie?.includes("clipper_auth=ready")) {
      response.end("<!doctype html><title>需要登录的新闻</title><main>已经通过专用档案登录</main>");
    } else {
      response.end("<!doctype html><title>登录</title><main>请先登录后阅读</main>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "clipper-profile-"));
  const settings = {
    outputDirectory: path.join(temporary, "first"),
    concurrency: 1,
    retries: 0,
    timeoutSeconds: 30,
    format: "png" as const,
    visible: false,
    viewportWidth: 1000,
    viewportHeight: 700,
    profileDirectory: path.join(temporary, "profile")
  };
  try {
    const first = createManifest([`http://127.0.0.1:${address.port}/set-session`], settings);
    await runManifest(first);
    assert.equal(first.status, "completed", first.items[0].error);
    const second = createManifest([`http://127.0.0.1:${address.port}/private`], {
      ...settings,
      outputDirectory: path.join(temporary, "second")
    });
    await runManifest(second);
    assert.equal(second.status, "completed", second.items[0].error);
    assert.equal(second.items[0].title, "需要登录的新闻");
  } finally {
    server.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
