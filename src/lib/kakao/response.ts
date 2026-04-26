import { KakaoSimpleText } from "@/types/kakao";

export function createSimpleText(text: string): KakaoSimpleText {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text,
          },
        },
      ],
    },
  };
}