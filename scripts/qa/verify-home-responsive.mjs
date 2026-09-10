import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const separator = argument.indexOf("=");
  if (!argument.startsWith("--") || separator < 3) throw new Error(`INVALID_ARGUMENT:${argument}`);
  return [argument.slice(2, separator), argument.slice(separator + 1)];
}));
const width = Number(options.width ?? "390");
const height = Number(options.height ?? "844");
const url = options.url ?? "http://127.0.0.1:3101";
const endpoint = options.endpoint ?? "http://127.0.0.1:9224";
const screenshotPath = options.screenshot ? resolve(options.screenshot) : null;
const mobile = options.mobile === "true";
if (!Number.isInteger(width) || width < 320 || width > 2560) throw new Error("INVALID_WIDTH");
if (!Number.isInteger(height) || height < 480 || height > 2560) throw new Error("INVALID_HEIGHT");

const targetResponse = await fetch(`${endpoint}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
if (!targetResponse.ok) throw new Error(`CREATE_TARGET_FAILED:${targetResponse.status}`);
const target = await targetResponse.json();
if (typeof target.webSocketDebuggerUrl !== "string") throw new Error("TARGET_WEBSOCKET_MISSING");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (typeof message.id !== "number") return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(`${request.method}:${message.error.message}`));
  else request.resolve(message.result ?? {});
});

function command(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolveCommand, rejectCommand) => {
    pending.set(id, { method, resolve: resolveCommand, reject: rejectCommand });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await command("Page.enable");
await command("Runtime.enable");
await command("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__homeLayoutShift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__homeLayoutShift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });`,
});
await command("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 1,
  mobile,
  screenWidth: width,
  screenHeight: height,
});
await command("Page.navigate", { url });

const deadline = Date.now() + 15_000;
while (Date.now() < deadline) {
  const ready = await command("Runtime.evaluate", {
    expression: `(() => {
      const hero = document.querySelector('.hero-panel');
      const customImage = document.querySelector('.hero-art__custom img');
      return document.readyState === 'complete' &&
        Boolean(hero && hero.getBoundingClientRect().width > 0) &&
        Boolean(customImage && customImage.complete && customImage.naturalWidth > 0);
    })()`,
    returnByValue: true,
  });
  if (ready.result?.value === true) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    break;
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
}
await command("Runtime.evaluate", {
  expression: "document.fonts ? document.fonts.ready.then(() => true) : true",
  awaitPromise: true,
  returnByValue: true,
});

const evaluation = await command("Runtime.evaluate", {
  expression: `(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
        right: value.right,
        bottom: value.bottom,
      };
    };
    const rootWidth = document.documentElement.clientWidth;
    const elements = [...document.querySelectorAll('body *')];
    const overflows = elements.flatMap((element) => {
      const value = element.getBoundingClientRect();
      if (value.right <= rootWidth + 0.5 && value.left >= -0.5) return [];
      const style = getComputedStyle(element);
      return [{
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        text: (element.textContent || '').trim().slice(0, 80),
        left: value.left,
        right: value.right,
        width: value.width,
        minWidth: style.minWidth,
        gridTemplateColumns: style.gridTemplateColumns,
        wordBreak: style.wordBreak,
        whiteSpace: style.whiteSpace,
      }];
    }).slice(0, 100);
    const intrinsicCandidates = elements.map((element) => {
      const value = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        text: (element.textContent || '').trim().slice(0, 100),
        width: value.width,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        minWidth: style.minWidth,
        overflowX: style.overflowX,
        whiteSpace: style.whiteSpace,
        wordBreak: style.wordBreak,
      };
    }).sort((left, right) => right.scrollWidth - left.scrollWidth).slice(0, 25);
    const customImage = document.querySelector('.hero-art__custom img');
    const heroArt = document.querySelector('.hero-art');
    const officialSplashRequests = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((resourceUrl) => resourceUrl.includes('ddragon.leagueoflegends.com/cdn/img/champion/splash/'));
    return {
      viewport: {
        innerWidth: window.innerWidth,
        clientWidth: rootWidth,
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      },
      rects: {
        page: rect('.page-wrap'),
        home: rect('.home-page'),
        hero: rect('.hero-panel'),
        heroCopy: rect('.hero-copy'),
        heroArt: rect('.hero-art'),
        heroLabel: rect('.hero-art__label'),
        search: rect('.hero-search'),
        searchButton: rect('.hero-search button'),
        mobileNav: rect('.mobile-nav'),
      },
      customImage: customImage ? {
        complete: customImage.complete,
        naturalWidth: customImage.naturalWidth,
        naturalHeight: customImage.naturalHeight,
        currentSrc: customImage.currentSrc,
        opacity: getComputedStyle(customImage).opacity,
      } : null,
      guide: heroArt ? {
        audience: heroArt.getAttribute('data-guide-audience'),
        art: heroArt.getAttribute('data-guide-art'),
        championKey: heroArt.getAttribute('data-champion-key'),
        championName: heroArt.getAttribute('data-champion-name'),
      } : null,
      cumulativeLayoutShift: window.__homeLayoutShift || 0,
      officialSplashRequests,
      homeGridTemplateColumns: getComputedStyle(document.querySelector('.home-page')).gridTemplateColumns,
      intrinsicCandidates,
      overflows,
    };
  })()`,
  returnByValue: true,
});
const result = evaluation.result?.value;
if (!result) throw new Error("LAYOUT_EVALUATION_FAILED");
const heroLabel = result.rects.heroLabel;
const mobileNav = result.rects.mobileNav;
const labelNavIntersection = heroLabel && mobileNav
  ? Math.max(0, Math.min(heroLabel.right, mobileNav.right) - Math.max(heroLabel.x, mobileNav.x))
    * Math.max(0, Math.min(heroLabel.bottom, mobileNav.bottom) - Math.max(heroLabel.y, mobileNav.y))
  : 0;
result.labelNavIntersection = labelNavIntersection;

if (screenshotPath) {
  const screenshot = await command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await mkdir(dirname(screenshotPath), { recursive: true });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
}

process.stdout.write(JSON.stringify({ width, height, mobile, url, screenshotPath, ...result }, null, 2) + "\n");
await command("Page.close");
socket.close();

const { clientWidth, scrollWidth } = result.viewport;
const requiredRects = Object.values(result.rects).filter(Boolean);
if (
  scrollWidth > clientWidth ||
  requiredRects.some((value) => value.x < -0.5 || value.right > clientWidth + 0.5) ||
  labelNavIntersection > 0.5 ||
  result.customImage?.complete !== true ||
  !(result.customImage?.naturalWidth > 0) ||
  !(result.customImage?.naturalHeight > 0) ||
  result.guide?.audience !== "female-only" ||
  result.guide?.art !== "female-champion-original-v2" ||
  result.officialSplashRequests.length !== 0 ||
  !result.customImage?.currentSrc?.endsWith(".webp") ||
  result.cumulativeLayoutShift > 0.1
) process.exitCode = 1;
