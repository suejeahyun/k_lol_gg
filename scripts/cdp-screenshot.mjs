import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = process.argv[2] ?? "http://localhost:3001/";
const output = process.argv[3] ?? "qa-cdp-screenshot.png";
const width = Number(process.argv[4] ?? 390);
const height = Number(process.argv[5] ?? 844);
const isMobile = process.argv[6] === "mobile";
const port = Number(process.argv[7] ?? 9224);
const shouldAdminLogin = process.argv[8] === "admin";
const captureMode = process.argv[9] ?? "viewport";
const isFullPage = captureMode === "full" || captureMode === "fullpage";
const userDataDir = await mkdtemp(join(tmpdir(), "klol-cdp-shot-"));
const targetUrl = new URL(url);
const targetOrigin = targetUrl.origin;

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], { stdio: "ignore" });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(endpoint) {
  const res = await fetch(`http://127.0.0.1:${port}${endpoint}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

let pages = [];
for (let i = 0; i < 60; i += 1) {
  try {
    pages = await getJson("/json");
    if (pages.length > 0) break;
  } catch {
    await wait(200);
  }
}

const page = pages.find((item) => item.type === "page") ?? pages[0];
if (!page?.webSocketDebuggerUrl) {
  chrome.kill();
  throw new Error("No debuggable page found");
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 1;
function send(method, params = {}) {
  const id = nextId;
  nextId += 1;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== id) return;
      socket.removeEventListener("message", onMessage);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    socket.addEventListener("message", onMessage);
  });
}

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");

if (shouldAdminLogin) {
  const envText = await readFile(".env", "utf8");
  const env = Object.fromEntries(
    envText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  const loginRes = await fetch(`${targetOrigin}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: env.SUPER_ADMIN_ID,
      password: env.SUPER_ADMIN_PASSWORD,
    }),
  });

  if (!loginRes.ok) {
    throw new Error(`Admin login failed: ${loginRes.status}`);
  }

  const cookieHeader = loginRes.headers.get("set-cookie") ?? "";
  const tokenMatch = cookieHeader.match(/user_token=([^;]+)/);
  if (!tokenMatch) {
    throw new Error("Admin login cookie missing");
  }

  await send("Network.setCookie", {
    name: "user_token",
    value: tokenMatch[1],
    domain: targetUrl.hostname,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });
}

await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: isMobile,
});
await send("Page.navigate", { url });

for (let i = 0; i < 80; i += 1) {
  const result = await send("Runtime.evaluate", {
    expression: "document.readyState",
    returnByValue: true,
  });
  if (result.result.value === "complete") break;
  await wait(250);
}

await wait(1200);

const metrics = await send("Runtime.evaluate", {
  expression: `({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    bodyScrollWidth: document.body.scrollWidth,
    docScrollWidth: document.documentElement.scrollWidth
  })`,
  returnByValue: true,
});

const screenshotOptions = {
  format: "png",
  fromSurface: true,
};

if (isFullPage) {
  const layoutMetrics = await send("Page.getLayoutMetrics");
  const contentSize = layoutMetrics.cssContentSize;
  screenshotOptions.captureBeyondViewport = true;
  screenshotOptions.clip = {
    x: 0,
    y: 0,
    width: Math.ceil(contentSize.width),
    height: Math.ceil(contentSize.height),
    scale: 1,
  };
}

const screenshot = await send("Page.captureScreenshot", screenshotOptions);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.from(screenshot.data, "base64"));

console.log(JSON.stringify({
  output,
  width,
  height,
  isMobile,
  captureMode,
  metrics: metrics.result.value,
}, null, 2));

socket.close();
chrome.kill();
