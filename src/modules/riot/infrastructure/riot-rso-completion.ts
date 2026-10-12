export function rsoCompletionResponse(status: "connected" | "denied" | "failed") {
  const destination = `/account/riot?rso=${status}`;
  const message = status === "connected" ? "Riot 계정 연결을 확인했습니다." : status === "denied" ? "Riot 계정 연결을 취소했습니다." : "Riot 계정 연결을 완료하지 못했습니다.";
  // Commit a same-site document before navigating again: Strict account cookies
  // can remain withheld throughout an HTTP redirect chain from an external site.
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=${destination}"><title>Riot 계정 연결</title></head><body><main><p>${message}</p><a href="${destination}">계정 화면으로 돌아가기</a></main></body></html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" },
  });
}
