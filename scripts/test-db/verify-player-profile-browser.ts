import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { IsolatedChromium } from "./isolated-chromium";

type PlayerSnapshot = Readonly<{
  riotId: string;
  currentTier: string | null;
  peakTier: string | null;
  revision: number;
}>;

type RenderedField = Readonly<{
  value: string;
  maxLength: number;
  label: string;
  marker: string | null;
}>;

type RenderedProfile = Readonly<{
  riotId: RenderedField | null;
  currentTier: RenderedField | null;
  peakTier: RenderedField | null;
  facts: Readonly<Record<string, string>>;
  saveButton: string | null;
}>;

const rawOrigin = process.env.V2_BROWSER_QA_ORIGIN;
const accountCookie = process.env.V2_BROWSER_QA_ACCOUNT_COOKIE ?? "";
if (!rawOrigin) throw new Error("Player profile browser regression requires a loopback origin.");
const origin = new URL(rawOrigin).origin;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u.test(origin)) {
  throw new Error("Player profile browser regression requires a loopback HTTP origin.");
}
if (!accountCookie) throw new Error("Player profile browser regression requires a synthetic account cookie.");

async function playerSnapshot(): Promise<PlayerSnapshot> {
  const response = await fetch(`${origin}/api/auth/me/player`, {
    headers: { cookie: accountCookie },
  });
  assert.equal(response.status, 200, "the browser fixture account must expose its player");
  const body = await response.json() as { player?: PlayerSnapshot };
  assert.ok(body.player);
  return body.player;
}

async function mutatePlayer(revision: number, body: Omit<PlayerSnapshot, "revision">) {
  return fetch(`${origin}/api/auth/me/player`, {
    method: "PATCH",
    headers: {
      cookie: accountCookie,
      origin,
      "content-type": "application/json",
      "idempotency-key": `browser-profile-${randomUUID()}`,
      "if-match": `"${revision}"`,
    },
    body: JSON.stringify(body),
  });
}

async function replaceFieldWithKeyboard(browser: IsolatedChromium, name: string, value: string) {
  const selector = `input[name=${JSON.stringify(name)}]`;
  await browser.focus(selector);
  assert.equal(
    await browser.evaluate(`document.activeElement?.getAttribute('name')`),
    name,
    `${name} must be focusable`,
  );
  await browser.selectAll();
  await browser.insertText(value);
  await browser.waitFor(
    `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
    `${name} keyboard input`,
  );
}

async function submitWithEnter(browser: IsolatedChromium, focusedField = "peakTier") {
  const selector = `input[name=${JSON.stringify(focusedField)}]`;
  await browser.focus(selector);
  assert.equal(
    await browser.evaluate(`document.activeElement?.getAttribute('name')`),
    focusedField,
    `${focusedField} must receive keyboard focus before submit`,
  );
  await browser.pressEnter();
}

async function readRenderedProfile(browser: IsolatedChromium) {
  return browser.evaluate<RenderedProfile>(`(() => {
    const field = (name) => {
      const input = document.querySelector('input[name="' + name + '"]');
      if (!(input instanceof HTMLInputElement)) return null;
      return {
        value: input.value,
        maxLength: input.maxLength,
        label: input.closest('label')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '',
        marker: input.dataset.browserQaInstance ?? null,
      };
    };
    const facts = Object.fromEntries([...document.querySelectorAll('dl > div')].map((row) => [
      row.querySelector('dt')?.textContent?.trim() ?? '',
      row.querySelector('dd')?.textContent?.trim() ?? '',
    ]));
    return {
      riotId: field('riotId'),
      currentTier: field('currentTier'),
      peakTier: field('peakTier'),
      facts,
      saveButton: [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('내 플레이어 정보 저장'))?.textContent?.trim() ?? null,
    };
  })()`);
}

const browser = await IsolatedChromium.launch(origin);
try {
  await browser.navigate("/login");
  await browser.setCookie(accountCookie);
  const initialPlayer = await playerSnapshot();
  await browser.navigate("/account?tab=player");
  assert.equal(await browser.evaluate("location.pathname"), "/account");
  assert.equal(await browser.evaluate("new URLSearchParams(location.search).get('tab')"), "player");
  await browser.waitFor(
    `document.querySelector('input[name="riotId"]') instanceof HTMLInputElement &&
      [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('내 플레이어 정보 저장'))`,
    "the hydrated account player form",
  );

  const initialRendered = await readRenderedProfile(browser);
  assert.deepEqual(
    {
      riotId: initialRendered.riotId?.value,
      currentTier: initialRendered.currentTier?.value,
      peakTier: initialRendered.peakTier?.value,
    },
    {
      riotId: initialPlayer.riotId,
      currentTier: initialPlayer.currentTier ?? "",
      peakTier: initialPlayer.peakTier ?? "",
    },
  );
  assert.equal(initialRendered.riotId?.maxLength, 22);
  assert.equal(initialRendered.currentTier?.maxLength, 32);
  assert.equal(initialRendered.peakTier?.maxLength, 32);
  assert.match(initialRendered.riotId?.label ?? "", /Riot ID/u);
  assert.match(initialRendered.currentTier?.label ?? "", /현재 티어/u);
  assert.match(initialRendered.peakTier?.label ?? "", /최고 티어/u);
  assert.equal(initialRendered.saveButton, "내 플레이어 정보 저장");

  const browserIdentity = `Browser${randomBytes(3).toString("hex")}`;
  const browserBody = {
    riotId: `${browserIdentity}#B01`,
    currentTier: "DIAMOND II",
    peakTier: "MASTER 120",
  };
  await replaceFieldWithKeyboard(browser, "riotId", browserBody.riotId);
  await replaceFieldWithKeyboard(browser, "currentTier", browserBody.currentTier);
  await replaceFieldWithKeyboard(browser, "peakTier", browserBody.peakTier);
  const successfulMutation = browser.waitForResponse("/api/auth/me/player", 200);
  await submitWithEnter(browser);
  await successfulMutation;
  await browser.waitFor(
    `(() => {
      const values = Object.fromEntries([...document.querySelectorAll('input[name]')].map((input) => [input.name, input.value]));
      const text = document.body?.innerText ?? '';
      return values.riotId === ${JSON.stringify(browserBody.riotId)} &&
        values.currentTier === ${JSON.stringify(browserBody.currentTier)} &&
        values.peakTier === ${JSON.stringify(browserBody.peakTier)} &&
        text.includes(${JSON.stringify(browserBody.riotId)}) &&
        text.includes(${JSON.stringify(browserBody.currentTier)}) &&
        text.includes(${JSON.stringify(browserBody.peakTier)});
    })()`,
    "the successful mutation to reach the form and profile facts",
  );
  const afterBrowserSave = await playerSnapshot();
  assert.equal(afterBrowserSave.revision, initialPlayer.revision + 1);
  assert.deepEqual(
    {
      riotId: afterBrowserSave.riotId,
      currentTier: afterBrowserSave.currentTier,
      peakTier: afterBrowserSave.peakTier,
    },
    browserBody,
  );

  assert.equal(await browser.evaluate<boolean>(`(() => {
    const input = document.querySelector('input[name="riotId"]');
    if (!(input instanceof HTMLInputElement)) return false;
    input.dataset.browserQaInstance = 'before-412';
    return true;
  })()`), true);
  const externalIdentity = `External${randomBytes(3).toString("hex")}`;
  const externalBody = {
    riotId: `${externalIdentity}#E01`,
    currentTier: "EMERALD I",
    peakTier: "GRANDMASTER 450",
  };
  const externalMutation = await mutatePlayer(afterBrowserSave.revision, externalBody);
  assert.equal(externalMutation.status, 200, "the concurrent owner mutation must advance the server revision");

  await replaceFieldWithKeyboard(browser, "currentTier", "PLATINUM IV");
  const staleMutation = browser.waitForResponse("/api/auth/me/player", 412);
  await submitWithEnter(browser, "currentTier");
  await staleMutation;
  await browser.waitFor(
    `(() => {
      const riotId = document.querySelector('input[name="riotId"]');
      const currentTier = document.querySelector('input[name="currentTier"]');
      const peakTier = document.querySelector('input[name="peakTier"]');
      return riotId instanceof HTMLInputElement && currentTier instanceof HTMLInputElement && peakTier instanceof HTMLInputElement &&
        riotId.value === ${JSON.stringify(externalBody.riotId)} &&
        currentTier.value === ${JSON.stringify(externalBody.currentTier)} &&
        peakTier.value === ${JSON.stringify(externalBody.peakTier)} &&
        !riotId.dataset.browserQaInstance;
    })()`,
    "HTTP 412 to remount the form with the latest server values",
  );
  const afterStaleAttempt = await playerSnapshot();
  assert.equal(afterStaleAttempt.revision, afterBrowserSave.revision + 1);
  assert.deepEqual(
    {
      riotId: afterStaleAttempt.riotId,
      currentTier: afterStaleAttempt.currentTier,
      peakTier: afterStaleAttempt.peakTier,
    },
    externalBody,
    "the stale browser submission must not overwrite the concurrent mutation",
  );

  process.stdout.write("[db-account-browser] owner Riot ID/tier keyboard save, rendered refresh, and 412 remount passed\n");
} finally {
  await browser.close();
}
