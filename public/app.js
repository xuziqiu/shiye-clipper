const $ = (selector) => document.querySelector(selector);
const form = $("#capture-form");
const urlsInput = $("#urls");
const outputRoot = $("#output-root");
const submitButton = $("#submit-button");
const formMessage = $("#form-message");
const emptyState = $("#empty-state");
const jobList = $("#job-list");
const fileInput = $("#file-input");
const toast = $("#toast");
let refreshTimer;

const statusText = {
  queued: "排队等待",
  running: "正在截图",
  completed: "全部完成",
  completed_with_errors: "部分失败",
  interrupted: "任务中断",
  waiting_for_user: "等待人工处理",
  paused: "已暂停",
  cancelled: "已取消"
};

const itemStatusText = { queued: "等待处理", running: "正在截图", waiting_for_user: "等待人工处理", paused: "已暂停", completed: "截图完成", failed: "截图失败", cancelled: "已取消" };

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2300);
}

function countUrls() {
  let count = 0;
  try {
    const value = urlsInput.value.trim();
    if (value.startsWith("[")) count = JSON.parse(value).filter((item) => typeof item === "string").length;
    else count = (value.match(/https?:\/\/[^\s"'<>]+/gi) || []).length;
  } catch {
    count = (urlsInput.value.match(/https?:\/\/[^\s"'<>]+/gi) || []).length;
  }
  $("#url-count").textContent = `${count} 个网址`;
  return count;
}

function renderJobs(jobs) {
  emptyState.hidden = jobs.length > 0;
  jobList.innerHTML = jobs.map((job) => {
    const done = job.progress.completed + job.progress.failed + (job.progress.cancelled || 0);
    const percent = job.progress.total ? Math.round(done / job.progress.total * 100) : 0;
    const shownItems = job.items.slice(0, 30);
    return `
      <article class="job-card panel" data-job-id="${escapeHtml(job.jobId)}">
        <div class="job-head">
          <div>
            <h3 class="job-id">${escapeHtml(job.jobId)}</h3>
            <div class="job-meta"><span>${new Date(job.createdAt).toLocaleString("zh-CN")}</span><span>${job.items.length} 个网页</span><span>${escapeHtml(job.settings.format.toUpperCase())} · ${job.settings.qualityScale || 1}×</span><span>${job.settings.filenameMode === "sequence" ? "序号命名" : "标题命名"}</span><span>并发 ${job.settings.concurrency}</span></div>
          </div>
          <span class="status-chip ${job.status}">${statusText[job.status] || job.status}</span>
        </div>
        <div class="progress-row"><div class="progress-track"><div class="progress-bar" style="width:${percent}%"></div></div><span>${job.progress.completed} 成功 · ${job.progress.failed} 失败${job.progress.cancelled ? ` · ${job.progress.cancelled} 取消` : ""} · ${percent}%</span></div>
        <div class="items">
          ${shownItems.map((item) => `
            <div class="clip-item" data-status="${item.status}">
              <i class="clip-dot"></i>
              <div class="clip-main">
                <div class="clip-title">${escapeHtml(item.title || itemStatusText[item.status] || item.url)}</div>
                <div class="clip-url">${escapeHtml(item.url)}</div>
                ${item.error ? `<div class="clip-error">${escapeHtml(item.error)}</div>` : ""}
                ${item.interventionReason && item.status === "waiting_for_user" ? `<div class="clip-error">请在已经打开的 Edge 中完成处理，然后点击继续。</div>` : ""}
                ${item.warning ? `<div class="clip-warning">${escapeHtml(item.warning)}</div>` : ""}
              </div>
              <div class="clip-actions">
                ${item.imageUrl ? `<a class="mini-button" href="${item.imageUrl}" target="_blank">查看长图</a>` : ""}
                ${item.diagnosticUrl ? `<a class="mini-button" href="${item.diagnosticUrl}" target="_blank">查看失败现场</a>` : ""}
                ${item.status === "waiting_for_user" ? `<button class="mini-button continue-item" data-item-id="${item.id}" type="button">我已处理，继续</button>` : ""}
              </div>
            </div>`).join("")}
          ${job.items.length > shownItems.length ? `<div class="more-items">还有 ${job.items.length - shownItems.length} 项未展开</div>` : ""}
        </div>
        <div class="job-actions">
          <button class="mini-button open-folder" type="button">打开文件夹</button>
          ${job.status === "running" ? `<button class="mini-button pause-job" type="button">暂停</button><button class="mini-button cancel-job" type="button">取消</button>` : ""}
          ${job.status === "paused" ? `<button class="mini-button resume-job" type="button">继续任务</button><button class="mini-button cancel-job" type="button">取消</button>` : ""}
          ${job.status === "waiting_for_user" ? `<button class="mini-button cancel-job" type="button">取消</button>` : ""}
          ${job.progress.failed > 0 && !["running", "queued", "waiting_for_user", "paused"].includes(job.status) ? `<button class="mini-button retry-job" type="button">后台重试</button>` : ""}
          ${job.items.some((item) => item.error?.includes("需要人工处理")) && !["running", "queued", "waiting_for_user", "paused"].includes(job.status) ? `<button class="mini-button assisted-retry" type="button">打开 Edge 处理并重试</button>` : ""}
        </div>
      </article>`;
  }).join("");

  clearTimeout(refreshTimer);
  if (jobs.some((job) => job.status === "running" || job.status === "queued" || job.status === "waiting_for_user")) {
    refreshTimer = setTimeout(loadJobs, 1200);
  }
}

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}

async function loadJobs() {
  try {
    const data = await api("/api/jobs");
    renderJobs(data.jobs);
  } catch (error) {
    showToast(error.message);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  if (!countUrls()) {
    formMessage.textContent = "请至少输入一个有效的 http/https 网址";
    return;
  }
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "正在创建任务…";
  try {
    await api("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urlsText: urlsInput.value,
        outputRoot: outputRoot.value,
        concurrency: Number($("#concurrency").value),
        retries: Number($("#retries").value),
        timeoutSeconds: Number($("#timeout").value),
        format: $("#format").value,
        qualityScale: Number($("#quality-scale").value),
        filenameMode: $("#filename-mode").value,
        visible: $("#visible").checked,
        useProfile: $("#use-profile").checked,
        cookiePreference: $("#cookie-preference").value,
        maxHeight: Number($("#max-height").value),
        expandArticles: true,
        maxScrolls: 300
      })
    });
    urlsInput.value = "";
    countUrls();
    showToast("任务已加入队列");
    document.querySelector("#jobs").scrollIntoView({ behavior: "smooth" });
    await loadJobs();
  } catch (error) {
    formMessage.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "开始完整截图";
  }
});

urlsInput.addEventListener("input", countUrls);
$("#import-button").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  urlsInput.value = await file.text();
  countUrls();
  showToast(`已导入 ${file.name}`);
  fileInput.value = "";
});

$("#browse-button").addEventListener("click", async () => {
  try {
    const data = await api("/api/pick-folder", { method: "POST" });
    if (data.selectedPath) outputRoot.value = data.selectedPath;
  } catch (error) {
    showToast(error.message);
  }
});

jobList.addEventListener("click", async (event) => {
  const card = event.target.closest(".job-card");
  if (!card) return;
  try {
    const continueButton = event.target.closest(".continue-item");
    if (continueButton) {
      await api(`/api/jobs/${card.dataset.jobId}/items/${continueButton.dataset.itemId}/continue`, { method: "POST" });
      showToast("正在继续截图");
      await loadJobs();
    } else if (event.target.closest(".open-folder")) {
      await api(`/api/jobs/${card.dataset.jobId}/open-folder`, { method: "POST" });
    } else if (event.target.closest(".retry-job")) {
      await api(`/api/jobs/${card.dataset.jobId}/retry`, { method: "POST" });
      showToast("失败项已重新加入队列");
      await loadJobs();
    } else if (event.target.closest(".assisted-retry")) {
      await api(`/api/jobs/${card.dataset.jobId}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visible: true }) });
      showToast("已打开可见 Edge；请按页面提示处理");
      await loadJobs();
    } else if (event.target.closest(".pause-job")) {
      await api(`/api/jobs/${card.dataset.jobId}/pause`, { method: "POST" });
      showToast("任务将在当前安全节点暂停");
      await loadJobs();
    } else if (event.target.closest(".resume-job")) {
      await api(`/api/jobs/${card.dataset.jobId}/resume`, { method: "POST" });
      showToast("任务已继续");
      await loadJobs();
    } else if (event.target.closest(".cancel-job")) {
      if (confirm("确定取消这个任务？已完成的截图会保留。")) {
        await api(`/api/jobs/${card.dataset.jobId}/cancel`, { method: "POST" });
        showToast("任务已取消");
        await loadJobs();
      }
    }
  } catch (error) {
    showToast(error.message);
  }
});

$("#refresh-button").addEventListener("click", loadJobs);
$("#today").textContent = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());

const config = await api("/api/config");
outputRoot.value = config.defaultOutputRoot;
await loadJobs();
