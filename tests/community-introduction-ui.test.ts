import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as introductionDomain from "../src/modules/operations/domain/community-introduction";

function load(path: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Script(code, { filename: path }).runInNewContext({ exports, URL, Response, Request, ...globals, require(id: string) {
    assert.ok(Object.hasOwn(dependencies, id), `Unexpected dependency ${id}`); return dependencies[id];
  } });
  return exports;
}
const css = { default: {} };
const link = { default: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) };
const icons = { ArrowRight: () => null, ExternalLink: () => null };
const content = load("src/components/community-introduction/introduction-content.tsx", {
  "react/jsx-runtime": jsx, "@/modules/operations/domain/community-introduction": introductionDomain, "./introduction.module.css": css,
});
const Content = content.IntroductionContent as (props: { profile: introductionDomain.CommunityIntroduction }) => ReactNode;
const profile = () => ({ ...introductionDomain.createDefaultCommunityIntroduction(), published: true, summary: "우리 커뮤니티", introduction: "함께 게임합니다.\n처음 오신 분도 환영합니다." });

test("public introduction renders plain text and validates draft URLs before emitting browser resources", () => {
  const html = renderToStaticMarkup(createElement(Content, { profile: { ...profile(), summary: '<script>alert("x")</script>',
    introduction: '<img src=x onerror="alert(1)">\n두 번째 줄', contactUrl: "javascript:alert(1)", bannerUrl: "data:image/svg+xml,<svg/>" } }));
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<script")); assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("javascript:")); assert.ok(!html.includes("data:image"));
  assert.ok(html.includes("\n두 번째 줄")); assert.ok(!html.includes("주로 활동하는 시간"));
});

test("public introduction isolates external links and sends no referrer with optional banner", () => {
  const html = renderToStaticMarkup(createElement(Content, { profile: { ...profile(), bannerUrl: "https://images.example/banner.png", contactUrl: "https://contact.example/help" } }));
  assert.ok(html.includes('referrerPolicy="no-referrer"'));
  assert.ok(html.includes('alt=""')); assert.ok(html.includes('loading="lazy"'));
  assert.ok(html.includes('rel="noopener noreferrer"')); assert.ok(html.includes("(새 창)"));
});

const detail = load("src/components/hub/hub-community-detail.tsx", {
  "react/jsx-runtime": jsx, "next/link": link, "@/components/theme/theme-icons": icons,
  "@/components/community-introduction/introduction-content": content, "./hub.module.css": css,
});
const Detail = detail.HubCommunityDetail as (props: { community: { id: string; name: string; origin: string; description: string }; introduction: unknown }) => ReactNode;
const community = { id: "86e8850f-17c6-4267-90a6-942b7d04a315", name: "테스트 커뮤니티", origin: "https://community.example", description: "등록된 기본 설명" };

test("unpublished, unsupported and temporarily unavailable introductions preserve the registered description and visit link", () => {
  for (const state of ["unpublished", "unsupported", "unavailable"]) {
    const html = renderToStaticMarkup(createElement(Detail, { community, introduction: { state } }));
    assert.ok(html.includes("등록된 기본 설명")); assert.ok(html.includes('href="https://community.example"'));
    assert.ok(html.includes('role="status"')); assert.ok(!html.includes("사이트 운영진이 작성한 소개"));
    assert.ok(!html.includes("연결됨"));
  }
});

test("published introduction displays source content with update date without draft publication controls", () => {
  const html = renderToStaticMarkup(createElement(Detail, { community, introduction: { state: "ready", data: {
    version: 1, origin: community.origin, updatedAt: "2026-10-29T00:00:00.000Z", profile: profile(),
  } } }));
  assert.ok(html.includes("함께 게임합니다.")); assert.match(html, /datetime="2026-10-29T00:00:00\.000Z"/iu);
  assert.ok(!html.includes("등록된 기본 설명")); assert.ok(!html.includes("checkbox"));
});

test("detail page only fetches a registered public site and does not fetch remote content for metadata", async () => {
  let found: typeof community | null = community;
  let unavailable = false;
  let remoteCalls = 0;
  let lookups = 0;
  const page = load("src/app/(public)/community-network/[id]/page.tsx", {
    "react/jsx-runtime": jsx, react: { cache: (fn: unknown) => fn },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/lib/service-brand": { SERVICE_BRAND: { id: "hub" } },
    "@/modules/community-network/infrastructure/hub-community-directory": {
      findHubCommunity: async () => { lookups++; if (unavailable) throw new Error("HUB_DIRECTORY_UNAVAILABLE"); return found; },
      loadHubCommunityIntroduction: async () => { remoteCalls++; return { state: "unpublished" }; },
    },
    "@/components/hub/hub-community-detail": detail,
  });
  const render = page.default as (props: { params: Promise<{ id: string }> }) => Promise<ReactNode>;
  const metadata = page.generateMetadata as typeof render;
  const props = { params: Promise.resolve({ id: community.id }) };
  await metadata(props); assert.equal(remoteCalls, 0);
  await render(props); assert.equal(remoteCalls, 1);
  found = null; await assert.rejects(render(props), /NOT_FOUND/); assert.equal(remoteCalls, 1);
  const beforeInvalid = lookups; await assert.rejects(render({ params: Promise.resolve({ id: "not-a-uuid" }) }), /NOT_FOUND/); assert.equal(lookups, beforeInvalid);
  unavailable = true; const unavailableHtml = renderToStaticMarkup(await render(props));
  assert.ok(unavailableHtml.includes("삭제되었다는 뜻은 아닙니다")); assert.equal(remoteCalls, 1);
});

test("HUB cards offer separate introduction and visit actions without requesting child profiles", async () => {
  let listCalls = 0;
  const source = load("src/components/hub/hub-directory.tsx", {
    "react/jsx-runtime": jsx, "next/link": link, "./hub.module.css": css,
    "@/components/theme/theme-icons": { ...icons, AppWindow: () => null, LibraryBig: () => null, Share2: () => null, ShieldCheck: () => null },
    "@/modules/community-network/infrastructure/hub-community-directory": {
      listHubCommunities: async () => { listCalls++; return { communities: [community], unavailable: true }; },
    },
  });
  const directory = source.HubDirectory as (props: { overview?: boolean }) => Promise<ReactNode>;
  const html = renderToStaticMarkup(await directory({}));
  assert.equal(listCalls, 1); assert.ok(html.includes(`href="/community-network/${community.id}"`));
  assert.ok(html.includes(`href="${community.origin}"`)); assert.ok(html.includes("일부 사이트 정보"));
  assert.ok(!html.includes("첫 커뮤니티를 기다리고 있습니다"));
});

test("site introduction editor authorizes ADMIN and does not expose a HUB editor", async () => {
  const roles: string[] = []; let reads = 0; const brand = { id: "nexus", name: "NEXUS" };
  const page = load("src/app/(admin)/admin/community-introduction/page.tsx", {
    "react/jsx-runtime": jsx, "./introduction-editor.module.css": css,
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } }, "@/lib/service-brand": { SERVICE_BRAND: brand },
    "@/modules/auth/infrastructure/server-authorization": { requirePageRole: async (role: string) => { roles.push(role); } },
    "@/modules/operations/infrastructure/runtime-operations": { loadRuntimeOperations: async () => { reads++; return { state: "unavailable" }; } },
    "./introduction-form": { CommunityIntroductionForm: () => createElement("div", null, "EDITOR") },
  });
  const render = page.default as () => Promise<ReactNode>;
  const html = renderToStaticMarkup(await render());
  assert.deepEqual(roles, ["ADMIN"]); assert.equal(reads, 1); assert.ok(html.includes("저장된 소개가 없다는 뜻은 아닙니다")); assert.ok(!html.includes("EDITOR"));
  brand.id = "hub"; await assert.rejects(render(), /NOT_FOUND/); assert.equal(reads, 1);
});

type Element = ReactElement<Record<string, unknown>>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children as ReactNode)];
}
function formHarness(responses: Response[]) {
  const hooks: unknown[] = []; let cursor = 0;
  const requests: { url: string; init?: RequestInit }[] = [];
  const source = load("src/app/(admin)/admin/community-introduction/introduction-form.tsx", {
    "react/jsx-runtime": jsx, react: {
      useState(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = initial; return [hooks[index], (next: unknown) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; },
      useRef(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
      useEffect() {},
    },
    "@/components/ui/button": { Button: "button" }, "@/components/ui/input": { Input: "input" },
    "@/components/community-introduction/introduction-content": content,
    "@/modules/operations/domain/community-introduction": introductionDomain, "./introduction-editor.module.css": css,
  }, { crypto: { randomUUID }, fetch: async (url: string, init?: RequestInit) => { requests.push({ url, init }); assert.ok(responses.length); return responses.shift(); } });
  const Form = source.CommunityIntroductionForm as (props: { initial: introductionDomain.CommunityIntroductionSnapshot; communityName: string }) => ReactNode;
  const initial = { revision: 3, updatedAt: null, profile: profile() };
  function render() { cursor = 0; return Form({ initial, communityName: "사이트" }); }
  function changeIntro(value: string) {
    const field = elements(render()).find((element) => element.props.id === "intro-introduction")!;
    (field.props.onChange as (event: unknown) => void)({ target: { value } });
  }
  async function submit() { const form = elements(render()).find((element) => element.type === "form")!; await (form.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault() {} }); }
  return { render, changeIntro, submit, requests };
}

test("ambiguous save failure preserves the editor and retries the same payload with the same idempotency key", async () => {
  const next = { revision: 4, updatedAt: "2026-10-29T00:00:00.000Z", profile: { ...profile(), introduction: "수정한 내용" } };
  const h = formHarness([Response.json({}, { status: 503 }), Response.json({ introduction: next })]);
  h.changeIntro("수정한 내용"); await h.submit();
  assert.equal(elements(h.render()).find((element) => element.props.id === "intro-introduction")?.props.value, "수정한 내용");
  await h.submit();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[0].init?.body, h.requests[1].init?.body);
  assert.equal(new Headers(h.requests[0].init?.headers).get("Idempotency-Key"), new Headers(h.requests[1].init?.headers).get("Idempotency-Key"));
  assert.equal(new Headers(h.requests[1].init?.headers).get("If-Match"), '"3"');
  assert.ok(renderToStaticMarkup(h.render()).includes("저장 버전 4"));
  assert.equal(elements(h.render()).find((element) => element.props.type === "submit")?.props.disabled, true);
});

test("revision conflict keeps edited text and explicitly offers a fresh reload", async () => {
  const h = formHarness([Response.json({}, { status: 412 })]);
  h.changeIntro("충돌 시 보존할 내용"); await h.submit();
  const html = renderToStaticMarkup(h.render());
  assert.ok(html.includes("충돌 시 보존할 내용")); assert.ok(html.includes("다른 관리자가 먼저 저장했습니다"));
  assert.ok(html.includes("편집 취소하고 최신 소개 불러오기")); assert.ok(html.includes('role="alert"'));
});
