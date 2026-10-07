import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const subjectPath = "src/app/(admin)/admin/balance-ai/mmr-admin-actions.tsx";
const playerId = "a30b6b22-1822-4c90-b6d6-2f3d76c392ed";
const props = { generation: 3, formulaVersion: "V2_DETERMINISTIC_1", formulaTransition: null, allowed: true, startWithRecalculateConfirmation: true };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const adjustment = { position: "MID", deltaBp: "100", reasonCode: "REVIEWED", publicNote: "합성 조정 근거" };
const success = (kind) => ({ ok: true, status: kind === "adjustments" ? 201 : 200, json: async () => ({ revision: 4, generation: 4, ...(kind === "adjustments" ? { playerId } : { consumedEventCount: 0 }) }) });
function find(tree, predicate) {
  if (!React.isValidElement(tree)) return null;
  if (predicate(tree)) return tree;
  for (const child of React.Children.toArray(tree.props.children)) { const match = find(child, predicate); if (match) return match; }
  return null;
}
const button = (tree, label) => find(tree, (node) => node.type === "button" && node.props.children === label);
function harness(send) {
  const slots = [], requests = [], navigation = [], transitions = [], modules = new Map();
  let cursor = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useTransition() { const [pending, setPending] = hooks.useState(false); return [pending, (operation) => { setPending(true); operation(); transitions.push(() => setPending(false)); }]; },
  };
  function load(filename) {
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = { exports: {} }; modules.set(filename, loaded);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      exports: loaded.exports, crypto: webcrypto, AbortSignal, Error,
      FormData: class { constructor(values) { this.values = values; } get(name) { return this.values[name]; } },
      fetch: async (url, options) => { requests.push({ url, ...options }); return send(requests.length, options, url); },
      require(specifier) {
        if (specifier === "react") return hooks;
        if (specifier === "react/jsx-runtime") return jsx;
        if (specifier === "next/navigation") return { useRouter: () => ({ refresh: () => navigation.push("refresh") }) };
        if (specifier === "next/link") return { __esModule: true, default: () => null };
        if (specifier === "@/modules/mmr") return { MMR_POSITIONS: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] };
        if (specifier.endsWith("/bounded-picker")) return { BoundedPicker: () => null };
        if (specifier.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, name) => String(name) }) };
        const resolved = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
        return load(`${resolved}.ts`);
      },
    });
    return loaded.exports;
  }
  const loaded = load(path.join(root, subjectPath));
  const subject = {
    requests, navigation,
    render(values = props) { cursor = 0; return loaded.MmrAdminActions(values); },
    selectPlayer() { find(subject.render(), (node) => node.props.ariaLabel === "MMR 수동 조정 플레이어").props.onChange(playerId); },
    submit() { const form = find(subject.render(), (node) => node.type === "form"); form.props.onSubmit({ preventDefault() {}, currentTarget: adjustment }); },
    retry() { const tree = subject.render(); const retry = button(tree, "같은 요청 다시 확인") ?? button(tree, "로그인 후 같은 요청 다시 확인"); assert.ok(retry, "an uncertain request needs an explicit retry"); retry.props.onClick(); },
    recalculate() { const tree = subject.render(); (button(tree, "확인 후 재계산") ?? (() => { button(tree, "전체 원장 재계산").props.onClick(); return button(subject.render(), "확인 후 재계산"); })()).props.onClick(); },
    finishRefresh() { transitions.splice(0).forEach((finish) => finish()); },
  };
  return subject;
}

test("successful HTTP status without the published generation is not claimed as completed", async () => {
  for (const kind of ["recalculate", "adjustments"]) {
    const subject = harness(() => ({ ok: true, status: 200, json: async () => ({}) }));
    subject.selectPlayer();
    if (kind === "recalculate") subject.recalculate(); else subject.submit();
    await tick();
    assert.deepEqual(subject.navigation, [], `${kind}: malformed success must not refresh or announce completion`);
  }
});

test("response-loss retry preserves the same adjustment idempotency key and body", async () => {
  let committedKey;
  const subject = harness((attempt, options) => {
    if (attempt === 1) { committedKey = options.headers["Idempotency-Key"]; throw new Error("synthetic response lost after commit"); }
    // Models the inspected repository order: a matching receipt replays before
    // publishProjection checks the old expected generation; a fresh key gets 412.
    return options.headers["Idempotency-Key"] === committedKey ? success("adjustments") : { ok: false, status: 412, json: async () => ({ detail: "MMR generation이 변경되었습니다." }) };
  });
  subject.selectPlayer(); subject.submit(); await tick(); subject.retry(); await tick();
  assert.equal(subject.requests.length, 2);
  assert.equal(subject.requests[0].body, subject.requests[1].body);
  assert.equal(subject.requests[0].headers["If-Match"], subject.requests[1].headers["If-Match"]);
  assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
  assert.deepEqual(subject.navigation, ["refresh"]);
});

test("player selection and pending state guard the actual adjustment form and same-tick submits", async () => {
  let finish;
  const subject = harness(() => new Promise((resolve) => { finish = resolve; }));
  const initial = subject.render();
  assert.equal(button(initial, "조정 원장 추가").props.disabled, true, "an unselected player cannot be submitted");
  assert.equal(find(initial, (node) => node.type === "fieldset").props.disabled, false, "the player picker remains usable");
  subject.submit();
  assert.equal(subject.requests.length, 0, "the submit handler also rejects an unselected player");
  subject.selectPlayer();
  const selected = subject.render();
  assert.equal(button(selected, "조정 원장 추가").props.disabled, false);
  assert.equal(find(selected, (node) => node.type === "fieldset").props.disabled, false);
  const submit = find(selected, (node) => node.type === "form").props.onSubmit;
  const event = { preventDefault() {}, currentTarget: adjustment };
  submit(event); submit(event);
  const pending = subject.render();
  assert.equal(button(pending, "조정 원장 추가").props.disabled, true);
  assert.equal(find(pending, (node) => node.type === "fieldset").props.disabled, true, "pending requests lock every adjustment input");
  subject.submit();
  const count = subject.requests.length;
  finish(success("adjustments")); await tick();
  assert.equal(count, 1, "same-tick submit needs an immediate guard, not only a render-time disabled attribute");
});

test("successful adjustment remains locked until the refreshed generation arrives", async () => {
  const subject = harness(() => success("adjustments"));
  subject.selectPlayer(); subject.submit(); await tick();
  assert.deepEqual(subject.navigation, ["refresh"]);
  assert.equal(button(subject.render(), "조정 원장 추가").props.disabled, true, "router.refresh does not synchronously replace stale generation props");
  subject.finishRefresh();
  subject.submit();
  assert.equal(subject.requests.length, 1, "a refresh that still has the old generation must not unlock the form");
  assert.ok(button(subject.render(), "최신 계산 결과 다시 불러오기"));
  const current = subject.render({ ...props, generation: 4 });
  assert.equal(find(current, (node) => node.type === "fieldset").props.disabled, false);
  assert.equal(button(current, "조정 원장 추가").props.disabled, true, "confirmed adjustments reset the selected player");
});

test("corrupt success responses for both commands remain uncertain and replay the original request", async () => {
  for (const kind of ["recalculate", "adjustments"]) {
    for (const payload of [null, [], {}, { revision: 4, generation: 3 }, { revision: 5, generation: 4 }, { revision: 5, generation: 5, consumedEventCount: 0, playerId }, { revision: 4.5, generation: 4.5 }, { revision: 4, generation: 4, consumedEventCount: -1, playerId: "another-player" }]) {
      const subject = harness((attempt) => attempt === 1 ? { ok: true, status: 200, json: async () => payload } : success(kind));
      subject.selectPlayer();
      if (kind === "recalculate") subject.recalculate(); else subject.submit();
      await tick();
      assert.deepEqual(subject.navigation, []);
      assert.equal(find(subject.render(), (node) => node.type === "fieldset").props.disabled, true);
      subject.retry(); await tick();
      assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
      assert.equal(subject.requests[0].body, subject.requests[1].body);
      assert.deepEqual(subject.navigation, ["refresh"]);
    }
  }
});

test("unreadable JSON, transient errors and throttling keep the frozen request retryable", async () => {
  for (const status of [200, 408, 429, 503]) {
    const subject = harness((attempt) => attempt === 1 ? { ok: status === 200, status, json: async () => { throw new Error("synthetic body unavailable"); } } : success("adjustments"));
    subject.selectPlayer(); subject.submit(); await tick();
    subject.submit();
    assert.equal(subject.requests.length, 1, "normal submission remains disabled while its result is unknown");
    subject.retry(); await tick();
    assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
    assert.equal(subject.requests[1].headers["If-Match"], '"3"');
    assert.equal(subject.requests[0].body, subject.requests[1].body);
    assert.deepEqual(subject.navigation, ["refresh"]);
  }
});

test("expired or insufficient sessions preserve the request through a separate admin login", async () => {
  for (const status of [401, 403]) {
    const subject = harness((attempt) => attempt === 1 ? { ok: false, status, json: async () => ({ detail: "synthetic auth boundary" }) } : success("adjustments"));
    subject.selectPlayer(); subject.submit(); await tick();
    const login = find(subject.render(), (node) => node.props.href === "/admin/login?next=%2Fadmin%2Fbalance-ai");
    assert.ok(login); assert.equal(login.props.target, "_blank");
    assert.match(login.props.rel, /noopener/u);
    assert.deepEqual(subject.navigation, []);
    subject.retry(); await tick();
    assert.equal(subject.requests[0].headers["Idempotency-Key"], subject.requests[1].headers["Idempotency-Key"]);
    assert.deepEqual(subject.navigation, ["refresh"]);
  }
});

test("generation conflicts require an explicit refresh and clear the selected adjustment player", async () => {
  const subject = harness(() => ({ ok: false, status: 412, json: async () => ({ detail: "synthetic generation conflict" }) }));
  subject.selectPlayer(); subject.submit(); await tick();
  assert.equal(find(subject.render(), (node) => node.type === "fieldset").props.disabled, true);
  subject.submit(); assert.equal(subject.requests.length, 1);
  assert.equal(button(subject.render(), "같은 요청 다시 확인"), null);
  button(subject.render(), "입력 버리고 최신 결과 불러오기").props.onClick();
  assert.deepEqual(subject.navigation, ["refresh"]);
  subject.finishRefresh();
  assert.equal(button(subject.render({ ...props, generation: 4 }), "조정 원장 추가").props.disabled, true);
});

test("definitive input rejection preserves editable input and does not announce success", async () => {
  const subject = harness(() => ({ ok: false, status: 400, json: async () => ({ detail: "조정 사유를 확인해 주세요." }) }));
  subject.selectPlayer(); subject.submit(); await tick();
  assert.equal(find(subject.render(), (node) => node.type === "fieldset").props.disabled, false);
  assert.equal(button(subject.render(), "조정 원장 추가").props.disabled, false);
  assert.equal(find(subject.render(), (node) => node.props.role === "status").props.children, "조정 사유를 확인해 주세요.");
  assert.deepEqual(subject.navigation, []);
});

test("admin without SUPER role sees no mutation form and valid recalculation requests retain preconditions", async () => {
  const subject = harness(() => success("recalculate"));
  assert.equal(find(subject.render({ ...props, allowed: false }), (node) => node.type === "form"), null);
  subject.recalculate(); await tick();
  assert.equal(subject.requests.length, 1);
  assert.equal(subject.requests[0].url, "/api/admin/balance-ai/recalculate");
  assert.equal(subject.requests[0].headers["If-Match"], '"3"');
  assert.equal(subject.requests[0].body, "{}");
  assert.deepEqual(subject.navigation, ["refresh"]);
});
