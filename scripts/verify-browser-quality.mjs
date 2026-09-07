import { spawn } from "node:child_process";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const QUALITY_BUDGET = Object.freeze({
  ttfbMs: 800,
  lcpMs: 2_500,
  cls: 0.1,
  longTaskMs: 500,
  requestCount: 75,
  transferBytes: 2 * 1024 * 1024,
  scriptBytes: 700 * 1024,
});

const DEFAULT_PATHS = Object.freeze([
  "/",
  "/players",
  "/matches",
  "/rankings",
  "/competitions",
  "/tools/coin-toss",
  "/tools/random-team",
  "/login",
  "/signup",
]);

const VIEWPORTS = Object.freeze([
  Object.freeze({ name: "desktop", width: 1440, height: 1000, mobile: false }),
  Object.freeze({ name: "mobile", width: 390, height: 844, mobile: true }),
  Object.freeze({ name: "narrow", width: 320, height: 800, mobile: true }),
]);

function argumentsMap(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error(`Invalid argument near ${key ?? "end of input"}.`);
    result.set(key.slice(2), value);
  }
  return result;
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a Chromium debugging port.");
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Chromium is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Chromium debugging endpoint did not become ready.");
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = new Map();
  }

  async open() {
    await new Promise((resolveOpen, reject) => {
      this.socket.addEventListener("open", resolveOpen, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      const waiters = this.waiters.get(message.method) ?? [];
      for (const waiter of [...waiters]) {
        if (!waiter.predicate(message.params)) continue;
        clearTimeout(waiter.timeout);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message.params);
      }
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCall, reject) => {
      this.pending.set(id, { resolve: resolveCall, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(method, predicate = () => true, timeoutMs = 30_000) {
    return new Promise((resolveEvent, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}.`)), timeoutMs);
      const waiter = { predicate, resolve: resolveEvent, reject, timeout };
      const waiters = this.waiters.get(method) ?? [];
      waiters.push(waiter);
      this.waiters.set(method, waiters);
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? "Browser evaluation failed.");
  return response.result?.value;
}

function budgetIssues(metrics) {
  const issues = [];
  for (const [key, maximum] of Object.entries(QUALITY_BUDGET)) {
    if (metrics[key] > maximum) issues.push(`PERFORMANCE_${key.toUpperCase()}:${metrics[key]}>${maximum}`);
  }
  return issues;
}

function axeIssues(violations) {
  return violations.map((violation) => `AXE_${violation.id}:${violation.nodes.length}`);
}

export function assessBrowserSnapshot(snapshot) {
  return [
    snapshot.status !== 200 ? `HTTP_${snapshot.status ?? "UNKNOWN"}` : null,
    snapshot.lang !== "ko" ? `DOCUMENT_LANG:${snapshot.lang || "missing"}` : null,
    snapshot.mainCount !== 1 ? `MAIN_COUNT:${snapshot.mainCount}` : null,
    snapshot.h1Count < 1 ? "MISSING_H1" : null,
    snapshot.hasHorizontalOverflow ? `HORIZONTAL_OVERFLOW:${snapshot.scrollWidth}>${snapshot.clientWidth}` : null,
    snapshot.reducedMotionMatches !== true ? "REDUCED_MOTION_MEDIA_NOT_MATCHED" : null,
    snapshot.maxAnimationDurationMs > 50 ? `REDUCED_MOTION_ACTIVE:${snapshot.maxAnimationDurationMs}` : null,
    snapshot.hasSkipLink && snapshot.firstTab?.href !== "#main-content" ? `FIRST_TAB_NOT_SKIP_LINK:${snapshot.firstTab?.label || "missing"}` : null,
    snapshot.tabSequence.some((entry) => !entry.visible) ? "KEYBOARD_FOCUS_NOT_VISIBLE" : null,
    ...axeIssues(snapshot.axeViolations),
    ...snapshot.axUnnamedFocusable.map((role) => `AX_UNNAMED_FOCUSABLE:${role}`),
    ...budgetIssues(snapshot.performance),
  ].filter(Boolean);
}

async function tabSequence(client, count = 12) {
  await evaluate(client, `(() => {
    document.body.setAttribute("tabindex", "-1");
    document.body.focus();
    document.body.removeAttribute("tabindex");
  })()`);
  const sequence = [];
  for (let index = 0; index < count; index += 1) {
    await client.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await client.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    sequence.push(await evaluate(client, `(() => {
      const node = document.activeElement;
      const rect = node?.getBoundingClientRect?.();
      const style = node instanceof Element ? getComputedStyle(node) : null;
      return {
        tag: node?.tagName?.toLowerCase?.() ?? null,
        label: node?.getAttribute?.("aria-label") || node?.textContent?.trim?.().replace(/\\s+/g, " ").slice(0, 80) || "",
        href: node?.getAttribute?.("href") ?? null,
        visible: Boolean(rect && rect.width > 0 && rect.height > 0 && style?.visibility !== "hidden" && style?.display !== "none")
      };
    })()`));
  }
  return sequence;
}

async function auditPage(client, axeSource, origin, path, viewport) {
  await client.call("Network.clearBrowserCache");
  await client.call("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await client.call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  let status = null;
  const responseWait = client.waitFor("Network.responseReceived", (params) => {
    if (params.type !== "Document") return false;
    status = params.response.status;
    return true;
  }).catch(() => null);
  const loadWait = client.waitFor("Page.loadEventFired");
  await client.call("Page.navigate", { url: new URL(path, origin).toString() });
  await Promise.all([loadWait, responseWait]);
  await evaluate(client, "document.fonts?.ready.then(() => new Promise((resolve) => setTimeout(resolve, 250)))");
  await evaluate(client, `(0, eval)(${JSON.stringify(axeSource)})`);
  const axeResult = await evaluate(client, `axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    resultTypes: ["violations"]
  }).then((result) => ({ violations: result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html.slice(0, 240), failureSummary: node.failureSummary }))
  })) }))`);
  const details = await evaluate(client, `(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    const animations = document.getAnimations({ subtree: true });
    const durations = animations.map((animation) => {
      const timing = animation.effect?.getComputedTiming?.();
      return Number.isFinite(timing?.activeDuration) ? timing.activeDuration : 0;
    });
    return {
      lang: document.documentElement.lang,
      mainCount: document.querySelectorAll("main").length,
      h1Count: document.querySelectorAll("h1").length,
      hasSkipLink: Boolean(document.querySelector('a[href="#main-content"]')),
      hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      reducedMotionMatches: matchMedia("(prefers-reduced-motion: reduce)").matches,
      maxAnimationDurationMs: Math.max(0, ...durations),
      performance: {
        ttfbMs: Math.round(navigation.responseStart),
        lcpMs: Math.round(window.__qualityVitals?.lcp ?? 0),
        cls: Number((window.__qualityVitals?.cls ?? 0).toFixed(4)),
        longTaskMs: Math.round(window.__qualityVitals?.longTaskMs ?? 0),
        requestCount: resources.length + 1,
        transferBytes: Math.round(resources.reduce((sum, item) => sum + item.transferSize, navigation.transferSize ?? 0)),
        scriptBytes: Math.round(resources.filter((item) => item.initiatorType === "script" || item.name.includes("/_next/static/chunks/")).reduce((sum, item) => sum + item.transferSize, 0))
      }
    };
  })()`);
  const tabs = await tabSequence(client);
  const accessibility = await client.call("Accessibility.getFullAXTree");
  const axUnnamedFocusable = accessibility.nodes
    .filter((node) => node.properties?.some((property) => property.name === "focusable" && property.value?.value === true))
    .filter((node) => !String(node.name?.value ?? "").trim())
    .map((node) => String(node.role?.value ?? "unknown"));
  const snapshot = {
    path,
    viewport: viewport.name,
    status,
    ...details,
    firstTab: tabs[0],
    tabSequence: tabs,
    axeViolations: axeResult.violations,
    axUnnamedFocusable,
  };
  return { ...snapshot, issues: assessBrowserSnapshot(snapshot) };
}

async function main() {
  const args = argumentsMap(process.argv.slice(2));
  const origin = new URL(args.get("origin") ?? "http://127.0.0.1:3000").origin;
  const paths = args.get("paths")?.split(",").map((path) => path.trim()).filter(Boolean) ?? DEFAULT_PATHS;
  const outputPath = args.get("output") ? resolve(args.get("output")) : null;
  const chromePath = args.get("chrome") ?? process.env.V2_CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
  const profileDirectory = await mkdtemp(join(tmpdir(), "klol-v2-quality-"));
  const debugPort = await reservePort();
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  let client;
  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
    const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" }).then((response) => response.json());
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.open();
    await Promise.all([
      client.call("Page.enable"),
      client.call("Network.enable"),
      client.call("Runtime.enable"),
      client.call("Accessibility.enable"),
    ]);
    await client.call("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__qualityVitals = { lcp: 0, cls: 0, longTaskMs: 0 };
      try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__qualityVitals.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
      try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__qualityVitals.cls += entry.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
      try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__qualityVitals.longTaskMs += entry.duration; }).observe({ type: "longtask", buffered: true }); } catch {}
    ` });
    const results = [];
    for (const viewport of VIEWPORTS) {
      for (const path of paths) {
        const result = await auditPage(client, axeSource, origin, path, viewport);
        results.push(result);
        process.stdout.write(`[quality] ${viewport.name} ${path} ${result.issues.length ? `FAIL ${result.issues.join(",")}` : "PASS"}\n`);
      }
    }
    const report = { origin, auditedAt: new Date().toISOString(), budgets: QUALITY_BUDGET, results };
    if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    const failureCount = results.reduce((sum, result) => sum + result.issues.length, 0);
    process.stdout.write(`[quality-summary] pages=${results.length} issues=${failureCount}\n`);
    if (failureCount) process.exitCode = 1;
  } finally {
    if (client) {
      try { await client.call("Browser.close"); } catch { /* Chrome may already be closed. */ }
      client.close();
    }
    if (chrome.exitCode === null) chrome.kill("SIGTERM");
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

const invokedAsScript = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.slice(process.platform === "win32" ? 1 : 0));
if (invokedAsScript) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
