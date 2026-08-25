export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/requireAdmin";
import { prisma } from "@/lib/prisma/client";
import type { Prisma } from "@prisma/client";
import { requireSiteFeature } from "@/lib/site/feature-guard";

const TYPES = new Set(["DISCIPLINE", "INHOUSE_RESULT"]);
const REQUIRED_KEYS: Record<string, string[]> = {
  DISCIPLINE: ["targetName", "targetNicknameTag", "warningCategory", "issuedDate", "evidenceImageCount"],
  INHOUSE_RESULT: ["matchDate", "organizer", "gameCount", "seriesNumber", "teamBalanceDraftId", "note"],
};

export async function GET() {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;
  if (!await requireAdminRequest()) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  return NextResponse.json(await prisma.kakaoFormTemplate.findMany({ orderBy: [{ formType: "asc" }, { version: "desc" }], take: 200 }));
}

export async function POST(req: NextRequest) {
  const premiumLock = await requireSiteFeature("kakao");
  if (premiumLock) return premiumLock;
  const admin = await requireAdminRequest();
  if (!admin) return NextResponse.json({ message: "관리자 권한이 필요합니다." }, { status: 401 });
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const formType = String(body.formType || "").toUpperCase();
  if (!TYPES.has(formType)) return NextResponse.json({ message: "지원하지 않는 양식 종류입니다." }, { status: 400 });
  const title = String(body.title || "").trim();
  const instructions = String(body.instructions || "").trim();
  const commandAliases = Array.isArray(body.commandAliases) ? body.commandAliases.map(String).map((v) => v.trim()).filter(Boolean) : [];
  const fields = Array.isArray(body.fields) ? body.fields : [];
  if (!title || commandAliases.length === 0 || fields.length === 0) return NextResponse.json({ message: "제목, 명령어, 필드가 필요합니다." }, { status: 400 });
  const canonicalCommand = formType === "DISCIPLINE" ? "/경고" : "/내전등록";
  if (!commandAliases.includes(canonicalCommand)) return NextResponse.json({ message: `${canonicalCommand} 기본 명령어는 삭제할 수 없습니다.` }, { status: 400 });
  if (!title.includes("양식")) return NextResponse.json({ message: "봇이 완성 양식을 구분할 수 있도록 제목에 ‘양식’을 포함해주세요." }, { status: 400 });
  const fieldKeys = fields.map((field) => field && typeof field === "object" ? String((field as Record<string, unknown>).key || "") : "");
  if (new Set(fieldKeys).size !== fieldKeys.length || REQUIRED_KEYS[formType].some((key) => !fieldKeys.includes(key))) return NextResponse.json({ message: "필수 필드 key를 삭제·중복할 수 없습니다. 라벨과 안내 문구는 변경할 수 있습니다." }, { status: 400 });
  if (formType === "DISCIPLINE" && fieldKeys.some((key) => /reason/i.test(key))) return NextResponse.json({ message: "경고 사유는 카카오 양식에 추가할 수 없습니다. 관리자 승인 단계에서만 입력합니다." }, { status: 400 });
  const latest = await prisma.kakaoFormTemplate.findFirst({ where: { formType }, orderBy: { version: "desc" }, select: { version: true } });
  const created = await prisma.kakaoFormTemplate.create({ data: { formType, version: (latest?.version ?? 0) + 1, status: "DRAFT", title, instructions, commandAliases: commandAliases as Prisma.InputJsonValue, fieldsJson: fields as Prisma.InputJsonValue, publishedById: admin.user.id } });
  return NextResponse.json(created);
}
