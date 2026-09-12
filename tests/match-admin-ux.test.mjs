import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editorPath = new URL("../src/app/(admin)/admin/matches/match-editor.tsx", import.meta.url);
const pickerPath = new URL("../src/app/(admin)/admin/matches/bounded-picker.tsx", import.meta.url);
const reviewPath = new URL("../src/app/(admin)/admin/matches/submissions/[submissionId]/submission-review.tsx", import.meta.url);
const reviewPagePath = new URL("../src/app/(admin)/admin/matches/submissions/[submissionId]/page.tsx", import.meta.url);
const editorPagePath = new URL("../src/app/(admin)/admin/matches/[matchId]/page.tsx", import.meta.url);
const stylesPath = new URL("../src/app/(admin)/admin/matches/matches-admin.module.css", import.meta.url);

test("match editor exposes only the structured form and traps the void confirmation dialog", async () => {
  const source = await readFile(editorPath, "utf8");
  assert.doesNotMatch(source, /전송 JSON 미리보기/);
  assert.doesNotMatch(source, />진행 초</);
  assert.match(source, /durationSeconds: game\.durationSeconds/u);
  assert.match(source, /durationSeconds: 1_800/u);
  assert.match(source, /inert=\{voidOpen \? true : undefined\}/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /voidDialogRef\.current/);
  assert.match(source, /returnFocusRef\.current/);
  assert.match(source, /returnTarget\?\.isConnected/);
  assert.match(source, /ref=\{voidTriggerRef\}/);
});

test("picker status copy is outside the listbox and visual active row matches aria active descendant", async () => {
  const source = await readFile(pickerPath, "utf8");
  const listboxStart = source.indexOf("<div className={styles.pickerOptions}");
  const optionsStart = source.indexOf("{visible.map", listboxStart);
  assert.ok(listboxStart >= 0 && optionsStart > listboxStart);
  assert.doesNotMatch(source.slice(listboxStart, optionsStart), /<p/);
  assert.match(source, /data-active=\{index === resolvedActiveIndex\}/);
  assert.match(source, /aria-activedescendant=\{open && resolvedActiveIndex >= 0/);
  assert.match(source, /role="status" aria-live="polite">검색하고 있습니다/);
  assert.match(source, /role="alert">검색 연결에 실패했습니다/);
  assert.match(source, /role="status" aria-live="polite">검색 결과가 없습니다/);
});

test("submission reject dialog shares the accessible modal behavior", async () => {
  const source = await readFile(reviewPath, "utf8");
  assert.match(source, /inert=\{rejectOpen \? true : undefined\}/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /rejectDialogRef\.current/);
  assert.match(source, /returnTarget\?\.isConnected/);
  assert.match(source, /ref=\{rejectTriggerRef\}/);
  assert.match(source, /minLength=\{3\}/);
});

test("submission conflict keeps component identity and adopts only a verified latest revision", async () => {
  const [source, page] = await Promise.all([
    readFile(reviewPath, "utf8"),
    readFile(reviewPagePath, "utf8"),
  ]);
  assert.doesNotMatch(page, /<SubmissionReview key=/);
  assert.match(source, /fetchLatestProjection/);
  assert.match(source, /latest\.id === submission\.id && Number\.isSafeInteger\(latest\.revision\)/);
  assert.match(source, /setRevision\(latest\.revision\)/);
  assert.match(source, /setServerConflict\(latest\)/);
  assert.match(source, /로컬 편집 유지·모든 행 재확인/);
  assert.match(source, /서버 검토안 불러오기/);
  assert.match(source, /disabled=\{busy \|\| Boolean\(serverConflict\)/);
  assert.match(source, /setImageRevisions\(Object\.fromEntries\(latest\.images/);
  assert.doesNotMatch(source, /if \(response\.status === 412\) router\.refresh\(\)/);
});

test("match editor conflict preserves local input and adopts only a verified latest aggregate", async () => {
  const [source, page] = await Promise.all([
    readFile(editorPath, "utf8"),
    readFile(editorPagePath, "utf8"),
  ]);
  assert.doesNotMatch(page, /<MatchEditor\s+key=/);
  assert.match(source, /fetchLatestProjection/);
  assert.match(source, /latest\.revision <= state\.revision/);
  assert.match(source, /setState\(\{ id: latest\.id, status: latest\.status, revision: latest\.revision \}\)/);
  assert.match(source, /setServerConflict\(latest\)/);
  assert.match(source, /로컬 입력 유지·최신 revision에 재적용/);
  assert.match(source, /서버 경기 전체 불러오기/);
  assert.match(source, /disabled=\{busy \|\| Boolean\(serverConflict\)/);
  assert.doesNotMatch(source, /if \(response\.status === 412\) \{\s*router\.refresh\(\)/);
});

test("match editor save action stays readable in enabled and disabled states", async () => {
  const styles = await readFile(stylesPath, "utf8");
  assert.match(styles, /\.actions \.action \{ color: #fff; border-color: var\(--primary\); background: var\(--primary\); \}/);
  assert.match(styles, /\.actions \.action:disabled \{ color: #66758b; border-color: #d8e1ed; background: #e9eef5; cursor: not-allowed; \}/);
});
