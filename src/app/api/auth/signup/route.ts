import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";
import { writeAdminLog } from "@/lib/admin-log";
import { hashPassword } from "@/lib/auth/password";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { userId, password, name, nickname, tag, peakTier, currentTier } = body;

    if (!userId || !password || !name || !nickname || !tag) {
      return NextResponse.json(
        { message: "아이디, 비밀번호, 이름, 닉네임, 태그는 필수입니다." },
        { status: 400 },
      );
    }

    const normalizedUserId = String(userId).trim();
    const normalizedName = String(name).trim();
    const normalizedNickname = String(nickname).trim();
    const normalizedTag = String(tag).replace(/^#/, "").trim();

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

    const passwordHash = await hashPassword(password);

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
              peakTier: existingPlayer.peakTier ?? peakTier ?? null,
              currentTier: existingPlayer.currentTier ?? currentTier ?? null,
              userAccountId: user.id,
            },
          })
        : await tx.player.create({
            data: {
              name: normalizedName,
              nickname: normalizedNickname,
              tag: normalizedTag,
              peakTier: peakTier || null,
              currentTier: currentTier || null,
              userAccountId: user.id,
            },
          });

      await writeAdminLog({
        action: existingPlayer ? "USER_SIGNUP_PLAYER_LINK" : "USER_SIGNUP",
        message: `회원가입 신청: #${user.id} ${user.userId} / 플레이어 #${player.id} ${player.nickname}#${player.tag}`,
        db: tx,
      });
    });

    return NextResponse.json(
      {
        message:
          "회원가입 신청이 완료되었습니다. 관리자 승인 후 이용할 수 있습니다.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[AUTH_SIGNUP_POST_ERROR]", error);

    return NextResponse.json(
      { message: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
