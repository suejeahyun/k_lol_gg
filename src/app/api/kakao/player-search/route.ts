import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  console.log("[KAKAO_GET_HIT]");
  return NextResponse.json({
    ok: true,
    message: "GET OK",
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text().catch(() => "");
  console.log("[KAKAO_POST_HIT]");
  console.log("[KAKAO_HEADERS]", JSON.stringify(Object.fromEntries(req.headers.entries())));
  console.log("[KAKAO_RAW_BODY]", rawBody);

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