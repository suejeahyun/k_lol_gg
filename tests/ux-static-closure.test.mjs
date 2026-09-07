import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = process.cwd();

function source(path) {
  return readFileSync(join(root, path), "utf8");
}

function files(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

test("정적 마감 대상의 native button은 submit 여부를 명시한다", () => {
  const missingTypes = [];
  const guidedCompetitionControls = /progress[\\/]event[\\/]\[eventId\]|progress[\\/]destruction[\\/]\[tournamentId\]|destruction[\\/]\[tournamentId\][\\/]destruction-owner-actions/u;
  for (const path of [...files("src/app"), ...files("src/components")].filter((item) => item.endsWith(".tsx") && !guidedCompetitionControls.test(item))) {
    const content = source(path);
    const syntax = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(syntax) === "button") {
        const hasType = node.attributes.properties.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(syntax) === "type");
        if (!hasType) missingTypes.push(path);
      }
      ts.forEachChild(node, visit);
    }
    visit(syntax);
  }
  assert.deepEqual(missingTypes, []);
});

test("이벤트 운영 폼은 내부 UUID나 JSON 복사를 요구하지 않는다", () => {
  const event = source("src/app/(admin)/admin/progress/event/[eventId]/event-admin-actions.tsx");
  const destruction = source("src/app/(admin)/admin/progress/destruction/[tournamentId]/destruction-admin-actions.tsx");
  const owner = source("src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/destruction-owner-actions.tsx");
  for (const content of [event, destruction, owner]) {
    assert.doesNotMatch(content, /(?:UUID|주장 JSON|경기 ID|승리 팀 ID)[^<]*<(?:input|textarea)\b/u);
  }
  assert.match(event, /BoundedPicker[\s\S]*remoteEndpoint="\/api\/admin\/matches\/editor-options\/players"/u);
  assert.match(destruction, /name="applicationId"[\s\S]*name="teamId"[\s\S]*name="participantId"/u);
  assert.match(owner, /mvpBallots[\s\S]*name="candidatePlayerId"/u);
});

test("완성된 메뉴와 관리자 검색은 과거 단계 문구를 노출하지 않는다", () => {
  const navigation = source("src/components/navigation/user-site-navigation.tsx");
  const adminSearch = source("src/app/(admin)/admin/search/page.tsx");
  assert.doesNotMatch(navigation, /<small>준비 중<\/small>/u);
  assert.doesNotMatch(adminSearch, /현재 A0|함께 연결/u);
});

test("Riot ID의 게임 이름과 태그는 각각 이름을 가진다", () => {
  const riot = source("src/components/riot/riot-admin-actions.tsx");
  assert.match(riot, /<label>게임 이름<input/u);
  assert.match(riot, /<label>태그<input/u);
});
