import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import { transform } from "lightningcss";
import nexusModuleMarkers from "../scripts/postcss/nexus-module-markers.cjs";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));

function fixture(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-module-markers-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const filename = path.join(directory, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content);
  }
  return directory;
}

function compile(css, filename) {
  return transform({ filename, code: Buffer.from(css), cssModules: true, minify: true });
}

function renderedRules(compiled) {
  // Lightning CSS can retain the empty rules left by global composition.
  // They have no declarations; compare every remaining rule in original order.
  const root = postcss.parse(compiled.code.toString());
  for (const node of [...root.nodes]) {
    if (node.type === "rule" && node.nodes.length === 0) node.remove();
  }
  return root.toString();
}

test("NEXUS composes stable global markers without changing module styles or state selectors", async (t) => {
  const css = `
    .panel { color: navy; }
    .panel > .button:hover { color: blue; }
    .button:disabled { opacity: .4; }
    .panel[data-selected="true"] { border: 1px solid red; }
    .panel :global(.external) { color: green; }
    .panel, .commaClass { padding: 2px; }
    .escaped\\:name { margin: 1px; }
    @media (max-width: 600px) { .mobilePanel { padding: 8px; } }
    @keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
    .panel { animation: pulse 1s; }
  `;
  const directory = fixture(t, { "sample.module.css": css });
  const filename = path.join(directory, "sample.module.css");
  const plugin = nexusModuleMarkers({ serviceId: "nexus", sourceRoot: directory });
  const result = await postcss([plugin]).process(css, { from: filename });
  const original = compile(css, filename);
  const compiled = compile(result.css, filename);

  assert.equal(renderedRules(compiled), renderedRules(original), "hashed styles, disabled and selected rules must remain unchanged");
  assert.deepEqual(Object.keys(compiled.exports).sort(), Object.keys(original.exports).sort());
  for (const name of ["panel", "button", "mobilePanel", "commaClass", "escaped:name"]) {
    assert.equal(compiled.exports[name].name, original.exports[name].name);
    assert.deepEqual(compiled.exports[name].composes, [{ type: "global", name: `nexus-sample--${name}` }]);
  }
  assert.equal(compiled.exports.external, undefined, "a :global class must not become a module export");
  assert.deepEqual(compiled.exports.pulse.composes, [], "keyframe names must not acquire class markers");
  const repeated = await postcss([plugin]).process(result.css, { from: filename });
  assert.equal(repeated.css, result.css, "processing a module again must not duplicate its composition rules");
});

test("K-LOL, global CSS and files outside the application source keep their exact original CSS", async (t) => {
  const css = ".panel { color: navy; }";
  const directory = fixture(t, { "sample.module.css": css, "global.css": css });
  for (const serviceId of [undefined, "klol"]) {
    const result = await postcss([nexusModuleMarkers({ serviceId, sourceRoot: directory })])
      .process(css, { from: path.join(directory, "sample.module.css") });
    assert.equal(result.css, css);
  }
  const plugin = nexusModuleMarkers({ serviceId: "nexus", sourceRoot: directory });
  for (const filename of [path.join(directory, "global.css"), path.join(directory, "..", "vendor.module.css")]) {
    const result = await postcss([plugin]).process(css, { from: filename });
    assert.equal(result.css, css);
  }
});

test("ambiguous module basenames fail before emitting shared theme markers", async (t) => {
  const directory = fixture(t, { "a/panel.module.css": ".card {}", "b/panel.module.css": ".card {}" });
  await assert.rejects(
    postcss([nexusModuleMarkers({ serviceId: "nexus", sourceRoot: directory })])
      .process(".card {}", { from: path.join(directory, "a/panel.module.css") }),
    /Duplicate NEXUS CSS module basename "panel"/,
  );
});

test("unsupported bare global or local scopes fail before a global class can become a local export", async (t) => {
  const directory = fixture(t, { "sample.module.css": ".panel {}" });
  for (const selector of [":global .external", ":local .panel"]) {
    await assert.rejects(
      postcss([nexusModuleMarkers({ serviceId: "nexus", sourceRoot: directory })])
        .process(`${selector} { color: red; }`, { from: path.join(directory, "sample.module.css") }),
      /require functional :global\(\.\.\.\) and :local\(\.\.\.\) scopes/,
    );
  }
});

test("all application modules retain their compiled rules and export a stable marker for every local class", async (t) => {
  const files = fs.readdirSync(sourceRoot, { recursive: true }).filter((file) => file.endsWith(".module.css"));
  const plugin = nexusModuleMarkers({ serviceId: "nexus", sourceRoot });
  let classCount = 0;
  for (const file of files) {
    const filename = path.join(sourceRoot, file);
    const css = fs.readFileSync(filename, "utf8");
    const result = await postcss([plugin]).process(css, { from: filename });
    const original = compile(css, filename);
    const compiled = compile(result.css, filename);
    assert.equal(renderedRules(compiled), renderedRules(original), file);
    assert.deepEqual(Object.keys(compiled.exports).sort(), Object.keys(original.exports).sort(), file);
    const localClasses = new Set();
    postcss.parse(css).walkRules((rule) => {
      selectorParser((selectors) => selectors.walkClasses((node) => {
        let global = false;
        for (let parent = node.parent; parent; parent = parent.parent) {
          if (parent.type === "pseudo" && parent.value === ":global") global = true;
        }
        if (!global) localClasses.add(node.value);
      })).processSync(rule.selector);
    });
    const basename = path.basename(file, ".module.css");
    for (const name of localClasses) {
      assert.equal(compiled.exports[name].name, original.exports[name].name, `${file}: ${name}`);
      assert.ok(compiled.exports[name].composes.some((entry) => entry.type === "global" && entry.name === `nexus-${basename}--${name}`), `${file}: ${name}`);
      classCount += 1;
    }
    const klol = await postcss([nexusModuleMarkers({ sourceRoot })]).process(css, { from: filename });
    assert.equal(klol.css, css, `${file}: default service must be byte-for-byte unchanged`);
  }
  t.diagnostic(`${files.length} modules / ${classCount} local class exports verified with Lightning CSS`);
});

test("theme markers stay scoped to NEXUS and do not depend on generated CSS Module names", () => {
  const css = fs.readFileSync(path.join(sourceRoot, "app", "nexus-theme.css"), "utf8");
  const moduleNames = new Set(fs.readdirSync(sourceRoot, { recursive: true })
    .filter((file) => file.endsWith(".module.css")).map((file) => path.basename(file, ".module.css")));
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    for (const selector of postcss.list.comma(rule.selector)) {
      assert.match(selector, /^(?:html)?\[data-service="nexus"\]/);
    }
    selectorParser((selectors) => selectors.walkAttributes((attribute) => {
      if (attribute.attribute !== "class") return;
      assert.ok(!attribute.value.includes("-module__"), `generated filename pattern: ${attribute}`);
      assert.ok(!attribute.value.startsWith("__"), `generated local name pattern: ${attribute}`);
      if (attribute.value.startsWith("nexus-") && attribute.value.endsWith("--")) {
        assert.equal(attribute.operator, "*=", "a composed marker can follow the original hashed class");
        assert.ok(moduleNames.has(attribute.value.slice(6, -2)), `unknown module marker: ${attribute}`);
      }
    })).processSync(rule.selector);
  });
  assert.doesNotThrow(() => transform({ filename: "nexus-theme.css", code: Buffer.from(css), minify: true }));
});
