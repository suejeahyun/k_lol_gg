import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/client";

type RateLimitOptions = {
  action: string;
  limit: number;
  windowSeconds: number;
  key?: string;
};

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "unknown";
}

export async function rejectIfRateLimited(
  request: NextRequest,
  options: RateLimitOptions,
) {
  const ip = getClientIp(request);
  const key = `${options.action}:${options.key ?? ip}`;
  const windowStart = new Date(Date.now() - options.windowSeconds * 1000);

  const count = await prisma.rateLimitLog.count({
    where: {
      key,
      action: options.action,
      createdAt: {
        gte: windowStart,
      },
    },
  });

  if (count >= options.limit) {
    return NextResponse.json(
      {
        message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(options.windowSeconds),
        },
      },
    );
  }

  await prisma.rateLimitLog.create({
    data: {
      key,
      action: options.action,
    },
  });

  return null;
}

export async function cleanupOldRateLimitLogs(days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return prisma.rateLimitLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });
}
