import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import {
  formatPlayerTierEditValue,
  isPlayerMasterPlusTier,
  playerTierEditState,
} from "../../src/modules/players/domain/player-tier";
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

type RenderedTierField = Readonly<{
  value: string;
  selection: string;
  score: string | null;
  label: string;
  optionCount: number;
}>;

type RenderedProfile = Readonly<{
  riotId: RenderedField | null;
  currentTier: RenderedTierField | null;
  peakTier: RenderedTierField | null;
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

async function selectTier(browser: IsolatedChromium, name: "currentTier" | "peakTier", value: string, score?: string) {
  const selector = `select[data-tier-name=${JSON.stringify(name)}]`;
  assert.equal(await browser.evaluate<boolean>(`(() => {
    const select = document.querySelector(${JSON.stringify(selector)});
    if (!(select instanceof HTMLSelectElement)) return false;
    select.value = ${JSON.stringify(value)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`), true, `${name} must expose the tier dropdown`);
  await browser.waitFor(
    `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
    `${name} tier selection`,
  );
  if (score === undefined) return;
  const scoreSelector = `input[data-tier-score=${JSON.stringify(name)}]`;
  await browser.waitFor(
    `document.querySelector(${JSON.stringify(scoreSelector)}) instanceof HTMLInputElement`,
    `${name} LP input`,
  );
  await browser.focus(scoreSelector);
  await browser.selectAll();
  await browser.insertText(score);
  await browser.waitFor(
    `document.querySelector(${JSON.stringify(scoreSelector)})?.value === ${JSON.stringify(score)}`,
    `${name} LP keyboard input`,
  );
}

async function submitWithEnter(browser: IsolatedChromium, selector = 'input[name="riotId"]') {
  await browser.focus(selector);
  assert.equal(await browser.evaluate(`document.activeElement?.matches(${JSON.stringify(selector)})`), true, `${selector} must receive keyboard focus before submit`);
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
    const tierField = (name) => {
      const input = document.querySelector('input[type="hidden"][name="' + name + '"]');
      const select = document.querySelector('select[data-tier-name="' + name + '"]');
      const score = document.querySelector('input[data-tier-score="' + name + '"]');
      if (!(input instanceof HTMLInputElement) || !(select instanceof HTMLSelectElement)) return null;
      return {
        value: input.value,
        selection: select.value,
        score: score instanceof HTMLInputElement ? score.value : null,
        label: select.closest('fieldset')?.querySelector('legend')?.textContent?.trim() ?? '',
        optionCount: select.options.length,
      };
    };
    const facts = Object.fromEntries([...document.querySelectorAll('dl > div')].map((row) => [
      row.querySelector('dt')?.textContent?.trim() ?? '',
      row.querySelector('dd')?.textContent?.trim() ?? '',
    ]));
    return {
      riotId: field('riotId'),
      currentTier: tierField('currentTier'),
      peakTier: tierField('peakTier'),
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
      document.querySelector('select[data-tier-name="currentTier"]') instanceof HTMLSelectElement &&
      document.querySelector('select[data-tier-name="peakTier"]') instanceof HTMLSelectElement &&
      [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('내 플레이어 정보 저장'))`,
    "the hydrated account player form",
  );

  const initialRendered = await readRenderedProfile(browser);
  assert.equal(initialRendered.riotId?.value, initialPlayer.riotId);
  for (const name of ["currentTier", "peakTier"] as const) {
    const persistedValue = initialPlayer[name];
    const expected = playerTierEditState(persistedValue);
    const rendered = initialRendered[name];
    assert.equal(rendered?.selection, expected.tier);
    assert.equal(rendered?.value, formatPlayerTierEditValue(expected.tier, expected.score) ?? "");
    assert.equal(rendered?.score, isPlayerMasterPlusTier(expected.tier) ? expected.score : null);
  }
  assert.equal(initialRendered.riotId?.maxLength, 22);
  assert.match(initialRendered.riotId?.label ?? "", /Riot ID/u);
  assert.match(initialRendered.currentTier?.label ?? "", /현재 티어/u);
  assert.match(initialRendered.peakTier?.label ?? "", /최고 티어/u);
  assert.equal(initialRendered.currentTier?.optionCount, 32);
  assert.equal(initialRendered.peakTier?.optionCount, 32);
  assert.equal(initialRendered.saveButton, "내 플레이어 정보 저장");

  const browserIdentity = `Browser${randomBytes(3).toString("hex")}`;
  const browserBody = {
    riotId: `${browserIdentity}#B01`,
    currentTier: "DIAMOND II",
    peakTier: "MASTER 120",
  };
  await replaceFieldWithKeyboard(browser, "riotId", browserBody.riotId);
  await selectTier(browser, "currentTier", browserBody.currentTier);
  await selectTier(browser, "peakTier", "MASTER", "120");
  const successfulMutation = browser.waitForResponse("/api/auth/me/player", 200);
  await submitWithEnter(browser, 'input[data-tier-score="peakTier"]');
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

  await selectTier(browser, "currentTier", "PLATINUM IV");
  const staleMutation = browser.waitForResponse("/api/auth/me/player", 412);
  await submitWithEnter(browser);
  await staleMutation;
  await browser.waitFor(
    `(() => {
      const riotId = document.querySelector('input[name="riotId"]');
      const currentTier = document.querySelector('input[type="hidden"][name="currentTier"]');
      const peakTier = document.querySelector('input[type="hidden"][name="peakTier"]');
      const currentTierSelect = document.querySelector('select[data-tier-name="currentTier"]');
      const peakTierSelect = document.querySelector('select[data-tier-name="peakTier"]');
      const peakTierScore = document.querySelector('input[data-tier-score="peakTier"]');
      return riotId instanceof HTMLInputElement && currentTier instanceof HTMLInputElement && peakTier instanceof HTMLInputElement &&
        currentTierSelect instanceof HTMLSelectElement && peakTierSelect instanceof HTMLSelectElement && peakTierScore instanceof HTMLInputElement &&
        riotId.value === ${JSON.stringify(externalBody.riotId)} &&
        currentTier.value === ${JSON.stringify(externalBody.currentTier)} &&
        peakTier.value === ${JSON.stringify(externalBody.peakTier)} &&
        currentTierSelect.value === ${JSON.stringify(externalBody.currentTier)} &&
        peakTierSelect.value === 'GRANDMASTER' &&
        peakTierScore.value === '450' &&
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
