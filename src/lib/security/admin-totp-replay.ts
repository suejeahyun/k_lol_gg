import { prisma } from "@/lib/prisma/client";

export async function consumeAdminTotpStep(userAccountId: number, step: number) {
  if (!Number.isSafeInteger(step) || step < 0) return false;

  const result = await prisma.userAccount.updateMany({
    where: {
      id: userAccountId,
      OR: [
        { adminTotpLastUsedStep: null },
        { adminTotpLastUsedStep: { lt: BigInt(step) } },
      ],
    },
    data: {
      adminTotpLastUsedStep: BigInt(step),
    },
  });

  return result.count === 1;
}
