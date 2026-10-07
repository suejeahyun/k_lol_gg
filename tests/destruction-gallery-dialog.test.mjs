import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const pagePath = "src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/page.tsx";
const tournamentId = "41c9a56a-657d-4cda-a27b-ec49e512d6c6";
const image = { assetId: "synthetic-gallery-image", ordinal: 0, url: "https://example.invalid/synthetic-gallery-image.webp" };
const fixture = { id: tournamentId, revision: 1, title: "합성 대회", status: "COMPLETED", gameMode: "CLASSIC", teams: [], unassignedPlayers: [], recruitment: [], preliminaryFixtures: [], tournamentFixtures: [], qualifiedTeamIds: [], preliminaryBestOf: 1, preliminaryFormat: "ROUND_ROBIN", advanceTeamCount: 0, mvpResults: [], championTeamName: null, gallery: { title: "합성 갤러리", description: "", images: [image] } };
function find(tree, predicate) { if (!React.isValidElement(tree)) return null; if (predicate(tree)) return tree; for (const child of React.Children.toArray(tree.props.children)) { const result = find(child, predicate); if (result) return result; } return null; }

async function renderPage() {
  const effects = [], cleanups = [], frames = new Map(), modules = new Map(), elements = new Map(), clicks = [];
  const document = { body: { style: { overflow: "auto" } }, activeElement: null, getElementById(id) { return elements.get(id) ?? null; } };
  let frameId = 0;
  class Element {
    isConnected = true;
    open = false;
    modal = false;
    focus() { document.activeElement = this; }
    showModal() { this.open = true; this.modal = true; }
    close() { this.open = false; this.modal = false; }
    click() { clicks.push(this.props.href); }
  }
  const Image = () => null;
  function mount(tree) {
    if (!React.isValidElement(tree)) return tree;
    if (typeof tree.type === "function" && tree.type.name === "DestructionGalleryLightbox") return mount(tree.type(tree.props));
    const element = new Element(); element.props = tree.props;
    if (tree.props.id) elements.set(tree.props.id, element);
    if (tree.props.role === "dialog") elements.set("dialog", element);
    if (tree.props["aria-label"] === "이미지 닫기") elements.set("close", element);
    if (tree.props.ref) tree.props.ref.current = element;
    return React.cloneElement(tree, {}, ...React.Children.toArray(tree.props.children).map(mount));
  }
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} }; modules.set(filename, loaded);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { exports: loaded.exports, URLSearchParams, document, window: { requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); } }, require(name) {
      if (name === "react") return { cache: value => value, useRef: value => ({ current: value }), useEffect: callback => effects.push(callback) };
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next/link") return { __esModule: true, default: "a" };
      if (name === "next/navigation") return { notFound() { throw new Error("UNEXPECTED_NOT_FOUND"); } };
      if (name.endsWith("/list-return")) return { BackToList: () => null };
      if (name.endsWith("/site-seo")) return {};
      if (name.endsWith("/theme-icons")) return new Proxy({}, { get: () => () => null });
      if (name.endsWith("/resilient-media-image")) return { ResilientMediaImage: Image };
      if (name.endsWith("/runtime-session")) return { getCurrentSession: async () => null };
      if (name.endsWith("/destruction")) return { isDestructionUuid: () => true };
      if (name.endsWith("/runtime-destruction")) return { getRuntimeDestruction: () => ({ repository: { getPublic: async () => fixture } }) };
      if (name.endsWith("/public-navigation")) return { parseDestructionDetailView: () => ({ tab: "gallery", imageIndex: 0, playerId: null, action: null }) };
      if (name.endsWith("/core")) return new Proxy({}, { get: () => value => value });
      if (name.endsWith("/legacy-user-redirects") || name.endsWith("/admin-player") || name.endsWith("/runtime-public-player-legacy-mapping") || name.endsWith("/legacy-identifiers")) return {};
      if (name.endsWith("destruction-owner-actions")) return { DestructionOwnerActions: () => null };
      if (name.endsWith("/public-progress")) return { DestructionPublicProgress: () => null, DestructionRulesAndStandings: () => null };
      if (name.endsWith("/score-table")) return { DestructionScoreTable: () => null };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
      if (name === "./gallery-lightbox") return load(path.join(path.dirname(filename), "gallery-lightbox.tsx"));
      throw new Error(`Unexpected page dependency: ${name}`);
    } });
    return loaded.exports;
  }
  const page = await load(path.join(root, pagePath)).default({ params: Promise.resolve({ tournamentId }), searchParams: Promise.resolve({ tab: "gallery", imageIndex: "0" }) });
  const tree = mount(page);
  for (const effect of effects) cleanups.push(effect());
  return { tree, Image, document, elements, clicks, flushFrames() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); }, unmount() { cleanups.forEach(cleanup => cleanup?.()); } };
}

test("gallery deep link starts a native modal at its close action", async () => {
  const subject = await renderPage(); subject.flushFrames();
  assert.equal(subject.elements.get("dialog").modal, true, "a declared aria-modal aside does not make the background inert");
  assert.equal(subject.document.activeElement, subject.elements.get("close"));
  assert.equal(subject.document.body.style.overflow, "hidden");
});
test("gallery modal contains Tab and Shift+Tab within its one close control", async () => {
  const subject = await renderPage(); subject.flushFrames();
  const dialog = find(subject.tree, node => node.props.role === "dialog");
  for (const shiftKey of [false, true]) {
    let prevented = false;
    dialog.props.onKeyDown?.({ key: "Tab", shiftKey, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(subject.document.activeElement, subject.elements.get("close"));
  }
});
test("Escape follows the same gallery close link without replacing browser history", async () => {
  const subject = await renderPage(); subject.flushFrames();
  const dialog = find(subject.tree, node => node.props.role === "dialog");
  let prevented = false;
  dialog.props.onCancel?.({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(subject.clicks, ["?tab=gallery"]);
});
test("close or browser-back cleanup restores scrolling and the original image link", async () => {
  const subject = await renderPage(); subject.flushFrames();
  subject.unmount(); subject.flushFrames();
  assert.equal(subject.document.body.style.overflow, "auto");
  assert.equal(subject.elements.get("dialog").open, false);
  const original = subject.elements.get("destruction-gallery-image-0");
  assert.ok(original, "the source image link needs a stable focus target after query navigation");
  assert.equal(subject.document.activeElement, original);
});
test("gallery keeps the existing image, ordinal, accessible name and URL paths", async () => {
  const subject = await renderPage();
  const dialog = find(subject.tree, node => node.props.role === "dialog");
  assert.equal(dialog.props["aria-labelledby"], "competition-image-title");
  const close = find(dialog, node => node.props["aria-label"] === "이미지 닫기");
  assert.equal(close.props.href, "?tab=gallery");
  const renderedImage = find(dialog, node => node.type === subject.Image);
  assert.deepEqual(renderedImage.props, { sizes: "100vw", src: image.url, alt: "합성 갤러리 1번째 이미지 확대" });
  assert.ok(find(subject.tree, node => node.props.href === "?tab=gallery&imageIndex=0"));
});
