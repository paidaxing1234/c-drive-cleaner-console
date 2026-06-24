const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body, null, 2), "application/json; charset=utf-8");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 128) {
        request.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function addFlag(args, enabled, flag) {
  if (enabled) args.push(flag);
}

let activeTask = null;

async function runTask(name, action) {
  if (activeTask) {
    const error = new Error(`Another task is running: ${activeTask}`);
    error.status = 409;
    throw error;
  }

  activeTask = name;
  try {
    return await action();
  } finally {
    activeTask = null;
  }
}

function runPowerShell(scriptName, scriptArgs = []) {
  const scriptPath = path.join(root, "scripts", scriptName);
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...scriptArgs];

  return new Promise((resolve) => {
    const child = spawn("powershell.exe", args, {
      cwd: root,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function refreshReport() {
  const outputPath = path.join(root, "reports", "cdrive-report.local.json");
  const result = await runPowerShell("analyze-cdrive.ps1", ["-OutputPath", outputPath]);
  let report = null;

  try {
    report = JSON.parse(fs.readFileSync(outputPath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    report = null;
  }

  return { ...result, report };
}

function cleanArgsFromOptions(options, execute = false) {
  const args = ["-OlderThanHours", String(Number(options.olderThanHours || 24))];
  addFlag(args, execute, "-Execute");
  addFlag(args, options.includeBrowserCache, "-IncludeBrowserCache");
  addFlag(args, options.includePipCache, "-IncludePipCache");
  addFlag(args, options.includeRecycleBin, "-IncludeRecycleBin");
  return args;
}

async function handleApi(request, response, requestPath) {
  if (requestPath === "/api/status" && request.method === "GET") {
    sendJson(response, 200, { local: true, activeTask, port });
    return true;
  }

  if (!requestPath.startsWith("/api/")) {
    return false;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return true;
  }

  try {
    const body = await readJson(request);

    if (requestPath === "/api/analyze") {
      const result = await runTask("analyze", refreshReport);
      sendJson(response, result.code === 0 ? 200 : 500, result);
      return true;
    }

    if (requestPath === "/api/dry-run") {
      const result = await runTask("dry-run", () => runPowerShell("clean-cdrive.ps1", cleanArgsFromOptions(body)));
      sendJson(response, result.code === 0 ? 200 : 500, result);
      return true;
    }

    if (requestPath === "/api/execute") {
      if (body.confirm !== "YES") {
        sendJson(response, 400, { error: "Type YES before executing cleanup." });
        return true;
      }

      const result = await runTask("execute", async () => {
        const clean = await runPowerShell("clean-cdrive.ps1", cleanArgsFromOptions(body, true));
        const report = await refreshReport();
        return {
          code: clean.code || report.code,
          stdout: `${clean.stdout}\n${report.stdout}`,
          stderr: `${clean.stderr}\n${report.stderr}`,
          report: report.report,
        };
      });
      sendJson(response, result.code === 0 ? 200 : 500, result);
      return true;
    }

    sendJson(response, 404, { error: "Unknown API route" });
    return true;
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || String(error) });
    return true;
  }
}

const server = http.createServer(async (request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
  if (await handleApi(request, response, requestPath)) {
    return;
  }

  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  let target = path.resolve(root, relative);

  if (!target.startsWith(root)) {
    send(response, 403, "Forbidden");
    return;
  }

  if (relative === "reports/cdrive-report.json") {
    const localReport = path.join(root, "reports", "cdrive-report.local.json");
    if (fs.existsSync(localReport)) {
      target = localReport;
    }
  }

  fs.readFile(target, (error, data) => {
    if (error) {
      send(response, 404, "Not found");
      return;
    }

    send(response, 200, data, types[path.extname(target).toLowerCase()] || "application/octet-stream");
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`C drive cleaner page: http://127.0.0.1:${port}/`);
});
