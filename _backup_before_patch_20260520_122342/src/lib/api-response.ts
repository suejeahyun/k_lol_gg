import { NextResponse } from "next/server";

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "알 수 없는 오류가 발생했습니다.";
}

export function serverError(message = "서버 오류가 발생했습니다.") {
  return NextResponse.json({ message }, { status: 500 });
}

export function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 });
}
