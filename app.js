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

fetch("./reports/cdrive-report.json")
  .then((response) => {
    if (!response.ok) throw new Error("report not found");
    return response.json();
  })
  .then(renderReport)
  .catch(() => renderReport(fallbackReport));
