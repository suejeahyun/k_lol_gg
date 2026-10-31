import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Script } from "node:vm";
import test from "node:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";
import * as configuration from "../src/modules/community-sites/domain/site-configuration";
import * as network from "../src/modules/community-network/domain/community-network";

function load(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Script(code).runInNewContext({ exports, URL, AbortSignal, Intl, crypto: { randomUUID }, ...globals,
    require(id: string) { assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`); return dependencies[id]; } });
  return exports;
}
function elements(value: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement(value)) return [];
  const node = value as ReactElement<Record<string, unknown>>;
  return [node, ...elements(node.props.children as ReactNode)];
}
function text(value: ReactNode): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isValidElement(value)) return text((value.props as { children?: ReactNode }).children);
  return value == null ? "" : String(value);
}
function harness(path: string, exported: string, initialProps: Record<string, unknown>, responses: (Response | Promise<Response>)[] = []) {
  const hooks: unknown[] = []; let cursor = 0; let confirms = true; let refreshes = 0;
  const requests: { url: string; init?: RequestInit }[] = [];
  const source = load(path, {
    "react/jsx-runtime": jsx,
    react: {
      useState(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial;
        return [hooks[index], (next: unknown) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; },
      useRef(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
      useEffect() {}, useCallback(fn: unknown) { return fn; }, useTransition() { return [false, (fn: () => void) => fn()]; }, useId() { return "search"; },
    },
    "next/link": { default: "a" }, "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/input": { Input: "input" },
    "@/components/forms/use-unsaved-changes": { useUnsavedChanges() {} },
    "./site-configuration-editor": { SiteConfigurationEditor: "editor" },
    "@/modules/community-sites/domain/site-configuration": configuration,
    "@/modules/community-network/domain/community-network": network,
    "./site-workbench.module.css": { default: {} }, "./network.module.css": { default: {} }, "./hub.module.css": { default: {} },
    "@/components/theme/theme-icons": { ArrowRight: "svg", ExternalLink: "svg" },
  }, { window: { confirm: () => confirms }, FormData: class { constructor(private data: Record<string, unknown> = {}) {} get(key: string) { return this.data[key] ?? null; } }, fetch: async (url: string, init?: RequestInit) => { requests.push({ url, init }); assert.ok(responses.length, "Unexpected request"); return responses.shift(); } });
  const Component = source[exported] as (props: Record<string, unknown>) => ReactNode;
  let props = initialProps;
  const render = () => { cursor = 0; return Component(props); };
  const button = (label: string) => { const item = elements(render()).find((item) => item.type === "button" && text(item.props.children as ReactNode) === label); assert.ok(item, `Button missing: ${label}`); return item; };
  const click = async (label: string) => { await (button(label).props.onClick as () => unknown)(); };
  const submit = async (fields?: Record<string, unknown>) => { const form = elements(render()).find((item) => item.type === "form")!; await (form.props.onSubmit as (event: unknown) => unknown)({ preventDefault() {}, currentTarget: fields }); };
  return { source, render, button, click, submit, requests, setConfirm: (value: boolean) => { confirms = value; }, setProps: (value: Record<string, unknown>) => { props = value; }, refreshes: () => refreshes };
}
const config = { ...configuration.createDefaultCommunitySiteConfig(), name: "테스트 커뮤니티", slug: "test-club" };
const community = { id: randomUUID(), slug: "test", name: "테스트", origin: "https://test.example", description: "함께 게임", state: "LISTED" as const };

test("new site retries a malformed successful response with the original idempotency key and draft", async () => {
  const saved = { id: randomUUID(), revision: 1, status: "SUBMITTED", configuration: config, latestJob: null, updatedAt: "2026-10-31T00:00:00Z" };
  const h = harness("src/components/community-sites/site-workbench.tsx", "SiteWorkbench", { mode: "create" }, [new Response("proxy response", { status: 200 }), Response.json({ site: saved })]);
  const editor = elements(h.render()).find((item) => item.type === "editor")!;
  (editor.props.onChange as (value: unknown) => void)(config);
  await h.click("개설 신청하기"); await h.click("개설 신청하기");
  assert.equal(h.requests.length, 2);
  assert.equal(new Headers(h.requests[0].init?.headers).get("Idempotency-Key"), new Headers(h.requests[1].init?.headers).get("Idempotency-Key"));
  assert.equal(h.requests[0].init?.body, h.requests[1].init?.body);
  assert.ok(text(h.render()).includes("심사 대기"));
});

test("same-render double submit sends only one site creation request", async () => {
  let resolve!: (response: Response) => void;
  const waiting = new Promise<Response>((done) => { resolve = done; });
  const h = harness("src/components/community-sites/site-workbench.tsx", "SiteWorkbench", { mode: "create" }, [waiting]);
  (elements(h.render()).find((item) => item.type === "editor")!.props.onChange as (value: unknown) => void)(config);
  const send = h.button("개설 신청하기").props.onClick as () => Promise<void>;
  const first = send(); await send(); assert.equal(h.requests.length, 1);
  resolve(Response.json({}, { status: 503 })); await first;
  assert.ok(text(h.render()).includes("다시 시도"));
});

test("network reload cancellation preserves all edits and sends no request", async () => {
  const initial = network.createCommunityNetworkSnapshot({ communities: [community], rooms: [] }, 3);
  const h = harness("src/app/(admin)/admin/community-network/network-form.tsx", "default", { initial });
  const field = elements(h.render()).find((item) => item.type === "input" && item.props.value === community.name)!;
  (field.props.onChange as (e: unknown) => void)({ target: { value: "수정한 이름" } });
  h.setConfirm(false); await h.click("변경 취소하고 다시 불러오기");
  assert.equal(h.requests.length, 0); assert.ok(elements(h.render()).some((item) => item.props.value === "수정한 이름"));
});

test("network validates incomplete drafts in another tab before making a mutation", async () => {
  const initial = network.createCommunityNetworkSnapshot({ communities: [community], rooms: [] }, 3);
  const h = harness("src/app/(admin)/admin/community-network/network-form.tsx", "default", { initial });
  await h.click("커뮤니티 추가");
  const firstTab = elements(h.render()).find((item) => item.type === "button" && text(item.props.children as ReactNode).startsWith(community.name))!;
  (firstTab.props.onClick as () => void)(); await h.submit();
  assert.equal(h.requests.length, 0);
  assert.ok(text(h.render()).includes("이름 없는 커뮤니티"));
  assert.ok(elements(h.render()).some((item) => item.type === "input" && item.props.maxLength === 80 && item.props.value === ""));
});

test("reverting network edits clears the dirty state", () => {
  const initial = network.createCommunityNetworkSnapshot({ communities: [community], rooms: [] }, 3);
  const h = harness("src/app/(admin)/admin/community-network/network-form.tsx", "default", { initial });
  const change = (value: string) => (elements(h.render()).find((item) => item.type === "input" && item.props.maxLength === 80)!.props.onChange as (e: unknown) => void)({ target: { value } });
  change("다른 이름"); change(community.name);
  assert.ok(text(h.render()).includes("저장 버전 3"));
  assert.equal(elements(h.render()).find((item) => item.props.type === "submit")?.props.disabled, true);
});

test("directory search supports Korean, full-width names, multiple terms, and clear", () => {
  const second = { ...community, id: randomUUID(), name: "NEXUS", origin: "https://nexus.example", description: "친목 게임" };
  const h = harness("src/components/hub/community-cards.tsx", "CommunityCards", { communities: [community, second] });
  const filter = h.source.filterCommunities as (items: unknown[], query: string) => { name: string }[];
  assert.deepEqual(Array.from(filter([community, second], "ＮＥＸＵＳ 친목"), (item) => item.name), ["NEXUS"]);
  assert.equal(filter([community, second], "   ").length, 2);
  assert.equal(filter([community, second], "없는사이트").length, 0);
  (elements(h.render()).find((item) => item.props.type === "search")!.props.onChange as (e: unknown) => void)({ target: { value: "없는사이트" } });
  assert.ok(text(h.render()).includes("검색 결과가 없습니다"));
  (h.button("검색 초기화").props.onClick as () => void)();
  assert.equal(elements(h.render()).filter((item) => item.type === "article").length, 2);
});

test("Kakao uncertain status mutation retries the same command then waits for the new server revision", async () => {
  const room = { id: randomUUID(), displayName: "테스트 방", capabilityProfile: "RECRUIT", revision: 2, status: "ACTIVE", members: [] };
  const h = harness("src/app/(admin)/admin/kakao/rooms/kakao-room-actions.tsx", "KakaoRoomActions", { rooms: [room] }, [Response.json({}, { status: 503 }), Response.json({ ok: true, revision: 3 })]);
  await h.click("일시 중지"); await new Promise(setImmediate);
  assert.equal(h.button("연결 해제").props.disabled, true);
  await h.click("요청 결과 다시 확인"); await new Promise(setImmediate);
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].init?.body, h.requests[1].init?.body);
  assert.equal(new Headers(h.requests[0].init?.headers).get("Idempotency-Key"), new Headers(h.requests[1].init?.headers).get("Idempotency-Key"));
  assert.equal(h.refreshes(), 1); assert.equal(h.button("연결 해제").props.disabled, true);
  h.setProps({ rooms: [{ ...room, status: "PAUSED", revision: 3 }] });
  assert.equal(h.button("연결 해제").props.disabled, false);
});

test("Kakao conflict refreshes server data and does not offer an ambiguous retry", async () => {
  const room = { id: randomUUID(), displayName: "테스트 방", capabilityProfile: "RECRUIT", revision: 2, status: "ACTIVE", members: [] };
  const h = harness("src/app/(admin)/admin/kakao/rooms/kakao-room-actions.tsx", "KakaoRoomActions", { rooms: [room] }, [Response.json({}, { status: 409 })]);
  await h.click("일시 중지"); await new Promise(setImmediate);
  assert.ok(text(h.render()).includes("다른 변경이 먼저"));
  assert.ok(!text(h.render()).includes("요청 결과 다시 확인")); assert.equal(h.refreshes(), 1);
});

test("Kakao lost pairing response is retried once without generating another code and explains a non-recoverable code", async () => {
  const h = harness("src/app/(admin)/admin/kakao/rooms/kakao-room-actions.tsx", "KakaoRoomActions", { rooms: [] }, [Response.json({}, { status: 503 }), Response.json({ ok: true, code: null, expiresAt: "2026-10-31T12:30:00Z", replayed: true }, { status: 201 })]);
  await h.submit({ displayName: "테스트 방", capabilityProfile: "RECRUIT" }); await new Promise(setImmediate);
  await h.click("요청 결과 다시 확인"); await new Promise(setImmediate);
  assert.equal(h.requests.length, 2);
  assert.equal(new Headers(h.requests[0].init?.headers).get("Idempotency-Key"), new Headers(h.requests[1].init?.headers).get("Idempotency-Key"));
  assert.ok(text(h.render()).includes("최초 응답에서만 표시"));
  assert.equal(h.button("10분 연결 코드 발급").props.disabled, false);
});

test("unsaved guard blocks same-origin navigation but allows hash links, new tabs, downloads, and modifier clicks", () => {
  let effect: () => void | (() => void) = () => {};
  const windowListeners = new Map<string, (event: unknown) => void>();
  const documentListeners = new Map<string, (event: unknown) => void>();
  let prompts = 0;
  class FakeElement { closest() { return this; } }
  class Anchor extends FakeElement {
    target = ""; download = false;
    constructor(readonly href: string) { super(); }
    hasAttribute(name: string) { return name === "download" && this.download; }
  }
  const source = load("src/components/forms/use-unsaved-changes.ts", { react: { useEffect(callback: typeof effect) { effect = callback; } } }, {
    Element: FakeElement, HTMLAnchorElement: Anchor,
    window: { location: new URL("https://hub.example/sites/new"), confirm: () => { prompts++; return false; }, addEventListener: (name: string, callback: (event: unknown) => void) => windowListeners.set(name, callback), removeEventListener: (name: string) => windowListeners.delete(name) },
    document: { addEventListener: (name: string, callback: (event: unknown) => void) => documentListeners.set(name, callback), removeEventListener: (name: string) => documentListeners.delete(name) },
  });
  (source.useUnsavedChanges as (dirty: boolean) => void)(true); const cleanup = effect();
  const click = (anchor: Anchor, overrides: Record<string, unknown> = {}) => {
    let blocked = false;
    documentListeners.get("click")!({ target: anchor, button: 0, preventDefault: () => { blocked = true; }, stopPropagation() {}, ...overrides });
    return blocked;
  };
  assert.equal(click(new Anchor("https://hub.example/sites")), true);
  assert.equal(click(new Anchor("https://hub.example/sites/new#preview")), false);
  const blank = new Anchor("https://hub.example/sites"); blank.target = "_blank"; assert.equal(click(blank), false);
  const download = new Anchor("https://hub.example/download"); download.download = true; assert.equal(click(download), false);
  assert.equal(click(new Anchor("https://hub.example/sites"), { ctrlKey: true }), false);
  assert.equal(click(new Anchor("https://hub.example/sites"), { defaultPrevented: true }), false);
  assert.equal(prompts, 1);
  let unloadBlocked = false;
  windowListeners.get("beforeunload")!({ preventDefault: () => { unloadBlocked = true; } }); assert.equal(unloadBlocked, true);
  assert.equal(typeof cleanup, "function"); cleanup!(); assert.equal(windowListeners.size, 0); assert.equal(documentListeners.size, 0);
  (source.useUnsavedChanges as (dirty: boolean) => void)(false); effect(); assert.equal(windowListeners.size, 0);
});
