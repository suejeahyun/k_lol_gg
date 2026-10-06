import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const slides = [
  { id: "win-rate", label: "승률", description: "승률이 높은 순", metricLabel: "승률", rows: [{ playerId: "a", displayName: "합성 선수", riotId: "TEST#KR", value: "60%" }] },
  { id: "participation", label: "최다 참여자", description: "참여 횟수가 많은 순", metricLabel: "참여", rows: [{ playerId: "b", displayName: "합성 선수", riotId: "TEST#KR", value: "20회" }] },
  { id: "mvp", label: "최다 MVP", description: "MVP 선정 횟수가 많은 순", metricLabel: "MVP", rows: [{ playerId: "c", displayName: "합성 선수", riotId: "TEST#KR", value: "8회" }] },
];

function findAll(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props.children).flatMap(child => findAll(child, predicate))];
}

function harness(rankingSlides = slides) {
  const slots = [];
  const timers = new Map();
  let cursor = 0;
  let pending = [];
  let nextTimer = 0;
  const hooks = {
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = typeof value === "function" ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useId: () => "ranking-panel",
    useEffect(effect, deps) {
      const slot = cursor++;
      const previous = slots[slot];
      if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) {
        pending.push(() => { previous?.cleanup?.(); slots[slot] = { deps, cleanup: effect() }; });
      }
    },
  };
  const Button = () => null;
  const dependencies = {
    react: hooks, "react/jsx-runtime": jsxRuntime, "next/link": () => null,
    "@/components/theme/theme-icons": new Proxy({}, { get: () => () => null }),
    "@/components/ui/button": { Button },
    "./home-ranking-carousel.module.css": { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../src/components/home/home-ranking-carousel.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const result = { exports: {} };
  const document = { visibilityState: "visible" };
  vm.runInNewContext(compiled, { exports: result.exports, document, window: {
    setInterval: callback => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearInterval: id => timers.delete(id),
  }, require: specifier => {
    assert.ok(Object.hasOwn(dependencies, specifier), `Unexpected carousel dependency: ${specifier}`);
    return dependencies[specifier];
  } });
  return {
    render() { cursor = 0; pending = []; const tree = result.exports.HomeRankingCarousel({ slides: rankingSlides, seasonName: "합성 시즌", minimumParticipation: 10 }); pending.forEach(effect => effect()); return tree; },
    select(tree, label) { return findAll(tree, node => node.type === Button && node.props.children === label)[0]; },
    control(tree, label) { return findAll(tree, node => node.props["aria-label"] === label)[0]; },
    timers,
    document,
  };
}

test("ranking choices name all three rankings before the single slide and expose selection", () => {
  const view = harness();
  const tree = view.render();
  for (const [index, label] of ["승률", "최다 참여", "최다 MVP"].entries()) {
    const button = view.select(tree, label);
    assert.ok(button, `visible direct choice: ${label}`);
    assert.equal(button.props["aria-pressed"], index === 0);
    assert.equal(button.props["aria-controls"], "ranking-panel");
  }
  assert.equal(findAll(tree, node => node.props["aria-roledescription"] === "슬라이드").length, 1);
  const groups = React.Children.toArray(tree.props.children);
  assert.ok(groups.findIndex(node => node.props["aria-label"] === "랭킹 종류 선택") < groups.findIndex(node => node.props.id === "ranking-panel"));
  assert.equal(findAll(tree, node => typeof node.props.children === "string" && node.props.children.startsWith("다음:")).length, 0);
  assert.equal(view.timers.size, 0, "rotation starts only through explicit play");
});

test("direct ranking choice stops rotation and updates its single slide and full-ranking destination", () => {
  const view = harness();
  let tree = view.render();
  view.control(tree, "자동 넘김 시작").props.onClick();
  tree = view.render();
  assert.equal(view.timers.size, 1);
  view.select(tree, "최다 MVP").props.onClick();
  tree = view.render();
  assert.equal(tree.props["data-ranking-kind"], "mvp");
  assert.equal(view.timers.size, 0);
  assert.equal(view.select(tree, "최다 MVP").props["aria-pressed"], true);
  assert.equal(view.select(tree, "승률").props["aria-pressed"], false);
  assert.equal(findAll(tree, node => node.props["aria-roledescription"] === "슬라이드").length, 1);
  assert.equal(findAll(tree, node => node.props.href === "/rankings?view=mvp").length, 1);
  assert.equal(findAll(tree, node => node.props.id === "ranking-panel")[0].props["aria-live"], "polite");
});

test("named choices retain directional keyboard, previous/next and explicit play controls", () => {
  const view = harness();
  let tree = view.render();
  let prevented = 0;
  tree.props.onKeyDown({ key: "ArrowLeft", preventDefault: () => prevented++ });
  tree = view.render();
  assert.equal(tree.props["data-ranking-kind"], "mvp");
  view.control(tree, "다음 랭킹").props.onClick();
  tree = view.render();
  assert.equal(tree.props["data-ranking-kind"], "win-rate");
  view.control(tree, "이전 랭킹").props.onClick();
  tree = view.render();
  assert.equal(tree.props["data-ranking-kind"], "mvp");
  tree.props.onKeyDown({ key: "ArrowRight", ctrlKey: true, preventDefault: () => prevented++ });
  tree = view.render();
  assert.equal(tree.props["data-ranking-kind"], "mvp");
  assert.equal(prevented, 1, "modified shortcuts retain their native behavior");
  assert.ok(view.control(tree, "자동 넘김 시작"));
});

test("empty or single ranking does not expose impossible slide controls", () => {
  assert.equal(harness([]).render(), null);
  const view = harness(slides.slice(0, 1));
  const tree = view.render();
  assert.equal(findAll(tree, node => node.props["aria-label"] === "랭킹 종류 선택").length, 0);
  assert.equal(view.control(tree, "다음 랭킹"), undefined);
});
