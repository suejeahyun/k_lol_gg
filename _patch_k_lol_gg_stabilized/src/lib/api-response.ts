import { NextResponse } from "next/server";

export type ApiResponseBody<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string | null;
  message?: string | null;
  meta?: unknown;
};

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "알 수 없는 오류가 발생했습니다.";
}

export function apiOk<T>(data: T, message: string | null = null, init?: ResponseInit) {
  return NextResponse.json<ApiResponseBody<T>>(
    { ok: true, data, error: null, message },
    init,
  );
}

export function apiFail(message: string, status = 500, error: string | null = null, meta?: unknown) {
  return NextResponse.json<ApiResponseBody>(
    { ok: false, data: null, error, message, meta },
    { status },
  );
}

export function serverError(message = "서버 오류가 발생했습니다.") {
  return apiFail(message, 500);
}

export function badRequest(message: string) {
  return apiFail(message, 400);
}

export function unauthorized(message = "인증이 필요합니다.") {
  return apiFail(message, 401);
}

export function forbidden(message = "권한이 없습니다.") {
  return apiFail(message, 403);
}

export function notFound(message = "대상을 찾을 수 없습니다.") {
  return apiFail(message, 404);
}
