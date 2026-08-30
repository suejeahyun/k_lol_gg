import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function expect(source, pattern, label) {
  if (!pattern.test(source)) throw new Error(`guided registration hub missing: ${label}`);
}

const page = read("src/app/(user)/start/page.tsx");
const styles = read("src/app/(user)/start/page.module.css");
const catalog = read("src/lib/navigation/catalog.ts");
const sidebar = read("src/components/UserSidebar.tsx");

expect(page, /무엇을 등록하려고 하나요/, "beginner-first heading");
expect(page, /내전 결과 제출/, "match result card");
expect(page, /경고 차감 사진 제출/, "discipline evidence card");
expect(page, /주의·경고 등록/, "admin warning card");
expect(page, /href="\/matches\/submit"/, "match result route");
expect(page, /href="\/discipline\/evidence"/, "discipline evidence route");
expect(page, /href="\/admin\/discipline\/new"/, "admin discipline route");
expect(page, /getCurrentUser/, "role-aware session guidance");
expect(styles, /@media \(max-width: 680px\)/, "mobile layout");
expect(styles, /\.cardGrid/, "visible choice grid");
expect(catalog, /href: "\/start"/, "navigation catalog entry");
expect(sidebar, /href: "\/start"/, "user sidebar entry");
expect(page, /진행 중인 제출이 있나요/, "code-free resume guidance");
expect(page, /본인의 미완료 내전 결과와 경고 사진 과제를 자동으로 찾아/, "account-owned resume guidance");
if (/\b(?:MR|WR)[A-F0-9]*\b|접수번호/.test(page)) {
  throw new Error("guided registration hub must not require visible receipt codes");
}

console.log("guided registration hub checks passed");
