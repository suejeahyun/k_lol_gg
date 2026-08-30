import type { Prisma } from "@prisma/client";

type DisciplineOwner = {
  userAccountId: number;
  playerId: number | null;
};

type DisciplineRecordOwner = {
  userAccountId: number | null;
  playerId: number | null;
};

export function disciplineRecordOwnerWhere(
  owner: DisciplineOwner,
): Prisma.UserDisciplineRecordWhereInput {
  return {
    OR: [
      { userAccountId: owner.userAccountId },
      ...(owner.playerId
        ? [{ userAccountId: null, playerId: owner.playerId }]
        : []),
    ],
  };
}

export function isDisciplineRecordOwner(
  record: DisciplineRecordOwner,
  owner: DisciplineOwner,
) {
  return record.userAccountId === owner.userAccountId
    || (
      record.userAccountId === null
      && owner.playerId !== null
      && record.playerId === owner.playerId
    );
}
