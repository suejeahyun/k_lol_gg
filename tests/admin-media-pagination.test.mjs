import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createElement, isValidElement } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function load(path, dependencies = {}) {
  const compiledModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: compiledModule.exports, URL, URLSearchParams, require(specifier) { assert.ok(Object.hasOwn(dependencies, specifier), specifier); return dependencies[specifier]; } });
  return compiledModule.exports;
}
const media = load("../src/modules/media/application/media-service.ts", {
  "node:crypto": crypto,
  "@/platform/legacy-identifiers": load("../src/platform/legacy-identifiers.ts", { "node:crypto": crypto }),
  "../domain/media-content": load("../src/modules/media/domain/media-content.ts"),
});
async function render(kind, searchParams = {}, { total = 31, state = "ready", editorStatus } = {}) {
  let query, calls = 0;
  const read = async (value) => {
    query = value;
    const totalPages = Math.max(1, Math.ceil(total / value.pageSize)), currentPage = Math.min(value.page, totalPages);
    return { totalCount: total, totalPages, currentPage, pageSize: value.pageSize,
      items: Array.from({ length: Math.min(value.pageSize, Math.max(0, total - (currentPage - 1) * value.pageSize)) }, (_, index) => ({ id: `synthetic-${(currentPage - 1) * value.pageSize + index + 1}`, title: `합성 콘텐츠 ${(currentPage - 1) * value.pageSize + index + 1}`, description: "합성 내용", status: value.status ?? "DRAFT", revision: 0 })) };
  };
  const pages = load("../src/components/admin/media/admin-media-pages.tsx", {
    "react/jsx-runtime": jsx, "next/link": (props) => createElement("a", props), "next/navigation": { notFound() { throw new Error("unexpected notFound"); } },
    "@/components/theme/theme-icons": new Proxy({}, { get: () => () => null }),
    "@/modules/auth/infrastructure/server-authorization": { requirePageRole: async () => ({ role: "ADMIN" }) },
    "@/modules/media": media,
    "@/modules/media/infrastructure/media-private-assets": { isRuntimeMediaAssetUploadAvailable: () => true },
    "@/modules/media/infrastructure/runtime-media": { loadRuntimeMedia: async (callback) => { calls++; return state === "ready" ? { state, data: await callback({ listAdminHighlights: read, listAdminGalleries: read, getAdminHighlight: async () => ({ id: "synthetic", title: "합성 콘텐츠", status: editorStatus, revision: 2 }), getAdminGallery: async () => ({ id: "synthetic", title: "합성 콘텐츠", status: editorStatus, revision: 2 }) }) } : { state }; } },
    "./admin-media-form": { AdminMediaForm: () => null },
    "./admin-media.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, name) => String(name) }) },
  });
  const element = await (editorStatus ? pages.AdminMediaEditorPage({ kind, id: "synthetic" }) : pages.AdminMediaListPage({ kind, searchParams: Promise.resolve(searchParams) }));
  const filter = [element.props.children].flat().find((child) => isValidElement(child) && child.type === "form");
  return { html: renderToStaticMarkup(element), query, calls, filterKey: filter?.key };
}
function links(html, text) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gu)].filter((match) => match[2] === text).map((match) => new URL(match[1].replaceAll("&amp;", "&"), "https://test.invalid"));
}
for (const kind of ["highlight", "gallery"]) {
  const path = kind === "highlight" ? "/admin/highlights" : "/admin/images";
  test(`${kind}: later pages remain reachable with status and page size`, async () => {
    const { html } = await render(kind, { page: "2", pageSize: "10", status: "DRAFT" });
    assert.match(html, /합성 콘텐츠 11/);
    for (const [label, page] of [["이전", 1], ["다음", 3]]) {
      const [url] = links(html, label); assert.ok(url, label); assert.equal(url.pathname, path);
      const parsed = media.parseMediaAdminListQuery(url.href);
      assert.equal(parsed.page, page); assert.equal(parsed.pageSize, 10); assert.equal(parsed.status, "DRAFT");
    }
    assert.match(html, /2 \/ 4/);
    assert.doesNotMatch(html, /name="page"/);
  });
  test(`${kind}: all-status native GET works and filtered empty state has a reset`, async () => {
    const all = await render(kind, { status: "", pageSize: "20" });
    assert.equal(all.calls, 1); assert.equal(all.query.status, null);
    assert.match(all.html, /합성 콘텐츠 1/);
    const empty = await render(kind, { status: "ARCHIVED", pageSize: "10" }, { total: 0 });
    assert.match(empty.html, /조건에 맞는/);
    const [reset] = links(empty.html, "전체 보기"); assert.ok(reset); assert.equal(reset.pathname, path);
    const parsed = media.parseMediaAdminListQuery(reset.href); assert.equal(parsed.status, null); assert.equal(parsed.page, 1);
  });
  test(`${kind}: boundaries use server-clamped current page without impossible directions`, async () => {
    const first = await render(kind, { pageSize: "10" }, { total: 21 });
    assert.equal(links(first.html, "이전").length, 0); assert.equal(links(first.html, "다음").length, 1);
    const last = await render(kind, { page: "99", pageSize: "10", status: "PUBLISHED" }, { total: 21 });
    assert.match(last.html, /3 \/ 3/); assert.match(last.html, /합성 콘텐츠 21/);
    assert.equal(links(last.html, "다음").length, 0);
    assert.equal(media.parseMediaAdminListQuery(links(last.html, "이전")[0].href).page, 2);
  });
  test(`${kind}: invalid parameters recover without loading or relaxing strict validation`, async () => {
    for (const invalid of [{ page: "0" }, { page: "no" }, { status: ["", "DRAFT"] }, { status: "OTHER" }, { unknown: "x" }]) {
      const result = await render(kind, invalid); assert.equal(result.calls, 0);
      assert.match(result.html, /목록 조건을 확인해 주세요/);
      const [reset] = links(result.html, "목록 초기화"); assert.ok(reset); assert.equal(reset.pathname, path); assert.equal(reset.search, "");
    }
  });
  test(`${kind}: load failure retries the same validated page and filter`, async () => {
    const result = await render(kind, { page: "2", pageSize: "10", status: "DRAFT" }, { state: "error" });
    const [url] = links(result.html, "다시 불러오기"); assert.ok(url);
    const parsed = media.parseMediaAdminListQuery(url.href); assert.equal(parsed.page, 2); assert.equal(parsed.pageSize, 10); assert.equal(parsed.status, "DRAFT");
  });
  test(`${kind}: publication labels are readable and a published editor opens its public page`, async () => {
    const list = await render(kind);
    assert.match(list.html, /value="DRAFT"[^>]*>초안<\/option>/);
    assert.match(list.html, /value="PUBLISHED"[^>]*>게시됨<\/option>/);
    assert.match(list.html, /value="ARCHIVED"[^>]*>보관됨<\/option>/);
    for (const [editorStatus, label] of [["DRAFT", "초안"], ["PUBLISHED", "게시됨"], ["ARCHIVED", "보관됨"]]) {
      const editor = await render(kind, {}, { editorStatus });
      assert.ok(editor.html.includes(`${label} · 변경 버전 2`));
      const publicLinks = links(editor.html, "공개 화면 보기");
      assert.equal(publicLinks.length, editorStatus === "PUBLISHED" ? 1 : 0);
      if (publicLinks.length) assert.equal(publicLinks[0].pathname, `${path.replace("/admin", "")}/synthetic`);
    }
  });
  test(`${kind}: filter controls remount when the applied page or filter changes`, async () => {
    const first = await render(kind, { page: "1", status: "DRAFT", pageSize: "10" });
    for (const changed of [{ page: "2", status: "DRAFT", pageSize: "10" }, { page: "1", status: "PUBLISHED", pageSize: "10" }, { page: "1", status: "DRAFT", pageSize: "20" }]) {
      assert.notEqual((await render(kind, changed)).filterKey, first.filterKey, "unapplied select edits must not survive a new applied query");
    }
  });
}
