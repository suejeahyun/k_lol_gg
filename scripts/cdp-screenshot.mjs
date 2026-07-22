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
const interaction = process.argv[10] ?? "";
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

const browserDiagnostics = [];
const networkResources = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.method === "Runtime.consoleAPICalled") {
    browserDiagnostics.push({
      type: `console.${message.params.type}`,
      text: message.params.args
        .map((arg) => arg.value ?? arg.description ?? arg.type)
        .join(" "),
    });
  }
  if (message.method === "Runtime.exceptionThrown") {
    browserDiagnostics.push({
      type: "exception",
      text: message.params.exceptionDetails.exception?.description
        ?? message.params.exceptionDetails.text,
    });
  }
  if (message.method === "Network.loadingFailed") {
    browserDiagnostics.push({
      type: "network-failure",
      text: `${message.params.errorText}: ${message.params.blockedReason ?? message.params.requestId}`,
    });
  }
  if (
    message.method === "Network.responseReceived"
  ) {
    const { requestId, response, type } = message.params;
    networkResources.set(requestId, {
      url: response.url,
      status: response.status,
      type,
      mimeType: response.mimeType,
      encodedBytes: 0,
      cache: response.fromServiceWorker
        ? "service-worker"
        : response.fromDiskCache
          ? "disk"
          : "network",
    });

    if (response.status >= 400) {
      browserDiagnostics.push({
        type: "http-error",
        text: `${response.status} ${response.url}`,
      });
    }
  }
  if (message.method === "Network.loadingFinished") {
    const resource = networkResources.get(message.params.requestId);
    if (resource) resource.encodedBytes = message.params.encodedDataLength;
  }
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
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    globalThis.__klolVitals = {
      cls: 0,
      lcp: 0,
      longTaskCount: 0,
      longTaskMs: 0,
    };

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) globalThis.__klolVitals.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    } catch {}

    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const latest = entries[entries.length - 1];
        if (latest) globalThis.__klolVitals.lcp = latest.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}

    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          globalThis.__klolVitals.longTaskCount += 1;
          globalThis.__klolVitals.longTaskMs += entry.duration;
        }
      }).observe({ type: "longtask", buffered: true });
    } catch {}
  })()`,
});

if (shouldAdminLogin) {
  const parseEnvFile = async (file) => {
    try {
      const envText = await readFile(file, "utf8");
      return Object.fromEntries(
        envText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#") && line.includes("="))
          .map((line) => {
            const index = line.indexOf("=");
            const key = line.slice(0, index).trim();
            const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
            return [key, value];
          }),
      );
    } catch {
      return {};
    }
  };
  const env = {
    ...(await parseEnvFile(".env")),
    ...(await parseEnvFile(".env.local")),
    ...process.env,
  };
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

await wait(interaction ? 5000 : 1200);

let interactionResult = null;
if (interaction === "coin-toss") {
  const clickResult = await send("Runtime.evaluate", {
    expression: `(() => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((candidate) => candidate.textContent?.trim() === "코인토스 실행");
      button?.click();
      return Boolean(button);
    })()`,
    returnByValue: true,
  });
  await wait(4500);
  const result = await send("Runtime.evaluate", {
    expression: `({
      text: document.body.innerText,
      clicked: ${clickResult.result.value},
      reactKeys: Object.keys(Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "코인토스 실행") ?? {})
        .filter((key) => key.startsWith("__react")),
      copyEnabled: !Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "결과 복사")?.disabled
    })`,
    returnByValue: true,
  });
  interactionResult = result.result.value;
}

if (interaction === "random-team") {
  await send("Runtime.evaluate", {
    expression: `(() => {
      const textarea = document.querySelector("textarea");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      setter?.call(textarea, "가나\\n다라\\n마바\\n사아\\n자차\\n카타\\n파하\\n거너\\n더러\\n머버");
      textarea?.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromPaste",
        data: null,
      }));
    })()`,
  });
  await wait(800);
  const result = await send("Runtime.evaluate", {
    expression: `({
      text: document.body.innerText,
      textareaValue: document.querySelector("textarea")?.value,
      reactKeys: Object.keys(document.querySelector("textarea") ?? {})
        .filter((key) => key.startsWith("__react")),
      copyEnabled: !Array.from(document.querySelectorAll("button"))
        .find((button) => button.textContent?.trim() === "결과 복사")?.disabled
    })`,
    returnByValue: true,
  });
  interactionResult = result.result.value;
}

if (interaction === "tab-focus") {
  await send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await wait(250);
  const result = await send("Runtime.evaluate", {
    expression: `(() => {
      const active = document.activeElement;
      const style = active ? getComputedStyle(active) : null;
      return {
        tag: active?.tagName ?? null,
        text: active?.textContent?.trim().slice(0, 120) ?? null,
        ariaLabel: active?.getAttribute?.("aria-label") ?? null,
        href: active?.getAttribute?.("href") ?? null,
        outline: style?.outline ?? null,
        outlineOffset: style?.outlineOffset ?? null
      };
    })()`,
    returnByValue: true,
  });
  interactionResult = result.result.value;
}

if (interaction === "touch-targets") {
  const result = await send("Runtime.evaluate", {
    expression: `(() => {
      const selector = [
        "a[href]",
        "button",
        "input:not([type=hidden])",
        "select",
        "textarea",
        "summary",
        "[role=button]",
        "[role=link]",
        "[tabindex]:not([tabindex='-1'])"
      ].join(",");
      const elements = Array.from(new Set(document.querySelectorAll(selector)));
      const visible = elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden";
      });
      const describe = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.getAttribute("aria-label") || element.textContent || element.getAttribute("title") || "")
            .trim().replace(/\\s+/g, " ").slice(0, 100),
          href: element.getAttribute("href"),
          className: typeof element.className === "string" ? element.className.slice(0, 160) : "",
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10
        };
      };
      return {
        total: visible.length,
        below24: visible.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 24 || rect.height < 24;
        }).map(describe),
        below44: visible.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        }).map(describe)
      };
    })()`,
    returnByValue: true,
  });
  interactionResult = result.result.value;
}

if (interaction === "layout-debug") {
  const result = await send("Runtime.evaluate", {
    expression: `(() => {
      const describe = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          selector,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          display: style.display,
          position: style.position,
          width: style.width,
          maxWidth: style.maxWidth,
          marginLeft: style.marginLeft,
          paddingLeft: style.paddingLeft,
          transform: style.transform
        };
      };
      return [".app-shell", ".app-body", ".app-sidebar", ".app-content", ".home-page"]
        .map(describe);
    })()`,
    returnByValue: true,
  });
  interactionResult = result.result.value;
}

if (interaction === "pwa") {
  const manifest = await send("Page.getAppManifest");
  const serviceWorker = await send("Runtime.evaluate", {
    expression: `(async () => {
      if (!("serviceWorker" in navigator)) {
        return { supported: false, registered: false, controller: false };
      }

      const registration = await navigator.serviceWorker.getRegistration();
      return {
        supported: true,
        registered: Boolean(registration),
        controller: Boolean(navigator.serviceWorker.controller),
        scope: registration?.scope ?? null,
        activeState: registration?.active?.state ?? null,
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  interactionResult = {
    manifestUrl: manifest.url,
    manifestErrors: manifest.errors ?? [],
    manifestData: manifest.data ? JSON.parse(manifest.data) : null,
    serviceWorker: serviceWorker.result.value,
  };
}

if (interaction.startsWith("axe-theme-")) {
  const themeTitle = interaction === "axe-theme-neon"
    ? "네온 사이버 강조 테마"
    : interaction === "axe-theme-gold"
      ? "블랙 골드 프리미엄 테마"
      : "다크모던 기본 테마";
  await send("Runtime.evaluate", {
    expression: `Array.from(document.querySelectorAll("button"))
      .find((button) => button.title === ${JSON.stringify(themeTitle)})?.click()`,
  });
  await wait(1500);
}

if (interaction === "axe" || interaction.startsWith("axe-theme-")) {
  const axeSource = await readFile("node_modules/axe-core/axe.min.js", "utf8");
  await send("Runtime.evaluate", { expression: axeSource });
  const result = await send("Runtime.evaluate", {
    expression: `axe.run(document, {
      resultTypes: ["violations", "incomplete", "passes"]
    }).then((audit) => ({
      violationCount: audit.violations.length,
      incompleteCount: audit.incomplete.length,
      passCount: audit.passes.length,
      violations: audit.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.slice(0, 10).map((node) => ({
          target: node.target,
          failureSummary: node.failureSummary,
          html: node.html.slice(0, 500)
        }))
      })),
      incomplete: audit.incomplete.map((item) => ({
        id: item.id,
        impact: item.impact,
        help: item.help,
        nodes: item.nodes.slice(0, 5).map((node) => ({
          target: node.target,
          failureSummary: node.failureSummary
        }))
      }))
    }))`,
    awaitPromise: true,
    returnByValue: true,
  });
  interactionResult = result.result.value;
}

const metrics = await send("Runtime.evaluate", {
  expression: `(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(
      performance.getEntriesByType("paint").map((entry) => [entry.name, entry.startTime]),
    );
    const resources = performance.getEntriesByType("resource");
    const vitals = globalThis.__klolVitals ?? {};

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      performance: {
        ttfbMs: navigation?.responseStart ?? null,
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
        loadMs: navigation?.loadEventEnd ?? null,
        fcpMs: paints["first-contentful-paint"] ?? null,
        lcpMs: vitals.lcp ?? null,
        cls: vitals.cls ?? null,
        longTaskCount: vitals.longTaskCount ?? null,
        longTaskMs: vitals.longTaskMs ?? null,
        resourceCount: resources.length,
        resourceTransferBytes: resources.reduce(
          (total, resource) => total + (resource.transferSize || 0),
          0,
        ),
      },
    };
  })()`,
  returnByValue: true,
});

const largestResources = [...networkResources.values()]
  .sort((left, right) => right.encodedBytes - left.encodedBytes)
  .slice(0, 20);
const transferredBytes = [...networkResources.values()]
  .reduce((total, resource) => total + resource.encodedBytes, 0);

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
  interaction,
  interactionResult,
  metrics: metrics.result.value,
  networkSummary: {
    requestCount: networkResources.size,
    transferredBytes,
    largestResources,
  },
  browserDiagnostics,
}, null, 2));

socket.close();
chrome.kill();
