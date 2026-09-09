import { definePublicProblem, problemResponse } from "@/platform/http";
import type { KakaoHttpRequestFailureCode } from "../infrastructure/kakao-http-request";

const problems = Object.freeze({
  signature: definePublicProblem({ code: "INVALID_SIGNATURE", status: 401, title: "봇 설치 인증 실패", detail: "MessengerBot 설치본의 서버 주소와 서명 키를 확인해 주세요." }),
  installationKey: definePublicProblem({ code: "INVALID_SIGNATURE", status: 401, title: "설치본 키가 일치하지 않습니다.", detail: "/봇버전의 installation/key ID와 서버 등록 정보를 확인해 주세요." }),
  installationRevoked: definePublicProblem({ code: "INSTALLATION_REVOKED", status: 403, title: "회수된 봇 설치본입니다.", detail: "/봇버전의 설치본 ID를 관리자에게 전달해 ACTIVE 복구 또는 새 설치본 연결 여부를 확인해 주세요." }),
  binding: definePublicProblem({ code: "ROOM_BINDING_REQUIRED", status: 403, title: "봇 설치본 연결이 필요합니다.", detail: "/V2연동확인의 설치본 ID를 확인한 뒤 관리자가 발급한 일회용 코드로 연결해 주세요." }),
  notRegistered: definePublicProblem({ code: "ROOM_NOT_REGISTERED", status: 403, title: "등록되지 않은 카카오톡 설치본", detail: "/V2연동확인 결과를 사이트 관리자에게 전달해 설치본을 등록해 주세요." }),
  paused: definePublicProblem({ code: "ROOM_PAUSED", status: 403, title: "일시 중지된 카카오톡 방", detail: "이 방의 Kakao 기능이 일시 중지되었습니다. 관리자에게 문의해 주세요." }),
  capability: definePublicProblem({ code: "ROOM_CAPABILITY_FORBIDDEN", status: 403, title: "이 방에서 사용할 수 없는 기능입니다.", detail: "구인구직 방과 사이트 기능 방의 연결 프로필을 확인해 주세요." }),
  role: definePublicProblem({ code: "ROLE_FORBIDDEN", status: 403, title: "이 동작을 수행할 역할이 없습니다.", detail: "방 역할 또는 사이트 관리자 권한을 확인해 주세요." }),
  unavailable: definePublicProblem({ code: "KAKAO_REGISTRY_UNAVAILABLE", status: 503, title: "카카오 방 등록 정보를 확인할 수 없습니다.", detail: "잠시 후 다시 시도해 주세요." }),
});

export function kakaoWebhookFailureResponse(code: KakaoHttpRequestFailureCode, traceId?: string) {
  const problem = code === "INSTALLATION_KEY_MISMATCH"
    ? problems.installationKey
    : code === "INSTALLATION_REVOKED"
      ? problems.installationRevoked
    : code === "ROOM_BINDING_REQUIRED"
    ? problems.binding
    : code === "ROOM_NOT_REGISTERED" || code === "ROOM_FORBIDDEN"
    ? problems.notRegistered
    : code === "ROOM_PAUSED"
      ? problems.paused
      : code === "ROOM_CAPABILITY_FORBIDDEN"
        ? problems.capability
      : code === "ROLE_FORBIDDEN" || code === "CAPABILITY_FORBIDDEN"
        ? problems.role
        : code === "REGISTRY_UNAVAILABLE"
          ? problems.unavailable
          : problems.signature;
  return problemResponse(problem, { traceId });
}
