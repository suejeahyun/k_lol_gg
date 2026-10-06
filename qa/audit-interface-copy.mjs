import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const destination = "docs/qa-evidence/service-completion-v1.0.4-2026-10-06";
const baseline = JSON.parse(fs.readFileSync("docs/qa-evidence/2026-10-05-service-completion/feature-inventory.json", "utf8"));
const normalize = (value) => value.replaceAll("\\", "/");
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = normalize(path.join(directory, entry.name));
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk("src/app").filter((file) => /\/(page\.tsx|route\.ts)$/.test(file));
const previous = new Map(baseline.routes.map((route) => [route.source, route]));
const missing = files.filter((file) => !previous.has(file));
const removed = baseline.routes.filter((route) => /\/(page\.tsx|route\.ts)$/.test(route.source) && !files.includes(route.source));
if (missing.length || removed.length) throw new Error(JSON.stringify({ missing, removed }));

const sourceChanges = new Set(execFileSync("git", ["-c", "core.safecrlf=false", "diff", "--name-only", "f4ab0647", "--", "src"], { encoding: "utf8" }).trim().split(/\r?\n/));
const steps = ["home", "auth", "applications", "recruits", "event", "destruction", "balance", "random", "matches", "player", "statistics", "media", "discipline", "support", "riot", "kakao", "operations", "guides"];
const routes = baseline.routes.map((route) => ({
  order: steps.indexOf(route.family) + 1,
  route: route.route,
  kind: route.kind,
  source: route.source,
  family: route.family,
  methods: route.methods,
  sha256: crypto.createHash("sha256").update(fs.readFileSync(route.source)).digest("hex"),
  changed: sourceChanges.has(route.source),
  review: route.kind === "page" ? "PAGE_COPY_REVIEW" : "NO_UI_COPY_BOUNDARY_PRESERVED",
  relatedUi: route.uiControlSourceFiles,
  existingTestReferences: route.directTestReferences,
})).sort((a, b) => a.order - b.order || a.route.localeCompare(b.route));

const controls = [];
for (const file of walk("src").filter((entry) => entry.endsWith(".tsx"))) {
  const content = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const element = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = element.tagName.getText(tree);
      if (["a", "Link", "button", "Button", "input", "Input", "select", "textarea", "summary", "form"].includes(tag)) {
        controls.push({
          file,
          line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
          tag,
          attributes: element.attributes.properties.map((attribute) => attribute.getText(tree)).join(" "),
          content: ts.isJsxElement(node) ? node.children.map((child) => child.getText(tree)).join(" ").replace(/\s+/g, " ").slice(0, 240) : "",
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

const analysis = {
  checkedAt: new Date().toISOString(),
  baseCommit: "f4ab064701188385a07eb07191e041169ae08bda",
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  counts: {
    pages: routes.filter((route) => route.kind === "page").length,
    api: routes.filter((route) => route.kind === "api").length,
    compatibility: routes.filter((route) => route.kind === "compatibility-handler").length,
    all: routes.length,
    controlSourceLocations: controls.length,
  },
  missing,
  removed,
  orderedFamilies: steps.map((id, index) => ({ order: index + 1, id, routes: routes.filter((route) => route.family === id).length })),
  scheduledJobs: JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons,
  limitation: "Current source completeness and change boundary. Source review, old test references and actual current test/browser results are separate. No claim that every UI state or production mutation was exercised.",
  routes,
  controls,
};
fs.mkdirSync(destination, { recursive: true });
fs.writeFileSync(`${destination}/interface-inventory.json`, JSON.stringify(analysis, null, 2) + "\n");
console.log(JSON.stringify({ counts: analysis.counts, missing, removed, changedSourceFiles: sourceChanges.size - Number(sourceChanges.has("")) }));
