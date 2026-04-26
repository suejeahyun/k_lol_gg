import { KakaoSkillResponse } from "@/types/kakao";

export function createSimpleText(text: string): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          basicCard: {
            title: "K-LOL.GG 전적검색",
            description: text,
          },
        },
      ],
    },
  };
}