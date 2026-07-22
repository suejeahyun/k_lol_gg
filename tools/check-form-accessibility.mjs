import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const violations = [];

function collectTsxFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(target);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [target] : [];
  });
}

function getTagName(node) {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return ts.isIdentifier(tag) ? tag.text : tag.getText();
}

function getAttributes(node) {
  return ts.isJsxElement(node)
    ? node.openingElement.attributes.properties
    : node.attributes.properties;
}

function hasAttribute(node, names) {
  const expected = new Set(names);
  return getAttributes(node).some(
    (attribute) =>
      ts.isJsxAttribute(attribute) && expected.has(attribute.name.getText()),
  );
}

function hasStaticAttributeValue(node, name, value) {
  return getAttributes(node).some(
    (attribute) =>
      ts.isJsxAttribute(attribute) &&
      attribute.name.getText() === name &&
      ts.isStringLiteral(attribute.initializer) &&
      attribute.initializer.text === value,
  );
}

function hasAncestorLabel(node) {
  let parent = node.parent;
  while (parent) {
    if (ts.isJsxElement(parent) && getTagName(parent).toLowerCase() === "label") {
      return true;
    }
    if (ts.isJsxElement(parent) || ts.isJsxFragment(parent)) break;
    parent = parent.parent;
  }
  return false;
}

function hasButtonText(node) {
  if (!ts.isJsxElement(node)) return false;
  return node.children.some((child) => {
    if (ts.isJsxText(child)) return child.text.trim().length > 0;
    if (ts.isJsxExpression(child)) return Boolean(child.expression);
    return ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child);
  });
}

function addViolation(file, source, node, message) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  violations.push(
    `${path.relative(root, file).replaceAll("\\", "/")}:${position.line + 1} ${message}`,
  );
}

for (const file of collectTsxFiles(sourceRoot)) {
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = getTagName(node).toLowerCase();

      if (["input", "select", "textarea"].includes(tag)) {
        if (tag === "input" && hasStaticAttributeValue(node, "type", "hidden")) {
          ts.forEachChild(node, visit);
          return;
        }
        const hasAccessibleName =
          hasAncestorLabel(node) ||
          hasAttribute(node, ["aria-label", "aria-labelledby", "id", "title"]);
        if (!hasAccessibleName) {
          addViolation(file, source, node, `<${tag}>에 접근 가능한 이름이 없습니다.`);
        }
      }

      if (tag === "button") {
        const hasAccessibleName =
          hasButtonText(node) ||
          hasAttribute(node, ["aria-label", "aria-labelledby", "title"]);
        if (!hasAccessibleName) {
          addViolation(file, source, node, "<button>에 접근 가능한 이름이 없습니다.");
        }
      }

      if (tag === "img" && !hasAttribute(node, ["alt"])) {
        addViolation(file, source, node, "<img>에 alt 속성이 없습니다.");
      }

      if (
        ["div", "span", "p"].includes(tag) &&
        hasAttribute(node, ["aria-label", "aria-labelledby"]) &&
        !hasAttribute(node, ["role"])
      ) {
        addViolation(
          file,
          source,
          node,
          `<${tag}>의 ARIA 이름에 대응하는 role이 없습니다.`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

if (violations.length > 0) {
  console.error("폼 접근성 점검 실패:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("폼 접근성 점검 완료");
