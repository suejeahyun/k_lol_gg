import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    values.set(key.slice(2), value);
    index += 1;
  }
  return values;
}

async function readCredentialsFromStdin(enabled) {
  if (!enabled) return {};
  let source = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    source += chunk;
    if (Buffer.byteLength(source, "utf8") > 16 * 1024) {
      throw new Error("Synthetic browser QA credentials exceeded the 16 KiB input limit.");
    }
  }
  let credentials;
  try {
    credentials = JSON.parse(source);
  } catch {
    throw new Error("Synthetic browser QA credentials stdin must be one JSON object.");
  }
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    throw new Error("Synthetic browser QA credentials stdin must be one JSON object.");
  }
  const allowed = new Set([
    "password", "adminLoginId", "setupLoginId", "accountLoginId", "totpCode",
    "adminCookie", "accountCookie", "setupCookie",
  ]);
  for (const [key, value] of Object.entries(credentials)) {
    if (!allowed.has(key)) throw new Error(`Unknown synthetic browser QA credential field: ${key}.`);
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Synthetic browser QA credential ${key} must be a non-empty string.`);
    }
  }
  return credentials;
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve a Chromium debug port.");
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Chromium debugging endpoint did not become ready: ${lastError ?? "timeout"}`);
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
      const methodWaiters = this.waiters.get(message.method) ?? [];
      for (const waiter of [...methodWaiters]) {
        if (!waiter.predicate(message.params)) continue;
        clearTimeout(waiter.timeout);
        methodWaiters.splice(methodWaiters.indexOf(waiter), 1);
        waiter.resolve(message.params);
      }
    });
    this.socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("Chromium debugging connection closed."));
      this.pending.clear();
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
      const waiter = { predicate, resolve: resolveEvent, timeout };
      const methodWaiters = this.waiters.get(method) ?? [];
      methodWaiters.push(waiter);
      this.waiters.set(method, methodWaiters);
    });
  }

  close() {
    this.socket.close();
  }
}

function parseCookie(cookiePair, expectedName) {
  if (!cookiePair) return null;
  const firstPart = cookiePair.split(";", 1)[0];
  const separator = firstPart.indexOf("=");
  if (separator < 1) throw new Error(`Invalid ${expectedName} cookie.`);
  const name = firstPart.slice(0, separator);
  if (name !== expectedName) throw new Error(`Expected ${expectedName}, received ${name}.`);
  return { name, value: firstPart.slice(separator + 1) };
}

async function loginForCookie(origin, endpoint, body) {
  const response = await fetch(new URL(endpoint, origin), {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Synthetic browser QA login failed at ${endpoint} with HTTP ${response.status}.`);
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error(`Synthetic browser QA login at ${endpoint} did not return a cookie.`);
  return cookie;
}

function safeFileName(index, route) {
  const routeName = route.name || route.path || `page-${index + 1}`;
  const safeName = routeName.normalize("NFKD").replace(/[^a-zA-Z0-9가-힣]+/g, "-").replace(/^-|-$/g, "");
  return `${String(index + 1).padStart(3, "0")}-${safeName || "page"}.png`;
}

async function evaluate(client, expression) {
  const result = await client.call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed.");
  return result.result?.value;
}

async function main() {
  const args = readArguments(process.argv.slice(2));
  const stdinCredentials = await readCredentialsFromStdin(args.get("credentials-stdin") === "true");
  const credential = (argumentName, fieldName) => args.get(argumentName) ?? stdinCredentials[fieldName];
  const origin = new URL(args.get("origin") ?? "http://127.0.0.1:3000").origin;
  const routesPath = resolve(args.get("routes") ?? "docs/qa-evidence/capture-plan.json");
  const outputDirectory = resolve(args.get("output") ?? "docs/qa-evidence/screenshots");
  const chromePath = args.get("chrome") ?? process.env.V2_CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const routes = JSON.parse(await readFile(routesPath, "utf8"));
  if (!Array.isArray(routes) || routes.length === 0) throw new Error("The capture plan must contain at least one route.");
  await mkdir(outputDirectory, { recursive: true });

  const password = credential("password", "password");
  const adminLoginId = credential("admin-login-id", "adminLoginId");
  const setupLoginId = credential("setup-login-id", "setupLoginId");
  const accountLoginId = credential("account-login-id", "accountLoginId");
  const totpCode = credential("totp-code", "totpCode");
  let adminCookie = credential("admin-cookie", "adminCookie");
  let accountCookie = credential("account-cookie", "accountCookie");
  let setupCookie = credential("setup-cookie", "setupCookie");
  if (!adminCookie && (adminLoginId || totpCode)) {
    if (!adminLoginId || !password || !totpCode) throw new Error("Admin QA login requires --admin-login-id, --password, and --totp-code together.");
    adminCookie = await loginForCookie(origin, "/api/admin/login", { loginId: adminLoginId, password, totpCode });
  }
  if (!accountCookie && accountLoginId) {
    if (!accountLoginId || !password) throw new Error("Account QA login requires --account-login-id and --password together.");
    accountCookie = await loginForCookie(origin, "/api/auth/login", { loginId: accountLoginId, password });
  }
  if (!setupCookie && setupLoginId) {
    if (!password) throw new Error("Setup QA login requires --setup-login-id and --password together.");
    setupCookie = await loginForCookie(origin, "/api/admin/login", { loginId: setupLoginId, password });
  }

  const profileDirectory = await mkdtemp(join(tmpdir(), "klol-v2-capture-"));
  const debugPort = await reservePort();
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--hide-scrollbars",
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
    await Promise.all([client.call("Page.enable"), client.call("Network.enable"), client.call("Runtime.enable")]);

    const sessionCookies = {
      admin: parseCookie(adminCookie, "klol_v2_session"),
      account: parseCookie(accountCookie, "klol_v2_account_session"),
      setup: parseCookie(setupCookie, "klol_v2_session"),
    };
    async function setSessionCookie(cookie) {
      if (!cookie) throw new Error("The capture plan requested a session cookie that was not provided.");
      const result = await client.call("Network.setCookie", {
        ...cookie,
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      });
      if (!result.success) throw new Error(`Chromium rejected ${cookie.name}.`);
    }

    const records = [];
    for (const [index, route] of routes.entries()) {
      if (!route || typeof route.path !== "string" || !route.path.startsWith("/")) {
        throw new Error(`Invalid capture route at index ${index}.`);
      }
      const viewport = route.viewport ?? { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false };
      const session = route.session ?? "anonymous";
      if (!["anonymous", "account", "admin", "setup", "both"].includes(session)) {
        throw new Error(`Invalid session profile for ${route.path}: ${session}`);
      }
      await Promise.all([
        client.call("Network.deleteCookies", { name: "klol_v2_session", url: origin }),
        client.call("Network.deleteCookies", { name: "klol_v2_account_session", url: origin }),
      ]);
      if (session === "account" || session === "both") await setSessionCookie(sessionCookies.account);
      if (session === "admin" || session === "both") await setSessionCookie(sessionCookies.admin);
      if (session === "setup") await setSessionCookie(sessionCookies.setup);
      await client.call("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
        mobile: viewport.mobile ?? false,
      });
      await client.call("Emulation.setEmulatedMedia", {
        media: "screen",
        features: [
          { name: "prefers-color-scheme", value: "light" },
          { name: "prefers-reduced-motion", value: "reduce" },
        ],
      });
      const requestedUrl = new URL(route.path, origin).toString();
      let documentStatus = null;
      let finalResponseUrl = null;
      const responseWait = client.waitFor("Network.responseReceived", (params) => {
        if (params.type !== "Document") return false;
        finalResponseUrl = params.response.url;
        documentStatus = params.response.status;
        return true;
      }).catch(() => null);
      const loadWait = client.waitFor("Page.loadEventFired");
      await client.call("Page.navigate", { url: requestedUrl });
      await Promise.all([loadWait, responseWait]);
      await evaluate(client, `(async () => {
        await document.fonts?.ready;
        const step = Math.max(320, Math.floor(innerHeight * 0.8));
        const maximum = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        for (let y = 0; y <= maximum; y += step) {
          scrollTo(0, y);
          await new Promise((resolve) => setTimeout(resolve, 45));
        }
        scrollTo(0, 0);
        await new Promise((resolve) => setTimeout(resolve, 300));
      })()`);
      const pageDetails = await evaluate(client, `({
        title: document.title,
        finalUrl: location.href,
        responseStatus: performance.getEntriesByType("navigation")[0]?.responseStatus ?? null,
        heading: document.querySelector("h1")?.textContent?.trim() ?? null,
        hasVisibleRuntimeFailure: [...document.querySelectorAll('h1, h2, [role="alert"]')].some((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") return false;
          return /불러오지 못했|불러오지 못했습니다|불러올 수 없|읽는 중 오류가 발생|Internal Server Error|Application error: a server-side exception/i.test(element.textContent ?? "");
        }),
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        textSample: document.body?.innerText?.trim().slice(0, 240) ?? "",
        hasFrameworkError: /Internal Server Error|Application error: a server-side exception|This page could not be found/i.test(document.body?.innerText ?? "")
      })`);
      const layoutMetrics = await client.call("Page.getLayoutMetrics");
      const contentSize = layoutMetrics.cssContentSize ?? layoutMetrics.contentSize;
      if (!contentSize || contentSize.width < 1 || contentSize.height < 1) {
        throw new Error(`Chromium returned invalid full-page dimensions for ${route.path}.`);
      }
      const screenshot = await client.call("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        fromSurface: true,
        clip: {
          x: 0,
          y: 0,
          width: Math.ceil(contentSize.width),
          height: Math.ceil(contentSize.height),
          scale: 1,
        },
      });
      const fileName = safeFileName(index, route);
      await writeFile(join(outputDirectory, fileName), Buffer.from(screenshot.data, "base64"));
      const finalStatus = pageDetails.responseStatus || documentStatus;
      const finalLocation = new URL(pageDetails.finalUrl ?? finalResponseUrl ?? requestedUrl);
      const finalPath = `${finalLocation.pathname}${finalLocation.search}`;
      const issues = [
        finalStatus !== 200 ? `HTTP_${finalStatus ?? "UNKNOWN"}` : null,
        route.expectedRedirect?.destination && finalPath !== route.expectedRedirect.destination
          ? "REDIRECT_DESTINATION_MISMATCH"
          : null,
        pageDetails.hasHorizontalOverflow ? "HORIZONTAL_OVERFLOW" : null,
        pageDetails.hasFrameworkError ? "FRAMEWORK_ERROR" : null,
        pageDetails.hasVisibleRuntimeFailure ? "VISIBLE_RUNTIME_FAILURE" : null,
        !pageDetails.heading ? "MISSING_H1" : null,
      ].filter(Boolean);
      records.push({
        index: index + 1,
        name: route.name ?? (basename(route.path) || "home"),
        group: route.group ?? "public",
        session,
        requestedPath: route.path,
        requestedUrl,
        finalUrl: pageDetails.finalUrl ?? finalResponseUrl,
        finalPath,
        status: finalStatus,
        title: pageDetails.title,
        heading: pageDetails.heading,
        hasHorizontalOverflow: pageDetails.hasHorizontalOverflow,
        scrollWidth: pageDetails.scrollWidth,
        clientWidth: pageDetails.clientWidth,
        capturedWidth: Math.ceil(contentSize.width),
        capturedHeight: Math.ceil(contentSize.height),
        textSample: pageDetails.textSample,
        issues,
        screenshot: fileName,
        viewport,
      });
      process.stdout.write(`[capture] ${index + 1}/${routes.length} ${finalStatus ?? "?"} ${route.path} -> ${fileName}${issues.length ? ` issues=${issues.join(",")}` : ""}\n`);
    }
    await writeFile(join(outputDirectory, "index.json"), `${JSON.stringify({ origin, capturedAt: new Date().toISOString(), routes: records }, null, 2)}\n`);
  } finally {
    if (client) {
      try { await client.call("Browser.close"); } catch { /* Chromium may already be closed. */ }
      client.close();
    }
    if (chrome.exitCode === null) chrome.kill("SIGTERM");
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
    await rm(profileDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
