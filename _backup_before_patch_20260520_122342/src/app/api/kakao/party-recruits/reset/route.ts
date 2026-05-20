export const dynamic = "force-dynamic";
export const revalidate = 0;

import { partyRecruitJson } from "../_shared";

export async function POST() {
  return partyRecruitJson(
    {
      reply: [
        "[K-LOL.GG 구인구직 모집번호 초기화 안내]",
        "",
        "카카오톡 모집번호초기화 명령어는 비활성화되었습니다.",
        "모집번호 초기화는 관리자 페이지에서만 실행할 수 있습니다.",
        "",
        "관리자 경로: /admin/recruits",
      ].join("\n"),
    },
    410,
  );
}
