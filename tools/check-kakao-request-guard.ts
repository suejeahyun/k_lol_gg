import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createHmacSignature } from "../src/lib/security/hmac";
import { rejectIfInvalidServerAuth } from "../src/lib/security/request-guard";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  SECURITY_REQUIRE_KAKAO_SECRET: process.env.SECURITY_REQUIRE_KAKAO_SECRET,
  SECURITY_REQUIRE_HMAC: process.env.SECURITY_REQUIRE_HMAC,
  KAKAO_RECRUIT_SECRET: process.env.KAKAO_RECRUIT_SECRET,
  KAKAO_RECRUIT_SECRET_NEXT: process.env.KAKAO_RECRUIT_SECRET_NEXT,
  KAKAO_OPENCHAT_SECRET: process.env.KAKAO_OPENCHAT_SECRET,
  KAKAO_SEARCH_PLAYER_SECRET: process.env.KAKAO_SEARCH_PLAYER_SECRET,
  KAKAO_SEARCH_PLAYER_SECRET_NEXT: process.env.KAKAO_SEARCH_PLAYER_SECRET_NEXT,
};
const mutableEnv = process.env as Record<string, string | undefined>;

function request(pathname: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://k-lol-gg.example${pathname}`, { headers });
}

async function run() {
  process.env.SECURITY_REQUIRE_KAKAO_SECRET = "true";
  process.env.SECURITY_REQUIRE_HMAC = "false";
  process.env.KAKAO_RECRUIT_SECRET = "recruit-secret";
  process.env.KAKAO_RECRUIT_SECRET_NEXT = "recruit-next-secret";
  process.env.KAKAO_OPENCHAT_SECRET = "openchat-secret";
  process.env.KAKAO_SEARCH_PLAYER_SECRET = "search-secret";
  process.env.KAKAO_SEARCH_PLAYER_SECRET_NEXT = "search-next-secret";

  assert.equal(
    await rejectIfInvalidServerAuth(
      request("/api/kakao/recruit/season-apply/status", {
        "x-kakao-recruit-secret": "recruit-next-secret",
      }),
    ),
    null,
    "내전 API는 중첩 기간의 NEXT 키도 허용해야 합니다.",
  );

  assert.equal(
    await rejectIfInvalidServerAuth(
      request("/api/kakao/recruit/season-apply/status", {
        "x-kakao-recruit-secret": "recruit-secret",
      }),
    ),
    null,
    "내전 API는 모집 전용 헤더를 허용해야 합니다.",
  );

  assert.equal(
    await rejectIfInvalidServerAuth(
      request("/api/kakao/openchat", {
        "x-kakao-openchat-secret": "openchat-secret",
      }),
    ),
    null,
    "오픈채팅 API는 오픈채팅 전용 헤더를 허용해야 합니다.",
  );

  assert.equal(
    await rejectIfInvalidServerAuth(
      request("/api/kakao/search-player", {
        "x-kakao-search-player-secret": "search-secret",
      }),
    ),
    null,
    "전적 검색 API는 검색 전용 헤더를 허용해야 합니다.",
  );

  assert.equal(
    await rejectIfInvalidServerAuth(
      request("/api/kakao/search-player", {
        "x-kakao-search-player-secret": "search-next-secret",
      }),
    ),
    null,
    "전적 검색 API는 중첩 기간의 NEXT 키도 허용해야 합니다.",
  );

  const wrongSecret = await rejectIfInvalidServerAuth(
    request("/api/kakao/recruit/season-apply/status", {
      "x-kakao-recruit-secret": "openchat-secret",
    }),
  );
  assert.equal(wrongSecret?.status, 401, "다른 기능의 비밀키는 거부해야 합니다.");

  assert.equal(
    await rejectIfInvalidServerAuth(request("/api/kakao/recruit/season-apply/status")),
    null,
    "자격 증명 없는 요청은 JSON 본문을 검사하는 라우트 가드까지 전달해야 합니다.",
  );

  assert.equal(
    await rejectIfInvalidServerAuth(request("/api/kakao/web-player-search")),
    null,
    "공개 웹 검색 API는 카카오봇 비밀키를 요구하면 안 됩니다.",
  );

  process.env.SECURITY_REQUIRE_HMAC = "true";
  const missingHmac = await rejectIfInvalidServerAuth(
    request("/api/kakao/recruit/season-apply/status", {
      "x-kakao-recruit-secret": "recruit-secret",
    }),
  );
  assert.equal(missingHmac?.status, 401, "HMAC 필수 모드에서는 단순 비밀키만으로 통과하면 안 됩니다.");

  const timestamp = String(Math.floor(Date.now() / 1000));
  for (const signingSecret of ["recruit-secret", "recruit-next-secret"]) {
    const signature = createHmacSignature({ secret: signingSecret, timestamp, body: "" });
    assert.equal(
      await rejectIfInvalidServerAuth(
        request("/api/kakao/recruit/season-apply/status", {
          "x-klol-timestamp": timestamp,
          "x-klol-signature": signature,
        }),
      ),
      null,
      "HMAC 중첩 기간에는 active와 NEXT 서명을 모두 허용해야 합니다.",
    );
  }

  process.env.SECURITY_REQUIRE_HMAC = "false";
  delete process.env.KAKAO_RECRUIT_SECRET_NEXT;
  assert.equal(
    await rejectIfInvalidServerAuth(
      request("/api/kakao/recruit/season-apply/status", {
        "x-kakao-recruit-secret": "recruit-secret",
      }),
    ),
    null,
    "NEXT가 없으면 기존 active 단일 키 동작을 유지해야 합니다.",
  );

  mutableEnv.NODE_ENV = "production";
  process.env.KAKAO_RECRUIT_SECRET_NEXT = "";
  const malformedOverlap = await rejectIfInvalidServerAuth(
    request("/api/kakao/recruit/season-apply/status", {
      "x-kakao-recruit-secret": "recruit-secret",
    }),
  );
  assert.equal(malformedOverlap?.status, 401, "잘못 구성된 Production 중첩은 active로 폴백하지 않아야 합니다.");

  console.log("Kakao request guard checks passed.");
}

run()
  .finally(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
