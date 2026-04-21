import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: "K-LOL 스킬 연결 테스트 성공",
            },
          },
        ],
      },
    },
    { status: 200 }
  );
}