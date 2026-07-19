import { logServerError } from "@/lib/server/safe-log";
﻿export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rejectIfRateLimited } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { hashPassword } from "@/lib/auth/password";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  const rateLimitRejected = await rejectIfRateLimited(req, {
    action: "AUTH_SIGNUP",
    limit: 5,
    windowSeconds: 3600,
  });

  if (rateLimitRejected) return rateLimitRejected;

  try {
    const body = await req.json();

    const { userId, password, name, nickname, tag } = body;

    if (!userId || !password || !name || !nickname || !tag) {
      return NextResponse.json(
        { message: "아이디, 비밀번호, 이름, 닉네임, 태그는 필수입니다." },
        { status: 400 },
      );
    }

    const normalizedUserId = String(userId).trim();
    const normalizedPassword = String(password);
    const normalizedName = String(name).trim();
    const normalizedNickname = String(nickname).trim();
    const normalizedTag = String(tag).replace(/^#/, "").trim();

    if (normalizedUserId.length < 4 || normalizedUserId.length > 32) {
      return NextResponse.json(
        { message: "아이디는 4~32자로 입력해주세요." },
        { status: 400 },
      );
    }

    if (normalizedPassword.length < 8 || normalizedPassword.length > 32) {
      return NextResponse.json(
        { message: "비밀번호는 8~32자로 입력해주세요." },
        { status: 400 },
      );
    }

    if (!normalizedName || !normalizedNickname || !normalizedTag) {
      return NextResponse.json(
        { message: "이름, 닉네임, 태그를 정확히 입력해주세요." },
        { status: 400 },
      );
    }

    if (
      normalizedName.length > 50 ||
      normalizedNickname.length > 100 ||
      normalizedTag.length > 30
    ) {
      return NextResponse.json(
        { message: "이름, 닉네임 또는 태그가 허용 길이를 초과했습니다." },
        { status: 400 },
      );
    }

    const existingUser = await prisma.userAccount.findUnique({
      where: { userId: normalizedUserId },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "이미 사용 중인 아이디입니다." },
        { status: 409 },
      );
    }

    const existingPlayer = await prisma.player.findUnique({
      where: {
        nickname_tag: {
          nickname: normalizedNickname,
          tag: normalizedTag,
        },
      },
      include: {
        userAccount: true,
      },
    });

    if (existingPlayer?.userAccountId) {
      return NextResponse.json(
        { message: "이미 다른 계정과 연결된 Riot ID입니다." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(normalizedPassword);

    await prisma.$transaction(async (tx) => {
      const user = await tx.userAccount.create({
        data: {
          userId: normalizedUserId,
          passwordHash,
          status: "PENDING",
          role: "USER",
        },
      });

      const player = existingPlayer
        ? await tx.player.update({
            where: { id: existingPlayer.id },
            data: {
              name: existingPlayer.name || normalizedName,
              userAccountId: user.id,
              isActive: true,
              deactivatedAt: null,
            },
          })
        : await tx.player.create({
            data: {
              name: normalizedName,
              nickname: normalizedNickname,
              tag: normalizedTag,
              userAccountId: user.id,
            },
          });

      await writeAdminLog({
        action: existingPlayer ? "USER_SIGNUP_PLAYER_LINK" : "USER_SIGNUP",
        message: `회원가입 승인 대기: #${user.id} ${user.userId} / 플레이어 #${player.id} ${player.nickname}#${player.tag}`,
        db: tx,
      });
    });

    return NextResponse.json(
      {
        message: "회원가입이 완료되었습니다. 관리자 승인 후 이용할 수 있습니다.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { message: "이미 사용 중인 아이디 또는 Riot ID입니다." },
        { status: 409 },
      );
    }

    logServerError("[AUTH_SIGNUP_POST_ERROR]", error);

    return NextResponse.json(
      { message: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}



