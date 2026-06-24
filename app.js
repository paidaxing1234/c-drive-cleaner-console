const fallbackReport = {
  generatedAt: "2026-06-24",
  drive: {
    size: "398.71 GB",
    used: "354.14 GB",
    free: "44.58 GB",
    freePercent: 11.18,
  },
  topLevel: [
    { path: "C:\\Users", size: "219.13 GB", note: "最大来源，需细分整理" },
    { path: "C:\\Windows", size: "40.73 GB", note: "只清明确缓存" },
    { path: "C:\\Program Files", size: "32.53 GB", note: "程序目录，不自动删除" },
    { path: "C:\\hiberfil.sys", size: "31.94 GB", note: "关闭休眠可释放，需确认" },
    { path: "C:\\Program Files (x86)", size: "22.53 GB", note: "程序目录，不自动删除" },
  ],
  cleanupCandidates: [
    { name: "用户临时目录", path: "C:\\Users\\User\\AppData\\Local\\Temp", size: "22.09 GB", risk: "low" },
    { name: "pip 缓存", path: "C:\\Users\\User\\AppData\\Local\\pip\\Cache", size: "6.65 GB", risk: "low" },
    { name: ".cache", path: "C:\\Users\\User\\.cache", size: "3.57 GB", risk: "medium" },
    { name: "NuGet 包缓存", path: "C:\\Users\\User\\.nuget\\packages", size: "3.21 GB", risk: "medium" },
    { name: "Chrome 缓存", path: "C:\\Users\\User\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache", size: "474.91 MB", risk: "low" },
  ],
};

const riskText = {
  low: "低风险",
  medium: "需确认",
  manual: "手动",
};

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function noteForPath(path) {
  if (/\\Users$/i.test(path)) return "最大来源，需细分整理";
  if (/\\Windows$/i.test(path)) return "系统目录，只清明确缓存";
  if (/Program Files/i.test(path)) return "程序目录，不自动删除";
  if (/hiberfil\.sys$/i.test(path)) return "休眠文件，需确认";
  if (/pagefile\.sys$/i.test(path)) return "虚拟内存文件，不处理";
  return "按需确认";
}

function renderReport(report) {
  setText("freePercent", `${Number(report.drive.freePercent).toFixed(2)}%`);
  setText("driveSize", report.drive.size);
  setText("driveUsed", report.drive.used);
  setText("driveFree", report.drive.free);
  setText("reportTime", `${report.generatedAt || "当前"} 扫描`);

  const ring = document.querySelector(".meter-ring");
  if (ring) {
    const degrees = Math.max(0, Math.min(360, Number(report.drive.freePercent) * 3.6));
    ring.style.background = `conic-gradient(var(--accent) 0 ${degrees}deg, #e7edf1 ${degrees}deg 360deg)`;
  }

  const topRows = document.getElementById("topLevelRows");
  if (topRows) {
    topRows.innerHTML = "";
    report.topLevel.slice(0, 8).forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${item.path}</td><td>${item.size}</td><td>${item.note || noteForPath(item.path)}</td>`;
      topRows.appendChild(row);
    });
  }

  const candidateList = document.getElementById("candidateList");
  if (candidateList) {
    candidateList.innerHTML = "";
    report.cleanupCandidates.slice(0, 8).forEach((item) => {
      const article = document.createElement("article");
      article.className = `candidate ${item.risk || "medium"}`;
      article.innerHTML = `
        <div>
          <h3>${item.name}</h3>
          <p>${item.path}</p>
        </div>
        <strong>${item.size}</strong>
        <span>${riskText[item.risk] || "需确认"}</span>
      `;
      candidateList.appendChild(article);
    });
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function getCleanupOptions() {
  const olderThanHours = document.getElementById("olderThanHours");
  return {
    includeBrowserCache: document.getElementById("includeBrowserCache")?.checked ?? true,
    includePipCache: document.getElementById("includePipCache")?.checked ?? true,
    includeRecycleBin: document.getElementById("includeRecycleBin")?.checked ?? false,
    olderThanHours: Number(olderThanHours?.value || 24),
  };
}

function setLocalLog(message) {
  const log = document.getElementById("localLog");
  if (log) log.textContent = message;
}

function appendLocalLog(message) {
  const log = document.getElementById("localLog");
  if (!log) return;
  log.textContent = `${log.textContent}\n${message}`.trim();
  log.scrollTop = log.scrollHeight;
}

function setLocalBusy(isBusy) {
  document.querySelectorAll("[data-local-action]").forEach((button) => {
    button.disabled = isBusy || button.dataset.localReady !== "true";
  });
}

async function callLocalApi(route, body = {}) {
  const response = await fetch(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.stderr || `请求失败：${response.status}`);
  }
  return payload;
}

async function runLocalAction(action) {
  const status = document.getElementById("localTaskStatus");
  const options = getCleanupOptions();
  let route = "/api/analyze";
  let body = {};

  if (action === "dry-run") {
    route = "/api/dry-run";
    body = options;
  }

  if (action === "execute") {
    const confirmText = window.prompt("输入 YES 才会真实清理低风险缓存。");
    if (confirmText !== "YES") {
      showToast("已取消清理");
      return;
    }
    route = "/api/execute";
    body = { ...options, confirm: "YES" };
  }

  setLocalBusy(true);
  if (status) status.textContent = "正在执行";
  setLocalLog(`开始：${action}`);

  try {
    const result = await callLocalApi(route, body);
    appendLocalLog(result.stdout || "完成。");
    if (result.stderr) appendLocalLog(`\n错误输出：\n${result.stderr}`);
    if (result.report) renderReport(result.report);
    showToast("执行完成");
  } catch (error) {
    appendLocalLog(`失败：${error.message}`);
    showToast("执行失败");
  } finally {
    if (status) status.textContent = "本地服务已连接";
    setLocalBusy(false);
  }
}

async function detectLocalServer() {
  const status = document.getElementById("localStatus");
  const taskStatus = document.getElementById("localTaskStatus");
  const buttons = document.querySelectorAll("[data-local-action]");

  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error("not local");
    const data = await response.json();
    if (!data.local) throw new Error("not local");

    if (status) status.textContent = "本地服务已连接，可以直接点击按钮分析、预演或清理。";
    if (taskStatus) taskStatus.textContent = data.activeTask ? `正在执行：${data.activeTask}` : "本地服务已连接";
    buttons.forEach((button) => {
      button.dataset.localReady = "true";
      button.disabled = Boolean(data.activeTask);
    });
    setLocalLog("本地服务已连接。建议先点“点击分析”，再点“点击预演”，最后确认后清理。");
  } catch {
    if (status) status.innerHTML = "网页按钮需要先启动本地服务：双击 <code>start-local-console.cmd</code>，再打开 <code>http://127.0.0.1:4173/</code>。";
    if (taskStatus) taskStatus.textContent = "等待本地服务";
    buttons.forEach((button) => {
      button.dataset.localReady = "false";
      button.disabled = true;
    });
  }
}

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const command = button.getAttribute("data-copy");
    try {
      await navigator.clipboard.writeText(command);
      showToast("命令已复制");
    } catch {
      showToast(command);
    }
  });
});

document.querySelectorAll("[data-local-action]").forEach((button) => {
  button.addEventListener("click", () => runLocalAction(button.dataset.localAction));
});

fetch("./reports/cdrive-report.json")
  .then((response) => {
    if (!response.ok) throw new Error("report not found");
    return response.json();
  })
  .then(renderReport)
  .catch(() => renderReport(fallbackReport));

detectLocalServer();
