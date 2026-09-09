import { definePublicProblem } from "@/platform/http/problem";

import type { KakaoHttpRequestFailureCode } from "../infrastructure/kakao-http-request";

const webhookProblems = Object.freeze({
  integration: definePublicProblem({ code: "KAKAO_INTEGRATION_ERROR", status: 401, title: "연동 설정 오류", detail: "연동 설정 오류: 봇의 서버 주소와 서명 설정을 확인해 주세요." }),
  installationKey: definePublicProblem({ code: "INVALID_SIGNATURE", status: 401, title: "설치본 키가 일치하지 않습니다.", detail: "/봇버전의 installation/key ID와 서버 등록 정보를 확인해 주세요." }),
  installationRevoked: definePublicProblem({ code: "INSTALLATION_REVOKED", status: 403, title: "회수된 봇 설치본입니다.", detail: "/봇버전의 설치본 ID를 관리자에게 전달해 주세요." }),
  room: definePublicProblem({ code: "KAKAO_ROOM_FORBIDDEN", status: 403, title: "이 카카오톡 설치본은 아직 연동되지 않았습니다.", detail: "이 봇 설치본은 아직 canonical 방에 연결되지 않았습니다. /V2연동확인 결과를 관리자에게 전달해 주세요." }),
  capability: definePublicProblem({ code: "KAKAO_CAPABILITY_FORBIDDEN", status: 403, title: "이 기능 권한 없음", detail: "이 기능 권한 없음: 이 양식의 제출 또는 관리 권한을 확인해 주세요." }),
});

export function operationFormWebhookFailureProblem(code: KakaoHttpRequestFailureCode) {
  return code === "INSTALLATION_KEY_MISMATCH"
    ? webhookProblems.installationKey
    : code === "INSTALLATION_REVOKED"
      ? webhookProblems.installationRevoked
      : code === "ROOM_FORBIDDEN"
    ? webhookProblems.room
    : code === "CAPABILITY_FORBIDDEN"
      ? webhookProblems.capability
      : webhookProblems.integration;
}
