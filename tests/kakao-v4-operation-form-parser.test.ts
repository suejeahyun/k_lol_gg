import assert from "node:assert/strict";
import test from "node:test";

import type { OperationFormPayloadByType } from "../src/modules/recruiting/operation-forms/domain";
import { parseKakaoV4OperationForm } from "../src/modules/recruiting/kakao-v4/operation-form";
import {
  detectKakaoV4OperationFormCandidate,
  parseKakaoV4OperationFormFieldMap,
} from "../src/modules/recruiting/kakao-v4/operation-form-parser";

test("operation field map is order independent and tolerates Kakao paste punctuation", () => {
  const text = [
    "고객센터 건의 양식입니다.",
    "３＼． 건 의 내 용 ： 첫 줄\r\n둘째 줄",
    "１） 본인\u00a0이름 및 닉네임：홍길동 (본인), ⭐ / 별빛✨",
    String.raw`２\. 건 의 사 유 : 접근성`,
    "감사합니다. 문의는 별도 채널을 이용해 주세요.",
  ].join("\r\n");
  const map = parseKakaoV4OperationFormFieldMap({ formType: "suggestions", text });
  assert.deepEqual(map.fields["건의 내용"], ["첫 줄\n둘째 줄"]);
  assert.deepEqual(map.fields["본인 이름 및 닉네임"], ["홍길동 (본인), ⭐ / 별빛✨"]);

  const parsed = parseKakaoV4OperationForm({ formType: "suggestions", text, senderFallback: "보낸이" });
  assert.equal(parsed.valid, true);
  if (!parsed.valid) return;
  const payload = parsed.payload as OperationFormPayloadByType["suggestions"];
  assert.deepEqual(payload, {
    applicantName: "홍길동 (본인), ⭐",
    applicantNickname: "별빛✨",
    reason: "접근성",
    content: "첫 줄\n둘째 줄",
  });
});

test("person punctuation remains intact unless slash or pipe is explicit", () => {
  for (const person of ["홍길동 (본인), 테스터", "홍길동 😀, 테스터"]) {
    const parsed = parseKakaoV4OperationForm({
      formType: "suggestions",
      text: `본인 이름 및 닉네임: ${person}\n건의 사유: 편의성\n건의 내용: 개선`,
      senderFallback: "보낸이",
    });
    assert.equal(parsed.valid, true);
    if (!parsed.valid) continue;
    const payload = parsed.payload as OperationFormPayloadByType["suggestions"];
    assert.equal(payload.applicantName, person);
    assert.equal(payload.applicantNickname, person);
  }

  const explicit = parseKakaoV4OperationForm({
    formType: "suggestions",
    text: "본인 이름 및 닉네임: 홍길동 | 테스터\n건의 사유: 편의성\n건의 내용: 개선",
    senderFallback: "보낸이",
  });
  assert.equal(explicit.valid, true);
  if (explicit.valid) {
    const payload = explicit.payload as OperationFormPayloadByType["suggestions"];
    assert.equal(payload.applicantName, "홍길동");
    assert.equal(payload.applicantNickname, "테스터");
  }
});

test("same duplicate fields dedupe while conflicting duplicates block submission with diagnostics", () => {
  const base = "본인 이름 및 닉네임: 홍길동/테스터\n건의 사유: 편의성\n건의 내용: 개선";
  const same = parseKakaoV4OperationForm({
    formType: "suggestions",
    text: `${base}\n건의 사유: 편의성`,
    senderFallback: "보낸이",
  });
  assert.equal(same.valid, true);

  const conflict = parseKakaoV4OperationForm({
    formType: "suggestions",
    text: `${base}\n건의 사유: 운영`,
    senderFallback: "보낸이",
  });
  assert.equal(conflict.valid, false);
  if (conflict.valid) return;
  assert.deepEqual(conflict.missingFields, ["건의 사유"]);
  assert.deepEqual(conflict.diagnostics, [{
    code: "CONFLICTING_DUPLICATE_FIELD",
    fieldLabel: "건의 사유",
    occurrenceCount: 2,
  }]);
});

test("leave scope reads only its selected field value, not room names in the footer", () => {
  const parsed = parseKakaoV4OperationForm({
    formType: "leaves",
    text: [
      "<외출>",
      "외출사유: 여행",
      "외출범위:",
      "소통방",
      "※ 안내: 선택지는 소통방, 구인방, 디스코드입니다.",
      "이름 및 닉네임: 홍길동/테스터",
      "외출기간: 2026-09-10 ~ 2026-09-12",
    ].join("\n"),
    senderFallback: "보낸이",
  });
  assert.equal(parsed.valid, true);
  if (parsed.valid) assert.equal((parsed.payload as OperationFormPayloadByType["leaves"]).scope, "소통방");
});

test("candidate detection is structural and does not require complete values", () => {
  assert.equal(detectKakaoV4OperationFormCandidate("&lt;외출&gt;\r\n외출기간:\r\n외출사유:"), "leaves");
  assert.equal(detectKakaoV4OperationFormCandidate("１） 건 의 사 유：\n２） 건 의 내 용："), "suggestions");
  assert.equal(detectKakaoV4OperationFormCandidate("외출기간은 나중에 정하고 외출범위도 의논할게요."), null);
  assert.equal(detectKakaoV4OperationFormCandidate("건의 사유 를 같이 생각해요\n건의 내용 도 정리할게요"), null);
  assert.equal(detectKakaoV4OperationFormCandidate("메모: 일반 대화\n건의 사유 를 같이 생각해요\n건의 내용 도 정리할게요"), null);
});

test("operation wrappers are candidates only when they occupy a title line", () => {
  for (const [wrapper, formType] of [
    ["&lt;지인&gt;", "friends"],
    ["<건의>", "suggestions"],
    ["&lt;모임&gt;", "meetups"],
    ["<정모>", "meetups"],
    ["&lt;외출&gt;", "leaves"],
  ] as const) {
    assert.equal(detectKakaoV4OperationFormCandidate(wrapper), formType, wrapper);
    assert.equal(detectKakaoV4OperationFormCandidate(`- ${wrapper}`), formType, `bullet:${wrapper}`);
    assert.equal(detectKakaoV4OperationFormCandidate(`１＼． ${wrapper}`), formType, `number:${wrapper}`);
    assert.equal(detectKakaoV4OperationFormCandidate(`공지에 ${wrapper}이라고 적어 주세요.`), null, `prose:${wrapper}`);
  }
});

test("person fields are required and never fall back to an opaque sender identity", () => {
  const cases = [
    {
      formType: "suggestions" as const,
      label: "본인 이름 및 닉네임",
      remainder: "건의 사유: 편의성\n건의 내용: 개선",
    },
    {
      formType: "meetups" as const,
      label: "주최자 이름 및 닉네임",
      remainder: "일자: 2026-09-12\n장소: 서울\n참여자 명단: 참가자A",
    },
    {
      formType: "leaves" as const,
      label: "이름 및 닉네임",
      remainder: "외출기간: 2026-09-10 ~ 2026-09-12\n외출사유: 여행\n외출범위: 소통방",
    },
  ];

  for (const item of cases) {
    for (const text of [item.remainder, `${item.label}:\n${item.remainder}`]) {
      const parsed = parseKakaoV4OperationForm({
        formType: item.formType,
        text,
        senderFallback: "sender-user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      });
      assert.equal(parsed.valid, false, `${item.formType}:${text}`);
      if (parsed.valid) continue;
      assert.deepEqual(parsed.missingFields, [item.label]);
      assert.equal("payload" in parsed, false);
      assert.doesNotMatch(JSON.stringify(parsed), /sender-user-/u);
    }
  }
});
