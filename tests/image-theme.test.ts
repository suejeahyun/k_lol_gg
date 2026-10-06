import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import ts from "typescript";
import * as icons from "../src/components/theme/theme-icons";
import { themeIconMap } from "../src/components/theme/theme-icon-map";

test("every application icon import resolves to a generated image, including shared UI controls", async () => {
  const files = (await readdir("src", { recursive: true })).filter((file) => /\.(ts|tsx)$/.test(file));
  const consumers = new Set<string>();
  for (const file of files) {
    const source = await readFile(join("src", file), "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      assert.notEqual(node.moduleSpecifier.text, "lucide-react", `${file} still uses a line icon`);
      if (node.moduleSpecifier.text !== "@/components/theme/theme-icons") continue;
      consumers.add(file.replaceAll("\\", "/"));
      const bindings = node.importClause?.namedBindings;
      assert.ok(bindings && ts.isNamedImports(bindings));
      for (const item of bindings.elements) {
        const name = (item.propertyName ?? item.name).text as keyof typeof icons;
        assert.equal(typeof icons[name], "function", `${file}: missing ${name}`);
        const markup = renderToStaticMarkup(createElement(icons[name]));
        assert.match(markup, /<image href="\/images\/theme\/v1\/[a-z]+\.webp"/);
        assert.doesNotMatch(markup, /<path|<circle/);
      }
    }
  }
  // Scan all current imports above; deleting a decorative block may remove a consumer.
  // Keep the essential navigation consumers explicit so an empty scan cannot pass.
  for (const file of ["components/site-shell.tsx", "components/navigation/user-site-navigation.tsx", "components/navigation/recruiting-competitions.tsx"]) {
    assert.ok(consumers.has(file), `${file} retains the generated navigation artwork`);
  }
});

test("image icons preserve size, accessible names and decorative semantics", () => {
  const decorative = renderToStaticMarkup(createElement(icons.Crown, { size: 36, className: "podium-medal" }));
  assert.match(decorative, /width="36" height="36"/);
  assert.match(decorative, /aria-hidden="true"/);
  assert.match(decorative, /theme-icon podium-medal/);
  assert.match(decorative, /overflow:hidden/);
  const meaningful = renderToStaticMarkup(createElement(icons.Search, { "aria-label": "검색" }));
  assert.match(meaningful, /role="img"/);
  assert.match(meaningful, /aria-label="검색"/);
  assert.doesNotMatch(meaningful.slice(0, meaningful.indexOf("><image")), /aria-hidden="true"/);
});

test("artwork files match their provenance, alpha grids and transfer budget", async () => {
  const manifest = JSON.parse(await readFile("docs/design/image-theme-v1.json", "utf8"));
  const controls = JSON.parse(await readFile("docs/design/image-theme-controls-v2.json", "utf8"));
  const expectedPositions: Record<string, { atlas: string; column: number; row: number }> = {};
  let bytes = 0;
  const cells = new Set<string>();
  for (const asset of [...manifest.assets, ...controls.assets]) {
    const buffer = await readFile(asset.path);
    assert.equal(createHash("sha256").update(buffer).digest("hex"), asset.sha256);
    assert.equal(buffer.length, asset.bytes);
    bytes += buffer.length;
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.width, asset.width); assert.equal(meta.height, asset.height);
    assert.equal(meta.hasAlpha, asset.alpha);
    assert.ok(asset.prompt.length > 100);
    if (asset.cells) {
      assert.equal(asset.cells.length, 16); assert.equal(meta.hasAlpha, true);
      const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
      for (const [index, name] of asset.cells.entries()) {
        cells.add(name);
        const position = { atlas: asset.id, column: index % 4, row: Math.floor(index / 4) };
        expectedPositions[name] = position;
        let opaque = 0, transparent = 0;
        const cellSize = info.width / 4;
        for (let y = position.row * cellSize; y < (position.row + 1) * cellSize; y++) {
          for (let x = position.column * cellSize; x < (position.column + 1) * cellSize; x++) {
            const alpha = data[(y * info.width + x) * info.channels + 3];
            if (alpha > 200) opaque++; if (alpha < 10) transparent++;
          }
        }
        assert.ok(opaque > cellSize * cellSize * .07, `${name} has visible artwork`);
        assert.ok(transparent > cellSize * cellSize * .1, `${name} has real transparent padding`);
      }
    }
    if (asset.mobile) {
      const mobile = await readFile(asset.mobile.path);
      assert.equal(createHash("sha256").update(mobile).digest("hex"), asset.mobile.sha256);
      assert.ok(mobile.length < buffer.length);
      bytes += mobile.length;
    }
  }
  assert.deepEqual(themeIconMap, expectedPositions, "every glyph uses its most recent generated cell");
  assert.equal(cells.size, 96);
  assert.ok(bytes < 850_000, `all shared artwork stays below 850 KB; got ${bytes}`);
});
