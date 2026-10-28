import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

type CdpEvent = Readonly<{
  method?: string;
  params?: Record<string, unknown>;
}>;

type CdpWaiter = {
  predicate: (params: Record<string, unknown>) => boolean;
  resolve: (params: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

class CdpClient {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly waiters = new Map<string, CdpWaiter[]>();
  readonly runtimeErrors: string[] = [];

  constructor(webSocketUrl: string) {
    this.socket = new WebSocket(webSocketUrl);
  }

  async open() {
    await new Promise<void>((resolveOpen, reject) => {
      this.socket.addEventListener("open", () => resolveOpen(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("Chromium debugging connection failed.")), { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpEvent & Readonly<{
        id?: number;
        result?: unknown;
        error?: { message?: string };
      }>;
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "Chromium command failed."));
        else pending.resolve(message.result);
        return;
      }
      if (!message.method || !message.params) return;
      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params.exceptionDetails as { text?: string; exception?: { description?: string } } | undefined;
        this.runtimeErrors.push(details?.exception?.description ?? details?.text ?? "Unknown browser exception");
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
      for (const waiters of this.waiters.values()) {
        for (const waiter of waiters) {
          clearTimeout(waiter.timeout);
          waiter.reject(new Error("Chromium debugging connection closed."));
        }
      }
      this.waiters.clear();
    });
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolveCall, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolveCall(value as T),
        reject,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(
    method: string,
    predicate: (params: Record<string, unknown>) => boolean = () => true,
    timeoutMs = 15_000,
  ) {
    return new Promise<Record<string, unknown>>((resolveEvent, reject) => {
      const waiter = {} as CdpWaiter;
      waiter.predicate = predicate;
      waiter.resolve = resolveEvent;
      waiter.reject = reject;
      waiter.timeout = setTimeout(() => {
        const methodWaiters = this.waiters.get(method) ?? [];
        methodWaiters.splice(methodWaiters.indexOf(waiter), 1);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);
      const methodWaiters = this.waiters.get(method) ?? [];
      methodWaiters.push(waiter);
      this.waiters.set(method, methodWaiters);
    });
  }

  close() {
    this.socket.close();
  }
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a Chromium debug port.")));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function waitForJson(url: string, child: ChildProcess, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Chromium exited before readiness (${child.exitCode}).`);
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json() as { webSocketDebuggerUrl?: string };
    } catch {
      // Chromium is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Chromium debugging endpoint did not become ready.");
}

async function findChromium() {
  const candidates = [
    process.env.V2_CHROME_PATH,
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" : undefined,
    process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next reviewed browser path.
    }
  }
  throw new Error("A Chromium executable is required for the browser regression.");
}

function cookiePair(value: string) {
  const first = value.split(";", 1)[0] ?? "";
  const separator = first.indexOf("=");
  if (separator < 1) throw new Error("Invalid browser regression session cookie.");
  return { name: first.slice(0, separator), value: first.slice(separator + 1) };
}

export class IsolatedChromium {
  private constructor(
    private readonly origin: string,
    private readonly profileDirectory: string,
    private readonly child: ChildProcess,
    private readonly client: CdpClient,
  ) {}

  static async launch(origin: string, options: { localCertificateSpki?: string } = {}) {
    if (options.localCertificateSpki && (!new Set(["127.0.0.1", "localhost"]).has(new URL(origin).hostname) || !/^[A-Za-z0-9+/]{43}=$/u.test(options.localCertificateSpki))) throw new Error("Certificate exception requires an exact synthetic loopback certificate fingerprint.");
    const chromePath = await findChromium();
    const profileDirectory = await mkdtemp(path.join(tmpdir(), "klol-v2-browser-"));
    const debugPort = await availablePort();
    const child = spawn(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      ...(options.localCertificateSpki ? [`--ignore-certificate-errors-spki-list=${options.localCertificateSpki}`] : []),
      `--remote-debugging-port=${debugPort}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ], { stdio: "ignore", windowsHide: true });
    try {
      await waitForJson(`http://127.0.0.1:${debugPort}/json/version`, child);
      const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })
        .then((response) => response.json()) as { webSocketDebuggerUrl?: string };
      if (!target.webSocketDebuggerUrl) throw new Error("Chromium did not create a debuggable page.");
      const client = new CdpClient(target.webSocketDebuggerUrl);
      await client.open();
      await Promise.all([client.call("Page.enable"), client.call("Network.enable"), client.call("Runtime.enable")]);
      await client.call("Page.bringToFront");
      return new IsolatedChromium(origin, profileDirectory, child, client);
    } catch (error) {
      child.kill("SIGKILL");
      await rm(profileDirectory, { force: true, recursive: true });
      throw error;
    }
  }

  async clearCookies() {
    await this.client.call("Network.clearBrowserCookies");
  }

  async setViewport(width: number, height: number) {
    await this.client.call("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: false,
    });
  }

  async setOffline(offline: boolean) {
    await this.client.call("Network.emulateNetworkConditions", {
      offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
  }

  async captureScreenshot() {
    const { data } = await this.client.call<{ data: string }>("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: false,
    });
    return Buffer.from(data, "base64");
  }

  getRuntimeErrors() {
    return [...this.client.runtimeErrors];
  }

  async setCookie(cookie: string) {
    const parsed = cookiePair(cookie);
    const result = await this.client.call<{ success?: boolean }>("Network.setCookie", {
      ...parsed,
      url: this.origin,
      httpOnly: true,
      sameSite: "Strict",
    });
    if (!result.success) throw new Error(`Chromium rejected ${parsed.name}.`);
  }

  async navigate(pathname: string) {
    const load = this.client.waitFor("Page.loadEventFired");
    await this.client.call("Page.navigate", { url: new URL(pathname, this.origin).toString() });
    await load;
    await this.waitFor("document.readyState === 'complete'", "document readiness");
  }

  waitForResponse(pathname: string, status: number) {
    const expected = new URL(pathname, this.origin).toString();
    return this.client.waitFor("Network.responseReceived", (params) => {
      const response = params.response as { url?: unknown; status?: unknown } | undefined;
      return response?.url === expected && response.status === status;
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.client.call<{
      exceptionDetails?: { exception?: { description?: string }; text?: string };
      result?: { value?: T };
    }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "Browser evaluation failed.");
    }
    return response.result?.value as T;
  }

  async focus(selector: string) {
    const serializedSelector = JSON.stringify(selector);
    await this.waitFor(
      `(() => {
        const target = document.querySelector(${serializedSelector});
        if (!(target instanceof HTMLElement) || target.hidden || target.matches(':disabled')) return false;
        target.focus();
        return document.activeElement === target;
      })()`,
      `${selector} to become focusable`,
    );
  }

  async insertText(text: string) {
    await this.client.call("Input.insertText", { text });
  }

  async selectAll() {
    const event = {
      key: "a",
      code: "KeyA",
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2,
    };
    await this.client.call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
    await this.client.call("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  }

  async pressEnter() {
    const event = {
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    };
    await this.client.call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
    await this.client.call("Input.dispatchKeyEvent", {
      type: "char",
      ...event,
      text: "\r",
      unmodifiedText: "\r",
    });
    await this.client.call("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  }

  async pressSpace() {
    const event = { key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
    await this.client.call("Input.dispatchKeyEvent", { type: "rawKeyDown", ...event });
    await this.client.call("Input.dispatchKeyEvent", { type: "char", ...event, text: " ", unmodifiedText: " " });
    await this.client.call("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  }

  /** Real browser input, including native HTML drag and touch pointer capture. */
  async drag(sourceSelector: string, targetSelector: string, input: "mouse" | "touch") {
    const points = await this.evaluate<{ source: { x: number; y: number }; target: { x: number; y: number } }>(`(async () => {
      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      const target = document.querySelector(${JSON.stringify(targetSelector)});
      if (!source || !target) throw new Error('Drag elements missing');
      source.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const point = node => { const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; };
      return { source: point(source), target: point(target) };
    })()`);
    const { source, target } = points;
    if (input === "touch") {
      await this.client.call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      try {
        await this.client.call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...source, id: 1 }] });
        let from = source;
        let destination = target;
        for (let attempt = 0; attempt < 120; attempt++) {
          const viewport = await this.evaluate<{ height: number; x: number; y: number }>(`(() => { const rect = document.querySelector(${JSON.stringify(targetSelector)}).getBoundingClientRect(); return { height: innerHeight, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
          destination = { x: viewport.x, y: viewport.y };
          if (viewport.y >= 120 && viewport.y <= viewport.height - 120) break;
          from = { x: source.x, y: viewport.y < 120 ? 82 : viewport.height - 82 };
          await this.client.call("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...from, id: 1 }] });
          await this.evaluate("new Promise(resolve => setTimeout(resolve, 50))");
          if (attempt === 119) throw new Error("Touch edge scrolling did not reveal the target card.");
        }
        for (let step = 1; step <= 8; step++) {
          await this.client.call("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (destination.x - from.x) * step / 8, y: from.y + (destination.y - from.y) * step / 8, id: 1 }] });
        }
        await this.client.call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      } finally {
        await this.client.call("Emulation.setTouchEmulationEnabled", { enabled: false });
      }
      return;
    }
    await this.client.call("Input.setInterceptDrags", { enabled: true });
    try {
      await this.client.call("Input.dispatchMouseEvent", { type: "mouseMoved", ...source });
      await this.client.call("Input.dispatchMouseEvent", { type: "mousePressed", ...source, button: "left", clickCount: 1 });
      const intercepted = this.client.waitFor("Input.dragIntercepted");
      await this.client.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: source.x, y: source.y + 12, button: "left", buttons: 1 });
      await this.client.call("Input.dispatchMouseEvent", { type: "mouseMoved", ...target, button: "left", buttons: 1 });
      const { data } = await intercepted;
      await this.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      await this.client.call("Input.dispatchDragEvent", { type: "dragEnter", ...target, data });
      await this.client.call("Input.dispatchDragEvent", { type: "dragOver", ...target, data });
      await this.client.call("Input.dispatchDragEvent", { type: "drop", ...target, data });
      await this.client.call("Input.dispatchMouseEvent", { type: "mouseReleased", ...target, button: "left", clickCount: 1 });
    } finally {
      await this.client.call("Input.setInterceptDrags", { enabled: false });
    }
  }

  async waitFor(expression: string, description: string, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate<boolean>(`Boolean(${expression})`)) return;
      } catch {
        // A React refresh can briefly replace the execution context.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error(`Timed out waiting for ${description}.`);
  }

  async close() {
    this.client.close();
    if (this.child.exitCode === null) this.child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => this.child.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
    ]);
    if (this.child.exitCode === null) this.child.kill("SIGKILL");
    await rm(this.profileDirectory, { force: true, recursive: true });
  }
}
