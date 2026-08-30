import assert from "node:assert/strict";
import fs from "node:fs";

const managedTemplates = fs.readFileSync("src/lib/kakao/managed-forms.ts", "utf8");
const adminSidebar = fs.readFileSync("src/components/AdminSidebar.tsx", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");

assert.match(
  managedTemplates,
  /getPublishedManagedTemplate[\s\S]*return DEFAULT_MANAGED_TEMPLATES\[formType\]/,
  "카카오 경고·내전 양식은 코드의 고정 템플릿만 사용해야 합니다.",
);
assert.doesNotMatch(
  managedTemplates,
  /prisma\.kakaoFormTemplate\.findFirst/,
  "DB 게시 양식이 런타임 고정 양식을 덮어쓰면 안 됩니다.",
);
assert.doesNotMatch(adminSidebar, /\/admin\/kakao\/forms/, "삭제한 양식 관리 메뉴가 남아 있습니다.");

for (const path of [
  "src/app/(admin)/admin/kakao/forms/page.tsx",
  "src/components/admin/KakaoManagedFormsClient.tsx",
  "src/app/api/admin/kakao/form-templates/route.ts",
  "src/app/api/admin/kakao/form-templates/[id]/publish/route.ts",
]) {
  assert.equal(fs.existsSync(path), false, `동적 양식 관리 파일이 남아 있습니다: ${path}`);
}

assert.match(schema, /model KakaoFormTemplate/, "기존 템플릿 감사 이력 테이블은 보존해야 합니다.");
assert.match(schema, /templateSnapshot/, "기존 접수의 양식 스냅샷은 보존해야 합니다.");
assert.equal(
  fs.existsSync("src/app/(admin)/admin/kakao/operation-forms/page.tsx"),
  true,
  "별도 운영신청 기능을 함께 삭제하면 안 됩니다.",
);

console.log("고정 카카오 양식 및 동적 관리 제거 검사를 통과했습니다.");
