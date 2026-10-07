import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const row = { playerId: "2fcb03af-d4fd-4b6b-88dd-e505bb310c92", linkId: "9df48924-a8b0-40c2-8c96-e9e77b4bc2d4", displayName: "합성 모달 선수", riotId: "합성선수#KR1", status: "CONNECTED", revision: 1 };
const tick = () => new Promise((resolve) => setImmediate(resolve));
function find(tree, predicate) { if (!React.isValidElement(tree)) return null; if (predicate(tree)) return tree; for (const child of React.Children.toArray(tree.props.children)) { const found = find(child, predicate); if (found) return found; } return null; }
const button = (tree, label) => find(tree, (node) => node.type === "button" && node.props.children === label);
const dialog = (tree) => find(tree, (node) => node.props.role === "dialog");
const success = { ok: true, json: async () => ({ successCount: 1, skippedCount: 0, failedCount: 0, remainingCount: 0 }) };
function harness(kind, send = () => success) {
  const slots = [], effects = [], requests = [], frames = new Map(), elements = new Map();
  const document = { activeElement: null, body: { style: { overflow: "auto" } } };
  let cursor = 0, frameId = 0;
  class Element {
    isConnected = true; children = []; disabled = false;
    focus() { document.activeElement = this; }
    hasAttribute(name) { return Boolean(this.props[name]); }
    contains(value) { return value === this || this.children.some((child) => child.contains(value)); }
    querySelectorAll() { return this.children.flatMap((child) => [...(child.type === "button" && !child.disabled ? [child] : []), ...child.querySelectorAll()]); }
  }
  function mount(tree, address = "root") {
    if (!React.isValidElement(tree)) return null;
    const id = tree.props.role ?? (tree.type === "button" ? tree.props.children : address);
    const existing = elements.get(id), element = existing ?? new Element(); elements.set(id, element);
    element.type = tree.type; element.props = tree.props; element.disabled = Boolean(tree.props.disabled);
    element.children = React.Children.toArray(tree.props.children).map((child, index) => mount(child, `${address}.${index}`)).filter(Boolean);
    if (tree.props.ref && typeof tree.props.ref === "object") tree.props.ref.current = element;
    if (!existing && tree.props.autoFocus) element.focus();
    return element;
  }
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useEffect(callback, deps) { const index = cursor++, previous = slots[index]; if (!previous || deps.some((value, position) => !Object.is(value, previous.deps[position]))) effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: callback() }; }); },
  };
  const loaded = { exports: {} };
  const source = readFileSync(new URL("../src/components/riot/riot-admin-actions.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports: loaded.exports, crypto: webcrypto, document, HTMLElement: Element,
    window: { requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); } },
    fetch: async (path, options) => { requests.push({ path, ...options }); return send(); },
    require(name) { if (name === "react") return hooks; if (name === "react/jsx-runtime") return jsx; if (name.endsWith("/bounded-picker")) return { BoundedPicker: () => null }; if (name.endsWith(".module.css")) return { __esModule: true, default: {} }; throw new Error(`Unexpected dependency: ${name}`); },
  });
  const props = kind === "sync" ? { superAdmin: true, items: [row] } : { items: [row], q: "합성", batchSize: 1, remainingBefore: 1 };
  const subject = { requests, document, element: (label) => elements.get(label),
    render() { cursor = 0; const tree = loaded.exports[kind === "sync" ? "RiotAdminGlobalActions" : "RiotAdminBulkLink"](props); mount(tree); effects.splice(0).forEach((effect) => effect()); return tree; },
    flushFrames() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); },
    open() { if (kind === "sync") { find(subject.render(), (node) => node.props.type === "checkbox").props.onChange(); find(subject.render(), (node) => node.type === "form" && !node.props.id).props.onSubmit({ preventDefault() {} }); } else button(subject.render(), "일괄 연결 확인").props.onClick(); return subject.render(); },
  };
  return subject;
}

for (const kind of ["sync", "link"]) {
  test(`${kind}: cancel focus, both Tab boundaries, Escape and trigger restoration execute without requests`, () => {
    const subject = harness(kind), opened = subject.open(); subject.flushFrames();
    const modal = dialog(opened), confirm = kind === "sync" ? "등록 확인" : "연결 실행", trigger = kind === "sync" ? "선택 일괄 동기화 미리보기" : "일괄 연결 확인";
    assert.equal(subject.document.activeElement, subject.element("취소"));
    for (const [start, shiftKey, end] of [[confirm, false, "취소"], ["취소", true, confirm]]) {
      subject.element(start).focus(); let prevented = false;
      modal.props.onKeyDown({ key: "Tab", shiftKey, preventDefault() { prevented = true; } });
      assert.equal(prevented, true); assert.equal(subject.document.activeElement, subject.element(end));
    }
    assert.equal(subject.document.body.style.overflow, "hidden");
    modal.props.onKeyDown({ key: "Escape", preventDefault() {} });
    assert.equal(dialog(subject.render()), null); subject.flushFrames();
    assert.equal(subject.document.activeElement, subject.element(trigger));
    assert.equal(subject.document.body.style.overflow, "auto");
    assert.equal(subject.requests.length, 0);
  });
}

test("sync: open preview locks background submissions and freezes the selected request until explicit confirmation", async () => {
  const subject = harness("sync");
  const before = subject.render(), single = find(before, (node) => node.props.id === "riot-single-link");
  subject.open();
  single.props.onSubmit({ preventDefault() {} }); button(before, "전체 동기화").props.onClick();
  const opened = subject.render();
  assert.equal(find(opened, (node) => node.props.id === "riot-single-link").props.inert, true);
  assert.equal(find(opened, (node) => node.type === "form" && !node.props.id).props.inert, true);
  find(opened, (node) => node.props.type === "checkbox").props.onChange();
  assert.equal(subject.requests.length, 0);
  const confirm = button(subject.render(), "등록 확인").props.onClick; confirm(); confirm(); await tick();
  assert.equal(subject.requests.length, 1);
  assert.equal(subject.requests[0].path, "/api/admin/riot/bulk");
  assert.deepEqual(JSON.parse(subject.requests[0].body), { linkIds: [row.linkId] });
  assert.equal(dialog(subject.render()), null);
});

test("link: pending Escape stays locked, errors remain in the modal and a completed request restores focus", async () => {
  let finish;
  const subject = harness("link", () => new Promise((resolve) => { finish = resolve; }));
  subject.open();
  const confirm = button(subject.render(), "연결 실행").props.onClick; confirm(); confirm();
  let tree = subject.render(), modal = dialog(tree);
  assert.equal(subject.requests.length, 1);
  assert.equal(button(modal, "취소").props.disabled, true);
  modal.props.onKeyDown({ key: "Escape", preventDefault() {} });
  assert.ok(dialog(subject.render()));
  let prevented = false; modal.props.onKeyDown({ key: "Tab", preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  finish({ ok: false, json: async () => ({ title: "합성 연결 실패" }) }); await tick();
  tree = subject.render(); subject.flushFrames(); modal = dialog(tree);
  assert.equal(find(modal, (node) => node.props.role === "alert").props.children, "합성 연결 실패");
  assert.equal(subject.document.activeElement, subject.element("취소"));
  button(modal, "연결 실행").props.onClick();
  finish(success); await tick(); tree = subject.render(); subject.flushFrames();
  assert.equal(dialog(tree), null);
  assert.equal(subject.document.activeElement, subject.element("일괄 연결 확인"));
  assert.equal(subject.document.body.style.overflow, "auto");
  assert.ok(find(tree, (node) => node.props["aria-label"] === "일괄 연결 결과"));
});
