import assert from "node:assert/strict";
import fs from "node:fs";

const client = fs.readFileSync("src/components/admin/DisciplineRecordCreateClient.tsx", "utf8");
const page = fs.readFileSync("src/app/(admin)/admin/discipline/new/page.tsx", "utf8");
const api = fs.readFileSync("src/app/api/admin/discipline-records/route.ts", "utf8");

assert.match(client, /3단계 빠른 등록/, "초보 운영자가 전체 등록 단계를 바로 알 수 있어야 합니다.");
assert.match(client, /대상 선택[\s\S]*조치 내용[\s\S]*확인·발급/, "대상→조치→확인 순서의 단계 안내가 있어야 합니다.");
assert.match(client, /const \[targetKey, setTargetKey\] = useState\(""\)/, "사이트 회원을 자동 선택하지 않고 운영자가 대상을 명시적으로 골라야 합니다.");
assert.match(client, /검색 결과에서 등록 대상을 한 명 선택해주세요/, "대상 미선택 오류는 다음 행동을 설명해야 합니다.");
assert.match(client, /사이트 회원 검색[\s\S]*미가입자 직접 입력/, "회원과 미가입자 등록 경로를 모두 안내해야 합니다.");
assert.match(client, /일반 경고 · 10판/, "일반 경고 10판 정책을 선택 화면에서 보여줘야 합니다.");
assert.match(client, /내전 경고 · 15판/, "내전 경고 15판 정책을 선택 화면에서 보여줘야 합니다.");
assert.match(client, /30일 내 사진/, "경고 제출 기한과 수량을 등록 전에 알려야 합니다.");
assert.match(client, /빠른 사유 선택/, "자주 쓰는 사유를 한 번에 선택할 수 있어야 합니다.");
assert.match(client, /role="alert"/, "저장·검증 오류를 화면 안에서 접근 가능하게 알려야 합니다.");
assert.doesNotMatch(client, /\balert\s*\(/, "단계형 화면은 브라우저 경고창 대신 문맥 안에서 오류를 설명해야 합니다.");
assert.match(client, /DisciplineTaskHandoff/, "경고 등록 후 번호 없는 사이트 제출 안내를 표시해야 합니다.");
assert.doesNotMatch(client, /WR 인증번호|WR 안내 코드|인증번호와 제출 링크/, "등록 도우미에서 사용자에게 WR 번호를 안내하면 안 됩니다.");
assert.match(client, /다른 기록 등록/, "완료 후 다음 등록으로 바로 이어갈 수 있어야 합니다.");
assert.match(client, /징계 목록 보기/, "완료 후 전체 기록으로 이동할 수 있어야 합니다.");

assert.match(page, /운영 조치 등록 도우미/, "페이지 제목은 처음 쓰는 운영자에게 목적을 설명해야 합니다.");
assert.match(page, /@media \(max-width: 700px\)/, "단계형 등록 화면은 모바일 레이아웃을 제공해야 합니다.");

assert.match(api, /requireAdminRequest/, "등록 API의 관리자 권한 검사를 유지해야 합니다.");
assert.match(api, /createWarning/, "경고 생성은 기존 트랜잭션 워크플로를 사용해야 합니다.");
assert.match(api, /body\.warningCategory === "INHOUSE" \? "INHOUSE" : "GENERAL"/, "일반·내전 경고 정책 분기를 유지해야 합니다.");

console.log("Discipline registration wizard checks passed.");
