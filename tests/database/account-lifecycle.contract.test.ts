import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import bcrypt from "bcryptjs";
import { and, count, eq, sql } from "drizzle-orm";

import {
  accountMutationScope,
  fingerprintAccountMutation,
  parseSignupInput,
  type AccountMutationCommand,
  type AccountStatusInput,
  type SignupInput,
} from "../../src/modules/accounts/domain/account-contracts";
import { protectAccountReceiptMaterial } from "../../src/modules/accounts/domain/account-receipt-protection";
import { PostgresAccountRepository } from "../../src/modules/accounts/infrastructure/postgres-account-repository";
import { PostgresAuthRepository } from "../../src/modules/auth/infrastructure/postgres-auth-repository";
import {
  encryptTotpSecret,
  fingerprintTotpCredential,
} from "../../src/modules/auth/infrastructure/totp-envelope";
import { generateTotpSecret } from "../../src/modules/auth/infrastructure/totp";
import { parseTotpEncryptionKeyring } from "../../src/modules/auth/infrastructure/versioned-secret-keyring";
import { identifyPasswordHash, hashPassword } from "../../src/modules/auth/infrastructure/node-password";
import { PostgresPlayerRepository } from "../../src/modules/players/infrastructure/postgres-player-repository";
import {
  playerMutationFingerprint,
  playerMutationScope,
  type PlayerMutationCommand,
} from "../../src/modules/players/domain/admin-player";
import { PostgresAdminPlayerRepository } from "../../src/modules/players/infrastructure/postgres-admin-player-repository";
import { idempotencyHashMaterial, readIdempotencyKey } from "../../src/platform/http/index";
import { createDatabaseHandle, type V2Database } from "../../src/platform/db/database";
import { applyMigrations } from "../../src/platform/db/migrate";
import {
  accountMutationReceipts,
  adminTotpCredentials,
  auditEvents,
  authSessions,
  championCatalog,
  destructionApplicationIndex,
  destructionCompetitions,
  eventCompetitions,
  eventParticipantIndex,
  matchGames,
  matchParticipants,
  matchSeries,
  passwordResetRequests,
  playerAccountClaims,
  players,
  seasons,
  userAccounts,
} from "../../src/platform/db/schema/index";
import { assertSafeTestDatabase } from "../../src/platform/db/test-guard";

type Administrator = Readonly<{
  id: string;
  loginId: string;
  role: "ADMIN" | "SUPER_ADMIN";
  sessionId: string;
  authVersion: number;
}>;

function key(label: string) {
  return `${label}-${randomBytes(18).toString("base64url")}`;
}

function postgresConstraint(name: string) {
  return (error: unknown) => {
    let current: unknown = error;
    while (current && typeof current === "object") {
      if ((current as { constraint?: string }).constraint === name) return true;
      current = (current as { cause?: unknown }).cause;
    }
    return false;
  };
}

function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  while (current && typeof current === "object") {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function command(
  actor: Readonly<{
    id: string;
    role: "USER" | "ADMIN" | "SUPER_ADMIN";
    sessionId: string;
    authVersion: number;
  }> | null,
  scope: string,
  requestFingerprint: string,
  options: { idempotencyKey?: string; requestId?: string; now?: Date } = {},
): AccountMutationCommand {
  const idempotency = readIdempotencyKey(new Headers({
    "Idempotency-Key": options.idempotencyKey ?? key(scope.replaceAll(":", "-")),
  }));
  assert.equal(idempotency.ok, true);
  if (!idempotency.ok) throw new Error("Synthetic idempotency key was rejected.");
  const protectedMaterial = protectAccountReceiptMaterial(
    Buffer.alloc(32, 0xa1),
    scope,
    actor ? `admin:${actor.id}` : `public:${scope}`,
    requestFingerprint,
  );
  return {
    actorUserAccountId: actor?.id ?? null,
    actorSession: actor
      ? {
          userAccountId: actor.id,
          role: actor.role,
          authVersion: actor.authVersion,
          sessionId: actor.sessionId,
        }
      : undefined,
    principalKeyMaterial: protectedMaterial.principalKeyMaterial,
    idempotencyKeyMaterial: idempotencyHashMaterial(idempotency.key, scope),
    requestFingerprint: protectedMaterial.requestFingerprint,
    requestId: options.requestId ?? randomUUID(),
    now: options.now ?? new Date(),
  };
}

async function seedAdministrator(
  database: V2Database,
  role: "ADMIN" | "SUPER_ADMIN",
  label: string,
): Promise<Administrator> {
  const id = randomUUID();
  const sessionId = randomUUID();
  const loginId = `${label}_${randomBytes(4).toString("hex")}`;
  const now = new Date();
  await database.insert(userAccounts).values({
    id,
    loginId,
    loginIdNormalized: loginId,
    passwordHash: await hashPassword(`${label}-password-2026`),
    role,
    status: "APPROVED",
    statusChangedAt: now,
  });
  await database.insert(authSessions).values({
    id: sessionId,
    tokenHash: randomBytes(32),
    userAccountId: id,
    authVersion: 0,
    role,
    purpose: "ADMIN",
    totpVerifiedAt: now,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60_000),
  });
  return { id, loginId, role, sessionId, authVersion: 0 };
}

function parsedSignup(label: string, riotId: string): SignupInput {
  const parsed = parseSignupInput({
    loginId: `${label}_${randomBytes(3).toString("hex")}`,
    password: `살랑바람${randomBytes(6).toString("hex")}2026`,
    memberName: `합성 회원 ${label}`,
    riotId,
    termsAccepted: true,
    privacyAccepted: true,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Synthetic signup input was rejected.");
  return parsed.value;
}

function signupCommand(input: SignupInput, idempotencyKey = key("signup")) {
  return command(
    null,
    "account:signup",
    fingerprintAccountMutation({
      action: "signup",
      loginId: input.loginIdNormalized,
      riotId: `${input.nicknameNormalized}#${input.tagLineNormalized}`,
      memberName: input.memberNameNormalized,
      password: input.password,
    }),
    { idempotencyKey },
  );
}

function statusCommand(
  actor: Administrator,
  accountId: string,
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED",
  revision: number,
  input: AccountStatusInput,
  options: { requestId?: string } = {},
) {
  const scope = accountMutationScope(`status-${status.toLowerCase()}`, accountId);
  return command(
    actor,
    scope,
    fingerprintAccountMutation({ action: `status-${status}`, accountId, revision, ...input }),
    options,
  );
}

function playerCommand(
  actor: Administrator,
  scope: string,
  requestFingerprint: string,
): PlayerMutationCommand {
  const parsed = readIdempotencyKey(new Headers({
    "Idempotency-Key": key(scope.replaceAll(":", "-")),
  }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("Synthetic player idempotency key was rejected.");
  return {
    actorUserAccountId: actor.id,
    actorSession: {
      userAccountId: actor.id,
      sessionId: actor.sessionId,
      role: actor.role,
      authVersion: actor.authVersion,
    },
    requestId: randomUUID(),
    idempotencyKeyMaterial: idempotencyHashMaterial(parsed.key, scope),
    requestFingerprint,
    now: new Date(),
  };
}

async function seedLinkedAccount(
  database: V2Database,
  label: string,
  role: "USER" | "ADMIN" = "USER",
  passwordHash: string | null = null,
) {
  const id = randomUUID();
  const loginId = `${label}_${randomBytes(4).toString("hex")}`;
  const playerId = randomUUID();
  await database.insert(userAccounts).values({
    id,
    loginId,
    loginIdNormalized: loginId,
    passwordHash,
    role,
    status: "APPROVED",
  });
  const nickname = `Player${randomBytes(4).toString("hex")}`;
  await database.insert(players).values({
    id: playerId,
    userAccountId: id,
    memberName: `합성 ${label}`,
    memberNameNormalized: `합성 ${label}`.normalize("NFKC").toLocaleLowerCase("ko-KR"),
    nickname,
    nicknameNormalized: nickname.toLocaleLowerCase("ko-KR"),
    tagLine: "S01",
    tagLineNormalized: "s01",
  });
  return { id, loginId, playerId };
}

function recursivelyAssertPublicAccount(value: unknown) {
  const forbidden = new Set([
    "passwordhash",
    "totp",
    "internalreason",
    "membername",
    "sessiontoken",
    "tokenhash",
    "playerclaimreview",
  ]);
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) return candidate.forEach(visit);
    for (const [keyName, child] of Object.entries(candidate)) {
      const normalized = keyName.replaceAll(/[^a-z]/gi, "").toLocaleLowerCase("en-US");
      assert.equal(forbidden.has(normalized), false, `public DTO leaked ${keyName}`);
      visit(child);
    }
  };
  visit(value);
}

test("S01 account lifecycle, recovery security, races, replay, and rollback hold on PostgreSQL 18", async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, "TEST_DATABASE_URL must be injected by the isolated harness.");
  assertSafeTestDatabase({
    connectionString,
    nodeEnv: process.env.NODE_ENV,
    testMode: process.env.V2_DB_TEST_MODE,
  });

  const { database, pool } = createDatabaseHandle(connectionString, { max: 8 });
  try {
    await applyMigrations(database);
    const admin = await seedAdministrator(database, "ADMIN", "account_admin");
    const superAdmin = await seedAdministrator(database, "SUPER_ADMIN", "account_super");
    const repository = new PostgresAccountRepository(database);
    const publicPlayers = new PostgresPlayerRepository(database);
    const adminPlayers = new PostgresAdminPlayerRepository(database);
    const owner = await seedLinkedAccount(database, "self_edit", "USER", await hashPassword("owner-password-2026"));
    const ownerSessionId = randomUUID();
    await database.insert(authSessions).values({
      id: ownerSessionId,
      tokenHash: randomBytes(32),
      userAccountId: owner.id,
      authVersion: 0,
      role: "USER",
      purpose: "ACCOUNT",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    const activityNow = new Date();
    const activityEventId = randomUUID();
    const activityDestructionId = randomUUID();
    const activitySeasonId = randomUUID();
    const activityMatchId = randomUUID();
    const activityGameId = randomUUID();
    await database.insert(eventCompetitions).values({
      id: activityEventId,
      title: "내 이벤트 계약",
      titleNormalized: "내 이벤트 계약",
      format: "POSITION",
      status: "RECRUITING",
      recruitmentOpensAt: new Date(activityNow.getTime() - 60_000),
      recruitmentClosesAt: new Date(activityNow.getTime() + 60_000),
      bracketBestOf: 3,
      aggregateJson: {},
      revision: 1,
      createdByUserAccountId: admin.id,
      updatedByUserAccountId: admin.id,
      createdAt: activityNow,
      updatedAt: activityNow,
    });
    await database.insert(eventParticipantIndex).values({
      eventId: activityEventId,
      participantId: `participant-${owner.playerId}`,
      playerId: owner.playerId,
      ownerUserAccountId: owner.id,
      source: "USER_APPLICATION",
      status: "ACTIVE",
      mainPosition: "MID",
      subPositionsJson: [],
      updatedAt: activityNow,
    });
    await database.insert(destructionCompetitions).values({
      id: activityDestructionId,
      title: "내 멸망전 계약",
      titleNormalized: "내 멸망전 계약",
      status: "RECRUITING",
      preliminaryFormat: "FULL_ROUND_ROBIN_BO1",
      teamCount: 4,
      participantCount: 1,
      aggregateJson: {},
      revision: 1,
      createdByUserAccountId: admin.id,
      updatedByUserAccountId: admin.id,
      createdAt: activityNow,
      updatedAt: activityNow,
    });
    await database.insert(destructionApplicationIndex).values({
      tournamentId: activityDestructionId,
      applicationId: randomUUID(),
      ownerUserAccountId: owner.id,
      playerId: owner.playerId,
      position: "MID",
      status: "CONFIRMED",
      updatedAt: activityNow,
    });
    await database.insert(seasons).values({ id: activitySeasonId, name: "활동 계약 시즌", nameNormalized: "활동 계약 시즌" });
    await database.insert(championCatalog).values({ key: "activity-ahri", displayName: "아리" });
    await database.insert(matchSeries).values({
      id: activityMatchId,
      seasonId: activitySeasonId,
      title: "내전 참여 계약",
      titleNormalized: "내전 참여 계약",
      playedOn: "2026-09-08",
      blueWins: 1,
      redWins: 0,
      gameCount: 1,
      status: "PUBLISHED",
      publishedAt: activityNow,
    });
    await database.insert(matchGames).values({
      id: activityGameId,
      seriesId: activityMatchId,
      gameNumber: 1,
      durationSeconds: 1_800,
      winnerTeam: "BLUE",
      mvpPlayerId: owner.playerId,
      mvpScoreUnits2: 30,
      mvpFormulaVersion: "V1_COMPAT_1",
      mvpSelection: "WINNER_SCORE_KDA_PLAYER_ID_V1",
    });
    await database.insert(matchParticipants).values({
      id: randomUUID(),
      gameId: activityGameId,
      playerId: owner.playerId,
      nicknameSnapshot: "활동 선수",
      tagLineSnapshot: "KR1",
      championKey: "activity-ahri",
      team: "BLUE",
      position: "MID",
      kills: 8,
      deaths: 2,
      assists: 7,
      mvpScoreUnits2: 30,
      mvpFormulaVersion: "V1_COMPAT_1",
    });
    const selfActivity = await repository.findSelfParticipations(owner.id);
    assert.deepEqual(new Set(selfActivity.map((item) => item.kind)), new Set(["MATCH", "EVENT", "DESTRUCTION"]));
    assert.equal(selfActivity.every((item) => !Object.hasOwn(item, "ownerUserAccountId")), true);
    await database.delete(matchParticipants).where(eq(matchParticipants.gameId, activityGameId));
    await database.delete(matchGames).where(eq(matchGames.id, activityGameId));
    await database.delete(matchSeries).where(eq(matchSeries.id, activityMatchId));
    await database.delete(championCatalog).where(eq(championCatalog.key, "activity-ahri"));
    await database.delete(seasons).where(eq(seasons.id, activitySeasonId));
    await database.delete(destructionApplicationIndex).where(eq(destructionApplicationIndex.tournamentId, activityDestructionId));
    await database.delete(destructionCompetitions).where(eq(destructionCompetitions.id, activityDestructionId));
    await database.delete(eventParticipantIndex).where(eq(eventParticipantIndex.eventId, activityEventId));
    await database.delete(eventCompetitions).where(eq(eventCompetitions.id, activityEventId));
    const ownPlayerInput = { nickname: `Owner${randomBytes(3).toString("hex")}`, tagLine: "KR1", peakTier: "플래티넘 4", currentTier: "골드 2" } as const;
    const ownPlayerScope = accountMutationScope("self-player", owner.id);
    const ownPlayerOutcome = await repository.updateOwnPlayer(
      ownPlayerInput,
      0,
      command(
        { id: owner.id, role: "USER", sessionId: ownerSessionId, authVersion: 0 },
        ownPlayerScope,
        fingerprintAccountMutation({ action: "self-player", expectedPlayerRevision: 0, player: ownPlayerInput }),
      ),
    );
    assert.equal(ownPlayerOutcome.type, "success");
    if (ownPlayerOutcome.type === "success") {
      assert.equal(ownPlayerOutcome.response.account?.player?.riotId, `${ownPlayerInput.nickname}#KR1`);
      assert.equal(ownPlayerOutcome.response.playerRevision, 1);
    }
    const ownPlayerAudit = await database.select({ action: auditEvents.action }).from(auditEvents).where(and(eq(auditEvents.targetId, owner.playerId), eq(auditEvents.action, "PLAYER_SELF_UPDATED")));
    assert.equal(ownPlayerAudit.length, 1);
    const unrelatedExpiredAccountReceiptKey = randomBytes(32);
    await database.insert(accountMutationReceipts).values({
      actorUserAccountId: null,
      principalKeyHash: randomBytes(32),
      scope: "account:unrelated-expired-retention",
      keyHash: unrelatedExpiredAccountReceiptKey,
      requestHash: randomBytes(32),
      responseStatus: 202,
      responseJson: { message: "expired unrelated receipt" },
      createdAt: new Date(Date.now() - 48 * 60 * 60_000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60_000),
    });

    const newSignup = parsedSignup("new_player", `New${randomBytes(4).toString("hex")}#S01`);
    const signedUp = await repository.signup(
      newSignup,
      await hashPassword(newSignup.password),
      signupCommand(newSignup),
    );
    assert.equal(signedUp.type, "success");
    assert.equal((await database.select({ value: count() }).from(accountMutationReceipts).where(
      eq(accountMutationReceipts.keyHash, unrelatedExpiredAccountReceiptKey),
    ))[0]?.value, 1, "an account command must not globally delete unrelated expired receipts");
    if (signedUp.type !== "success" || !signedUp.response.account) {
      throw new Error("New-player signup failed.");
    }
    const newAccountId = signedUp.response.account.id;
    recursivelyAssertPublicAccount(signedUp.response.account);
    const signupEvidence = (
      await database
        .select({ termsVersion: userAccounts.termsVersion, privacyVersion: userAccounts.privacyVersion })
        .from(userAccounts)
        .where(eq(userAccounts.id, newAccountId))
    )[0];
    assert.deepEqual(signupEvidence, {
      termsVersion: "terms-2026-09-01.1",
      privacyVersion: "privacy-2026-09-01.1",
    });
    const newLinkedPlayer = (
      await database.select().from(players).where(eq(players.userAccountId, newAccountId))
    )[0];
    assert.equal(newLinkedPlayer?.status, "INACTIVE");
    assert.ok(newLinkedPlayer?.accountLifecycleDeactivatedAt);
    assert.equal(await publicPlayers.findById(newLinkedPlayer!.id), null);
    assert.equal((await publicPlayers.search(newSignup.nickname)).length, 0);

    const linkedApproval: AccountStatusInput = {
      publicReason: "가입 신청이 승인되었습니다.",
      internalReason: "신규 연결 플레이어 검토 완료",
      expectedClaimId: null,
      claimOwnershipReviewed: false,
    };
    const invalidLinkedApproval: AccountStatusInput = {
      ...linkedApproval,
      expectedClaimId: randomUUID(),
      claimOwnershipReviewed: true,
    };
    const auditBeforeInvalidApproval = (await database.select({ value: count() }).from(auditEvents))[0]!.value;
    const invalidApproval = await repository.changeStatus(
      newAccountId,
      "APPROVED",
      invalidLinkedApproval,
      0,
      statusCommand(admin, newAccountId, "APPROVED", 0, invalidLinkedApproval),
    );
    assert.deepEqual(invalidApproval, { type: "conflict", reason: "PLAYER_CLAIM_STATE_CHANGED" });
    assert.equal((await database.select().from(userAccounts).where(eq(userAccounts.id, newAccountId)))[0]?.status, "PENDING");
    assert.equal((await database.select().from(players).where(eq(players.id, newLinkedPlayer!.id)))[0]?.status, "INACTIVE");
    assert.equal((await database.select({ value: count() }).from(auditEvents))[0]!.value, auditBeforeInvalidApproval);
    assert.equal((await database.select({ value: count() }).from(accountMutationReceipts).where(
      eq(accountMutationReceipts.actorUserAccountId, admin.id),
    ))[0]?.value, 0);
    const approvedNew = await repository.changeStatus(
      newAccountId,
      "APPROVED",
      linkedApproval,
      0,
      statusCommand(admin, newAccountId, "APPROVED", 0, linkedApproval),
    );
    assert.equal(approvedNew.type, "success");
    assert.equal((await publicPlayers.findById(newLinkedPlayer!.id))?.id, newLinkedPlayer!.id);

    const rejectInput = {
      publicReason: "가입 정보를 다시 확인해 주세요.",
      internalReason: "합성 계약: 재검토 필요",
      confirmLoginId: newSignup.loginId,
    };
    const rejectedNew = await repository.changeStatus(
      newAccountId,
      "REJECTED",
      rejectInput,
      1,
      statusCommand(admin, newAccountId, "REJECTED", 1, rejectInput),
    );
    assert.equal(rejectedNew.type, "success");
    const lifecycleInactive = (
      await database.select().from(players).where(eq(players.id, newLinkedPlayer!.id))
    )[0];
    assert.equal(lifecycleInactive?.status, "INACTIVE");
    assert.ok(lifecycleInactive?.accountLifecycleDeactivatedAt);

    const pendingInput = {
      publicReason: "재검토를 시작합니다.",
      internalReason: "합성 계약: 승인 대기 복귀",
      confirmLoginId: newSignup.loginId,
    };
    const reopenedNew = await repository.changeStatus(
      newAccountId,
      "PENDING",
      pendingInput,
      2,
      statusCommand(admin, newAccountId, "PENDING", 2, pendingInput),
    );
    assert.equal(reopenedNew.type, "success");
    assert.equal(
      (await database.select().from(players).where(eq(players.id, newLinkedPlayer!.id)))[0]?.status,
      "INACTIVE",
    );

    const reapprovedNew = await repository.changeStatus(
      newAccountId,
      "APPROVED",
      linkedApproval,
      3,
      statusCommand(admin, newAccountId, "APPROVED", 3, linkedApproval),
    );
    assert.equal(reapprovedNew.type, "success");

    const pendingFromApproved = await repository.changeStatus(
      newAccountId,
      "PENDING",
      pendingInput,
      4,
      statusCommand(admin, newAccountId, "PENDING", 4, pendingInput),
    );
    assert.equal(pendingFromApproved.type, "success");
    assert.equal((await publicPlayers.findById(newLinkedPlayer!.id)), null);
    const approvedAfterPending = await repository.changeStatus(
      newAccountId,
      "APPROVED",
      linkedApproval,
      5,
      statusCommand(admin, newAccountId, "APPROVED", 5, linkedApproval),
    );
    assert.equal(approvedAfterPending.type, "success");
    assert.equal((await publicPlayers.findById(newLinkedPlayer!.id))?.id, newLinkedPlayer!.id);

    const deleteScope = accountMutationScope("delete", newAccountId);
    const deleteReason = "합성 계약: 소프트 삭제";
    const deleted = await repository.softDelete(
      newAccountId,
      deleteReason,
      newSignup.loginId,
      6,
      command(
        superAdmin,
        deleteScope,
        fingerprintAccountMutation({ action: "delete", target: newAccountId, revision: 6, deleteReason }),
      ),
    );
    assert.equal(deleted.type, "success");
    assert.equal(
      (await database.select().from(players).where(eq(players.id, newLinkedPlayer!.id)))[0]?.status,
      "INACTIVE",
    );
    const restoreScope = accountMutationScope("restore", newAccountId);
    const restored = await repository.restore(
      newAccountId,
      "합성 계약: 복구",
      newSignup.loginId,
      7,
      command(
        superAdmin,
        restoreScope,
        fingerprintAccountMutation({ action: "restore", target: newAccountId, revision: 7 }),
      ),
    );
    assert.equal(restored.type, "success");
    assert.equal(
      (await database.select().from(players).where(eq(players.id, newLinkedPlayer!.id)))[0]?.status,
      "INACTIVE",
    );

    const existingPlayerId = randomUUID();
    const claimNick = `Existing${randomBytes(4).toString("hex")}`;
    const accountLifecycleDeactivatedAt = new Date();
    await database.insert(players).values({
      id: existingPlayerId,
      memberName: "기존 비공개 회원",
      memberNameNormalized: "기존 비공개 회원",
      nickname: claimNick,
      nicknameNormalized: claimNick.toLocaleLowerCase("ko-KR"),
      tagLine: "CLAIM",
      tagLineNormalized: "claim",
      status: "INACTIVE",
      deactivatedAt: accountLifecycleDeactivatedAt,
      accountLifecycleDeactivatedAt,
    });
    const claimSignup = parsedSignup("claim", `${claimNick}#CLAIM`);
    const claimedSignup = await repository.signup(
      claimSignup,
      await hashPassword(claimSignup.password),
      signupCommand(claimSignup),
    );
    assert.equal(claimedSignup.type, "success");
    if (claimedSignup.type !== "success" || !claimedSignup.response.account) {
      throw new Error("Claim signup failed.");
    }
    const claimAccountId = claimedSignup.response.account.id;
    const unchangedPlayer = (
      await database.select().from(players).where(eq(players.id, existingPlayerId))
    )[0];
    assert.equal(unchangedPlayer?.userAccountId, null);
    assert.equal(unchangedPlayer?.status, "INACTIVE");
    const claim = (
      await database
        .select()
        .from(playerAccountClaims)
        .where(eq(playerAccountClaims.userAccountId, claimAccountId))
    )[0];
    assert.equal(claim?.status, "PENDING");
    const adminClaimDto = await repository.findAdmin(claimAccountId, "SUPER_ADMIN");
    assert.equal(adminClaimDto?.playerClaimReview?.targetPlayer.memberName, "기존 비공개 회원");
    assert.equal(adminClaimDto?.playerClaimReview?.ownershipVerified, false);
    recursivelyAssertPublicAccount(await repository.findSelf(claimAccountId));

    const missingAck: AccountStatusInput = {
      publicReason: "승인",
      internalReason: "수동 검토 확인 누락 계약",
      expectedClaimId: claim!.id,
      claimOwnershipReviewed: false,
    };
    assert.deepEqual(
      await repository.changeStatus(
        claimAccountId,
        "APPROVED",
        missingAck,
        0,
        statusCommand(admin, claimAccountId, "APPROVED", 0, missingAck),
      ),
      { type: "conflict", reason: "PLAYER_CLAIM_ACK_REQUIRED" },
    );
    const acknowledged: AccountStatusInput = {
      ...missingAck,
      internalReason: "가입 입력과 기존 플레이어 수동 대조 완료",
      claimOwnershipReviewed: true,
    };
    const claimApproved = await repository.changeStatus(
      claimAccountId,
      "APPROVED",
      acknowledged,
      0,
      statusCommand(admin, claimAccountId, "APPROVED", 0, acknowledged),
    );
    assert.equal(claimApproved.type, "success");
    const approvedClaimPlayer = (
      await database.select().from(players).where(eq(players.id, existingPlayerId))
    )[0];
    assert.equal(approvedClaimPlayer?.userAccountId, claimAccountId);
    assert.equal(approvedClaimPlayer?.status, "ACTIVE");
    assert.equal(approvedClaimPlayer?.deactivatedAt, null);
    assert.equal(approvedClaimPlayer?.accountLifecycleDeactivatedAt, null);

    const rejectionAuditPlayerId = randomUUID();
    const rejectionAuditNickname = `RejectAudit${randomBytes(4).toString("hex")}`;
    await database.insert(players).values({
      id: rejectionAuditPlayerId,
      memberName: "claim 감사 대상 회원",
      memberNameNormalized: "claim 감사 대상 회원",
      nickname: rejectionAuditNickname,
      nicknameNormalized: rejectionAuditNickname.toLocaleLowerCase("ko-KR"),
      tagLine: "S01",
      tagLineNormalized: "s01",
    });
    const rejectionAuditSignup = parsedSignup(
      "claim_rejection_audit",
      `${rejectionAuditNickname}#S01`,
    );
    const rejectionAuditAccount = await repository.signup(
      rejectionAuditSignup,
      await hashPassword(rejectionAuditSignup.password),
      signupCommand(rejectionAuditSignup),
    );
    assert.equal(rejectionAuditAccount.type, "success");
    if (rejectionAuditAccount.type !== "success" || !rejectionAuditAccount.response.account) {
      throw new Error("Claim rejection audit signup failed.");
    }
    const rejectionAuditAccountId = rejectionAuditAccount.response.account.id;
    const rejectionAuditClaim = (await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.userAccountId, rejectionAuditAccountId),
    ))[0];
    assert.ok(rejectionAuditClaim);
    const rejectionPrivateReason = "claim 거절 감사 전용 내부 사유";
    const rejectionInput: AccountStatusInput = {
      publicReason: "가입 정보를 다시 확인해 주세요.",
      internalReason: rejectionPrivateReason,
      confirmLoginId: rejectionAuditSignup.loginId,
    };
    assert.equal((await repository.changeStatus(
      rejectionAuditAccountId,
      "REJECTED",
      rejectionInput,
      0,
      statusCommand(admin, rejectionAuditAccountId, "REJECTED", 0, rejectionInput),
    )).type, "success");
    const rejectionAudit = (await database.select().from(auditEvents).where(and(
      eq(auditEvents.action, "PLAYER_ACCOUNT_CLAIM_REJECTED"),
      eq(auditEvents.targetId, rejectionAuditClaim!.id),
    )))[0];
    assert.ok(rejectionAudit, "claim rejection must retain an immutable claim-scoped audit");
    assert.equal(rejectionAudit?.metadataJson?.internalReason, rejectionPrivateReason);
    assert.equal(rejectionAudit?.metadataJson?.reasonRecorded, true);
    const reopenRejectedClaim: AccountStatusInput = {
      publicReason: "claim 재검토를 시작합니다.",
      internalReason: "claim 감사 이력 보존 후 재검토",
      confirmLoginId: rejectionAuditSignup.loginId,
    };
    assert.equal((await repository.changeStatus(
      rejectionAuditAccountId,
      "PENDING",
      reopenRejectedClaim,
      1,
      statusCommand(admin, rejectionAuditAccountId, "PENDING", 1, reopenRejectedClaim),
    )).type, "success");
    const rejectionAuditApproval: AccountStatusInput = {
      publicReason: "claim 검토가 완료되었습니다.",
      internalReason: "거절·재검토·승인 감사 연속성 검증",
      expectedClaimId: rejectionAuditClaim!.id,
      claimOwnershipReviewed: true,
    };
    assert.equal((await repository.changeStatus(
      rejectionAuditAccountId,
      "APPROVED",
      rejectionAuditApproval,
      2,
      statusCommand(admin, rejectionAuditAccountId, "APPROVED", 2, rejectionAuditApproval),
    )).type, "success");
    const claimAuditActions = (await database.select({
      action: auditEvents.action,
      metadata: auditEvents.metadataJson,
    }).from(auditEvents).where(and(
      eq(auditEvents.targetType, "PLAYER_ACCOUNT_CLAIM"),
      eq(auditEvents.targetId, rejectionAuditClaim!.id),
    ))).map((event) => event.action);
    assert.ok(claimAuditActions.includes("PLAYER_ACCOUNT_CLAIM_REJECTED"));
    assert.ok(claimAuditActions.includes("PLAYER_ACCOUNT_CLAIM_REOPENED"));
    assert.ok(claimAuditActions.includes("PLAYER_ACCOUNT_CLAIM_APPROVED"));
    const publicRejectionAccount = await repository.findSelf(rejectionAuditAccountId);
    recursivelyAssertPublicAccount(publicRejectionAccount);
    assert.equal(JSON.stringify(publicRejectionAccount).includes(rejectionPrivateReason), false);

    const claimLockOrderPlayerId = randomUUID();
    const claimLockOrderNickname = `ClaimLock${randomBytes(4).toString("hex")}`;
    await database.insert(players).values({
      id: claimLockOrderPlayerId,
      memberName: "claim lock order 회원",
      memberNameNormalized: "claim lock order 회원",
      nickname: claimLockOrderNickname,
      nicknameNormalized: claimLockOrderNickname.toLocaleLowerCase("ko-KR"),
      tagLine: "S01",
      tagLineNormalized: "s01",
    });
    const claimLockOrderSignup = parsedSignup(
      "claim_lock_order_owner",
      `${claimLockOrderNickname}#S01`,
    );
    const claimLockOrderAccount = await repository.signup(
      claimLockOrderSignup,
      await hashPassword(claimLockOrderSignup.password),
      signupCommand(claimLockOrderSignup),
    );
    assert.equal(claimLockOrderAccount.type, "success");
    if (claimLockOrderAccount.type !== "success" || !claimLockOrderAccount.response.account) {
      throw new Error("Claim lock-order signup failed.");
    }
    const claimLockOrderAccountId = claimLockOrderAccount.response.account.id;
    const claimLockOrderRow = (await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.userAccountId, claimLockOrderAccountId),
    ))[0];
    assert.ok(claimLockOrderRow);
    const claimLockOrderApproval: AccountStatusInput = {
      publicReason: "lock order 승인",
      internalReason: "player→claim 잠금 순서 경합 검증",
      expectedClaimId: claimLockOrderRow!.id,
      claimOwnershipReviewed: true,
    };
    const competingConnection = await pool.connect();
    let competingInsertCode: string | undefined;
    try {
      await competingConnection.query("begin");
      await competingConnection.query("set local lock_timeout = '1500ms'");
      await competingConnection.query("set local statement_timeout = '3000ms'");
      await competingConnection.query(
        "select id from registry.players where id = $1 for update",
        [claimLockOrderPlayerId],
      );
      const approvalPromise = repository.changeStatus(
        claimLockOrderAccountId,
        "APPROVED",
        claimLockOrderApproval,
        0,
        statusCommand(
          admin,
          claimLockOrderAccountId,
          "APPROVED",
          0,
          claimLockOrderApproval,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      const competingAccountId = randomUUID();
      const competingLogin = `claim_lock_competitor_${randomBytes(4).toString("hex")}`;
      await competingConnection.query(
        `insert into auth.user_accounts
          (id, login_id, login_id_normalized, role, status)
         values ($1, $2, $2, 'USER', 'PENDING')`,
        [competingAccountId, competingLogin],
      );
      try {
        await competingConnection.query(
          `insert into registry.player_account_claims
            (id, user_account_id, player_id, requested_member_name, requested_riot_id, status)
           values ($1, $2, $3, $4, $5, 'PENDING')`,
          [
            randomUUID(),
            competingAccountId,
            claimLockOrderPlayerId,
            "경쟁 claim 회원",
            `${claimLockOrderNickname}#S01`,
          ],
        );
      } catch (error) {
        competingInsertCode = postgresCode(error);
      }
      assert.equal(
        competingInsertCode,
        "23505",
        "player-first signup critical section must fail by uniqueness, not deadlock or timeout",
      );
      await competingConnection.query("rollback");
      const approvalResult = await approvalPromise;
      assert.equal(approvalResult.type, "success");
    } finally {
      await competingConnection.query("rollback").catch(() => undefined);
      competingConnection.release();
    }
    assert.equal((await database.select().from(players).where(
      eq(players.id, claimLockOrderPlayerId),
    ))[0]?.userAccountId, claimLockOrderAccountId);

    const deleteClaimPlayerId = randomUUID();
    const deleteClaimNickname = `DeleteClaim${randomBytes(4).toString("hex")}`;
    await database.insert(players).values({
      id: deleteClaimPlayerId,
      memberName: "삭제 claim 대상 회원",
      memberNameNormalized: "삭제 claim 대상 회원",
      nickname: deleteClaimNickname,
      nicknameNormalized: deleteClaimNickname.toLocaleLowerCase("ko-KR"),
      tagLine: "S01",
      tagLineNormalized: "s01",
    });
    const deletedClaimOwnerSignup = parsedSignup(
      "deleted_claim_owner",
      `${deleteClaimNickname}#S01`,
    );
    const deletedClaimOwner = await repository.signup(
      deletedClaimOwnerSignup,
      await hashPassword(deletedClaimOwnerSignup.password),
      signupCommand(deletedClaimOwnerSignup),
    );
    assert.equal(deletedClaimOwner.type, "success");
    if (deletedClaimOwner.type !== "success" || !deletedClaimOwner.response.account) {
      throw new Error("Deleted claim owner signup failed.");
    }
    const deletedClaimOwnerId = deletedClaimOwner.response.account.id;
    const deletedClaimRow = (await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.userAccountId, deletedClaimOwnerId),
    ))[0];
    assert.ok(deletedClaimRow);
    const competingClaimSignup = parsedSignup(
      "deleted_claim_competitor",
      `${deleteClaimNickname}#S01`,
    );
    const competingClaimHash = await hashPassword(competingClaimSignup.password);
    const deleteClaimScope = accountMutationScope("delete", deletedClaimOwnerId);
    const [deletedClaimAccount, racingCompetingSignup] = await Promise.all([
      repository.softDelete(
        deletedClaimOwnerId,
        "삭제 계정의 player claim 예약 해제",
        deletedClaimOwnerSignup.loginId,
        0,
        command(
          superAdmin,
          deleteClaimScope,
          fingerprintAccountMutation({ action: "delete-claim-release", target: deletedClaimOwnerId }),
        ),
      ),
      repository.signup(
        competingClaimSignup,
        competingClaimHash,
        signupCommand(competingClaimSignup),
      ),
    ]);
    assert.equal(deletedClaimAccount.type, "success");
    assert.ok(
      racingCompetingSignup.type === "success" ||
      (racingCompetingSignup.type === "conflict" && racingCompetingSignup.reason === "PLAYER_CLAIM_PENDING"),
    );
    const releasedClaim = (await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.id, deletedClaimRow!.id),
    ))[0];
    assert.equal(releasedClaim?.status, "REJECTED");
    assert.equal(releasedClaim?.reviewedByUserAccountId, superAdmin.id);
    const finalCompetingSignup = racingCompetingSignup.type === "success"
      ? racingCompetingSignup
      : await repository.signup(
          competingClaimSignup,
          competingClaimHash,
          signupCommand(competingClaimSignup),
        );
    assert.equal(finalCompetingSignup.type, "success");
    if (finalCompetingSignup.type !== "success" || !finalCompetingSignup.response.account) {
      throw new Error("Competing claim did not succeed after release.");
    }
    assert.equal((await database.select().from(playerAccountClaims).where(and(
      eq(playerAccountClaims.userAccountId, finalCompetingSignup.response.account.id),
      eq(playerAccountClaims.status, "PENDING"),
    ))).length, 1);
    const restoreDeletedClaimScope = accountMutationScope("restore", deletedClaimOwnerId);
    assert.deepEqual(await repository.restore(
      deletedClaimOwnerId,
      "경쟁 claim 선점 시 복구 전체 롤백",
      deletedClaimOwnerSignup.loginId,
      1,
      command(
        superAdmin,
        restoreDeletedClaimScope,
        fingerprintAccountMutation({ action: "restore-claim-owner", target: deletedClaimOwnerId }),
      ),
    ), { type: "conflict", reason: "PLAYER_CLAIM_TAKEN" });
    assert.equal((await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.id, deletedClaimRow!.id),
    ))[0]?.status, "REJECTED");
    const restoreConflictAccount = (await database.select().from(userAccounts).where(
      eq(userAccounts.id, deletedClaimOwnerId),
    ))[0];
    assert.ok(restoreConflictAccount?.deletedAt);
    assert.equal(restoreConflictAccount?.status, "REJECTED");
    assert.equal(restoreConflictAccount?.revision, 1);

    const recoverablePlayerId = randomUUID();
    const recoverableNickname = `RecoverableClaim${randomBytes(4).toString("hex")}`;
    await database.insert(players).values({
      id: recoverablePlayerId,
      memberName: "복구 가능한 claim 회원",
      memberNameNormalized: "복구 가능한 claim 회원",
      nickname: recoverableNickname,
      nicknameNormalized: recoverableNickname.toLocaleLowerCase("ko-KR"),
      tagLine: "S01",
      tagLineNormalized: "s01",
    });
    const recoverableSignup = parsedSignup(
      "recoverable_deleted_claim",
      `${recoverableNickname}#S01`,
    );
    const recoverableAccount = await repository.signup(
      recoverableSignup,
      await hashPassword(recoverableSignup.password),
      signupCommand(recoverableSignup),
    );
    assert.equal(recoverableAccount.type, "success");
    if (recoverableAccount.type !== "success" || !recoverableAccount.response.account) {
      throw new Error("Recoverable claim signup failed.");
    }
    const recoverableAccountId = recoverableAccount.response.account.id;
    const recoverableClaim = (await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.userAccountId, recoverableAccountId),
    ))[0];
    assert.ok(recoverableClaim);
    const recoverableResetRequestId = randomUUID();
    await database.insert(passwordResetRequests).values({
      id: recoverableResetRequestId,
      userAccountId: recoverableAccountId,
      loginIdHash: randomBytes(32),
      status: "PENDING",
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    });
    const recoverableDelete = await repository.softDelete(
      recoverableAccountId,
      "복구 가능한 claim과 reset request 삭제 처리",
      recoverableSignup.loginId,
      0,
      command(
        superAdmin,
        accountMutationScope("delete", recoverableAccountId),
        fingerprintAccountMutation({ action: "delete-recoverable-claim", target: recoverableAccountId }),
      ),
    );
    assert.equal(recoverableDelete.type, "success");
    const cancelledReset = (await database.select().from(passwordResetRequests).where(
      eq(passwordResetRequests.id, recoverableResetRequestId),
    ))[0];
    assert.equal(cancelledReset?.status, "CANCELLED");
    assert.ok(cancelledReset?.resolvedAt);
    assert.equal(cancelledReset?.resolvedByUserAccountId, superAdmin.id);
    const recoverableRestore = await repository.restore(
      recoverableAccountId,
      "경쟁 claim 없음 확인 후 안전 복구",
      recoverableSignup.loginId,
      1,
      command(
        superAdmin,
        accountMutationScope("restore", recoverableAccountId),
        fingerprintAccountMutation({ action: "restore-recoverable-claim", target: recoverableAccountId }),
      ),
    );
    assert.equal(recoverableRestore.type, "success");
    assert.equal((await database.select().from(playerAccountClaims).where(
      eq(playerAccountClaims.id, recoverableClaim!.id),
    ))[0]?.status, "PENDING");
    assert.equal((await database.select().from(passwordResetRequests).where(
      eq(passwordResetRequests.id, recoverableResetRequestId),
    ))[0]?.status, "CANCELLED");
    const recoverableApproval: AccountStatusInput = {
      publicReason: "복구 claim 승인",
      internalReason: "복구 시 선점 재검사와 수동 소유 검토 완료",
      expectedClaimId: recoverableClaim!.id,
      claimOwnershipReviewed: true,
    };
    assert.equal((await repository.changeStatus(
      recoverableAccountId,
      "APPROVED",
      recoverableApproval,
      2,
      statusCommand(admin, recoverableAccountId, "APPROVED", 2, recoverableApproval),
    )).type, "success");
    assert.equal((await database.select().from(players).where(
      eq(players.id, recoverablePlayerId),
    ))[0]?.userAccountId, recoverableAccountId);

    assert.equal((await repository.softDelete(
      recoverableAccountId,
      "연결 계정 삭제 후 복구 경로 검증",
      recoverableSignup.loginId,
      3,
      command(
        superAdmin,
        accountMutationScope("delete", recoverableAccountId),
        fingerprintAccountMutation({ action: "delete-linked-recoverable", target: recoverableAccountId }),
      ),
    )).type, "success");
    assert.equal((await repository.restore(
      recoverableAccountId,
      "연결 player 보존 계정 복구",
      recoverableSignup.loginId,
      4,
      command(
        superAdmin,
        accountMutationScope("restore", recoverableAccountId),
        fingerprintAccountMutation({ action: "restore-linked-recoverable", target: recoverableAccountId }),
      ),
    )).type, "success");
    const linkedReapproval: AccountStatusInput = {
      publicReason: "연결 계정 재승인",
      internalReason: "보존된 연결 player 수명주기 재검토",
      expectedClaimId: null,
      claimOwnershipReviewed: false,
    };
    assert.equal((await repository.changeStatus(
      recoverableAccountId,
      "APPROVED",
      linkedReapproval,
      5,
      statusCommand(admin, recoverableAccountId, "APPROVED", 5, linkedReapproval),
    )).type, "success");
    assert.equal((await database.select().from(players).where(
      eq(players.id, recoverablePlayerId),
    ))[0]?.status, "ACTIVE");

    const resetDeleteRaceTarget = await seedLinkedAccount(
      database,
      "password_reset_delete_race",
      "USER",
      await hashPassword("reset-delete-race-original-password-2026"),
    );
    const resetDeleteRaceRequestId = randomUUID();
    await database.insert(passwordResetRequests).values({
      id: resetDeleteRaceRequestId,
      userAccountId: resetDeleteRaceTarget.id,
      loginIdHash: randomBytes(32),
      status: "PENDING",
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    });
    const resetDeleteTemporaryPassword = `Race-${randomBytes(18).toString("base64url")}9A`;
    const [passwordReviewRace, accountDeleteRace] = await Promise.all([
      repository.resetPassword(
        resetDeleteRaceTarget.id,
        await hashPassword(resetDeleteTemporaryPassword),
        resetDeleteTemporaryPassword,
        "복구 요청 검토와 계정 삭제 경합",
        resetDeleteRaceTarget.loginId,
        0,
        command(
          superAdmin,
          accountMutationScope("password-reset", resetDeleteRaceTarget.id),
          fingerprintAccountMutation({
            action: "password-reset-delete-race",
            target: resetDeleteRaceTarget.id,
            revision: 0,
          }),
        ),
      ),
      repository.softDelete(
        resetDeleteRaceTarget.id,
        "복구 요청 검토와 계정 삭제 경합",
        resetDeleteRaceTarget.loginId,
        0,
        command(
          superAdmin,
          accountMutationScope("delete", resetDeleteRaceTarget.id),
          fingerprintAccountMutation({
            action: "delete-password-reset-race",
            target: resetDeleteRaceTarget.id,
            revision: 0,
          }),
        ),
      ),
    ]);
    assert.equal(
      [passwordReviewRace, accountDeleteRace].filter((outcome) => outcome.type === "success").length,
      1,
      "target row locking must serialize password review and account deletion",
    );
    const resetDeleteRaceRequest = (await database.select().from(passwordResetRequests).where(
      eq(passwordResetRequests.id, resetDeleteRaceRequestId),
    ))[0];
    assert.ok(
      resetDeleteRaceRequest?.status === "RESOLVED" ||
      resetDeleteRaceRequest?.status === "CANCELLED",
    );
    assert.ok(resetDeleteRaceRequest?.resolvedAt);
    assert.equal(resetDeleteRaceRequest?.resolvedByUserAccountId, superAdmin.id);
    assert.equal((await database.select().from(userAccounts).where(
      eq(userAccounts.id, resetDeleteRaceTarget.id),
    ))[0]?.revision, 1);

    const queuedResetTarget = await seedLinkedAccount(
      database,
      "queued_admin_reset_clock",
      "USER",
      await hashPassword("queued-admin-reset-original-2026"),
    );
    const queuedResetRequestId = randomUUID();
    const queuedResetTemporaryPassword = `Queued-${randomBytes(18).toString("base64url")}9A`;
    const queuedResetBlocker = await pool.connect();
    let queuedResetRequestedAt: Date | null = null;
    let queuedAdminRecoveryPromise: Promise<Awaited<ReturnType<typeof repository.requestPasswordReset>>> | null = null;
    try {
      await queuedResetBlocker.query("begin");
      await queuedResetBlocker.query(
        "select id from auth.user_accounts where id = $1 for update",
        [queuedResetTarget.id],
      );
      const queuedResetPromise = repository.resetPassword(
        queuedResetTarget.id,
        await hashPassword(queuedResetTemporaryPassword),
        queuedResetTemporaryPassword,
        "잠금 대기 후 복구 기록 시각 검증",
        queuedResetTarget.loginId,
        0,
        command(
          superAdmin,
          accountMutationScope("password-reset", queuedResetTarget.id),
          fingerprintAccountMutation({
            action: "queued-admin-password-reset",
            target: queuedResetTarget.id,
            revision: 0,
          }),
          { now: new Date(Date.now() - 60_000) },
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 180));
      queuedResetRequestedAt = new Date();
      await queuedResetBlocker.query(
        `insert into auth.password_reset_requests
           (id, user_account_id, login_id_hash, status, requested_at, expires_at)
         values ($1, $2, $3, 'PENDING', $4, $5)`,
        [
          queuedResetRequestId,
          queuedResetTarget.id,
          randomBytes(32),
          queuedResetRequestedAt,
          new Date(queuedResetRequestedAt.getTime() + 7 * 24 * 60 * 60_000),
        ],
      );
      queuedAdminRecoveryPromise = repository.requestPasswordReset(
        queuedResetTarget.loginId,
        randomBytes(32),
        command(
          null,
          "account:reset-request",
          fingerprintAccountMutation({
            action: "queued-after-admin-password-reset",
            loginId: queuedResetTarget.loginId,
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 120));
      await queuedResetBlocker.query("commit");
      assert.equal((await queuedResetPromise).type, "success");
      assert.equal((await queuedAdminRecoveryPromise).type, "success");
    } finally {
      await queuedResetBlocker.query("rollback").catch(() => undefined);
      queuedResetBlocker.release();
    }
    assert.ok(queuedResetRequestedAt);
    const queuedResolvedRequest = (
      await database.select().from(passwordResetRequests).where(
        eq(passwordResetRequests.id, queuedResetRequestId),
      )
    )[0];
    assert.equal(queuedResolvedRequest?.status, "RESOLVED");
    assert.equal(queuedResolvedRequest?.resolvedByUserAccountId, superAdmin.id);
    assert.ok(queuedResolvedRequest?.resolvedAt);
    assert.ok(
      queuedResolvedRequest!.resolvedAt!.getTime() >= queuedResetRequestedAt!.getTime(),
      "admin reset resolution must use a wall clock sampled after the account lock wait",
    );
    const queuedResetAccount = (
      await database.select().from(userAccounts).where(eq(userAccounts.id, queuedResetTarget.id))
    )[0];
    assert.ok(queuedResetAccount?.passwordChangedAt);
    assert.ok(queuedResetAccount!.passwordChangedAt!.getTime() >= queuedResetRequestedAt!.getTime());
    const queuedResetAudit = (
      await database.select().from(auditEvents).where(and(
        eq(auditEvents.targetId, queuedResetTarget.id),
        eq(auditEvents.action, "ACCOUNT_PASSWORD_RESET"),
      ))
    )[0];
    assert.ok(queuedResetAudit?.createdAt);
    assert.ok(queuedResetAudit!.createdAt.getTime() >= queuedResetRequestedAt!.getTime());
    assert.equal((await database.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.userAccountId, queuedResetTarget.id),
      eq(passwordResetRequests.status, "PENDING"),
    ))).length, 0, "recovery admitted before a queued admin reset must be suppressed");
    assert.equal((await repository.requestPasswordReset(
      queuedResetTarget.loginId,
      randomBytes(32),
      command(
        null,
        "account:reset-request",
        fingerprintAccountMutation({
          action: "recovery-after-admin-password-reset-complete",
          loginId: queuedResetTarget.loginId,
        }),
      ),
    )).type, "success");
    assert.equal((await database.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.userAccountId, queuedResetTarget.id),
      eq(passwordResetRequests.status, "PENDING"),
    ))).length, 1, "recovery admitted after the admin reset must remain available");

    const independentInactivePlayerId = randomUUID();
    const independentInactiveNick = `Independent${randomBytes(4).toString("hex")}`;
    await database.insert(players).values({
      id: independentInactivePlayerId,
      memberName: "운영상 독립 비활성 회원",
      memberNameNormalized: "운영상 독립 비활성 회원",
      nickname: independentInactiveNick,
      nicknameNormalized: independentInactiveNick.toLocaleLowerCase("ko-KR"),
      tagLine: "S01",
      tagLineNormalized: "s01",
      status: "INACTIVE",
      deactivatedAt: new Date(),
      accountLifecycleDeactivatedAt: null,
    });
    const independentSignup = parsedSignup(
      "independent_inactive_claim",
      `${independentInactiveNick}#S01`,
    );
    const independentSubmitted = await repository.signup(
      independentSignup,
      await hashPassword(independentSignup.password),
      signupCommand(independentSignup),
    );
    assert.equal(independentSubmitted.type, "success");
    if (independentSubmitted.type !== "success" || !independentSubmitted.response.account) {
      throw new Error("Independent inactive claim signup failed.");
    }
    const independentAccountId = independentSubmitted.response.account.id;
    const independentClaim = (
      await database.select().from(playerAccountClaims).where(
        eq(playerAccountClaims.userAccountId, independentAccountId),
      )
    )[0];
    assert.ok(independentClaim);
    const independentApproval: AccountStatusInput = {
      publicReason: "승인 검토 중입니다.",
      internalReason: "독립 비활성 정책 우회 방지",
      expectedClaimId: independentClaim!.id,
      claimOwnershipReviewed: true,
    };
    assert.deepEqual(
      await repository.changeStatus(
        independentAccountId,
        "APPROVED",
        independentApproval,
        0,
        statusCommand(admin, independentAccountId, "APPROVED", 0, independentApproval),
      ),
      { type: "conflict", reason: "ACTIVE_PLAYER_REQUIRED" },
    );
    assert.equal((await database.select().from(players).where(
      eq(players.id, independentInactivePlayerId),
    ))[0]?.userAccountId, null);

    // Approval and the explicit S02 reactivation share the actor/session lock.
    // Either order is safe: approval must wait for explicit reactivation or
    // return without side effects and succeed on the administrator's retry.
    const reactivationScope = playerMutationScope("reactivate", independentInactivePlayerId);
    const [racingApproval, racingReactivation] = await Promise.all([
      repository.changeStatus(
        independentAccountId,
        "APPROVED",
        independentApproval,
        0,
        statusCommand(admin, independentAccountId, "APPROVED", 0, independentApproval),
      ),
      adminPlayers.reactivate(
        independentInactivePlayerId,
        0,
        playerCommand(
          admin,
          reactivationScope,
          playerMutationFingerprint({
            action: "reactivate",
            playerId: independentInactivePlayerId,
            expectedRevision: 0,
          }),
        ),
      ),
    ]);
    assert.equal(racingReactivation.type, "success");
    assert.ok(
      racingApproval.type === "success" ||
      (racingApproval.type === "conflict" && racingApproval.reason === "ACTIVE_PLAYER_REQUIRED"),
    );
    if (racingApproval.type !== "success") {
      assert.equal((await repository.changeStatus(
        independentAccountId,
        "APPROVED",
        independentApproval,
        0,
        statusCommand(admin, independentAccountId, "APPROVED", 0, independentApproval),
      )).type, "success");
    }
    const independentlyLinked = (await database.select().from(players).where(
      eq(players.id, independentInactivePlayerId),
    ))[0];
    assert.equal(independentlyLinked?.status, "ACTIVE");
    assert.equal(independentlyLinked?.userAccountId, independentAccountId);
    assert.equal((await database.select().from(userAccounts).where(
      eq(userAccounts.id, independentAccountId),
    ))[0]?.status, "APPROVED");

    const reopenPlayerId = randomUUID();
    const reopenNick = `Reopen${randomBytes(4).toString("hex")}`;
    await database.insert(players).values({
      id: reopenPlayerId,
      memberName: "재검토 기존 회원",
      memberNameNormalized: "재검토 기존 회원",
      nickname: reopenNick,
      nicknameNormalized: reopenNick.toLocaleLowerCase("ko-KR"),
      tagLine: "S01",
      tagLineNormalized: "s01",
    });
    const reopenSignup = parsedSignup("reopen_claim", `${reopenNick}#S01`);
    const reopenSubmitted = await repository.signup(
      reopenSignup,
      await hashPassword(reopenSignup.password),
      signupCommand(reopenSignup),
    );
    assert.equal(reopenSubmitted.type, "success");
    if (reopenSubmitted.type !== "success" || !reopenSubmitted.response.account) throw new Error();
    const reopenAccountId = reopenSubmitted.response.account.id;
    assert.equal((await repository.changeStatus(
      reopenAccountId,
      "REJECTED",
      { ...rejectInput, confirmLoginId: reopenSignup.loginId },
      0,
      statusCommand(admin, reopenAccountId, "REJECTED", 0, { ...rejectInput, confirmLoginId: reopenSignup.loginId }),
    )).type, "success");
    assert.equal((await repository.changeStatus(
      reopenAccountId,
      "PENDING",
      { ...pendingInput, confirmLoginId: reopenSignup.loginId },
      1,
      statusCommand(admin, reopenAccountId, "PENDING", 1, { ...pendingInput, confirmLoginId: reopenSignup.loginId }),
    )).type, "success");
    const reopenedClaim = (
      await database.select().from(playerAccountClaims).where(
        eq(playerAccountClaims.userAccountId, reopenAccountId),
      )
    )[0];
    assert.equal(reopenedClaim?.status, "PENDING");
    assert.equal((await repository.changeStatus(
      reopenAccountId,
      "APPROVED",
      { ...acknowledged, expectedClaimId: reopenedClaim!.id },
      2,
      statusCommand(
        admin,
        reopenAccountId,
        "APPROVED",
        2,
        { ...acknowledged, expectedClaimId: reopenedClaim!.id },
      ),
    )).type, "success");

    const takenPlayerId = randomUUID();
    const takenNick = `Taken${randomBytes(4).toString("hex")}`;
    await database.insert(players).values({
      id: takenPlayerId,
      memberName: "선점 대상 회원",
      memberNameNormalized: "선점 대상 회원",
      nickname: takenNick,
      nicknameNormalized: takenNick.toLocaleLowerCase("ko-KR"),
      tagLine: "S01",
      tagLineNormalized: "s01",
    });
    const takenSignup = parsedSignup("taken_claim", `${takenNick}#S01`);
    const takenSubmitted = await repository.signup(
      takenSignup,
      await hashPassword(takenSignup.password),
      signupCommand(takenSignup),
    );
    assert.equal(takenSubmitted.type, "success");
    if (takenSubmitted.type !== "success" || !takenSubmitted.response.account) throw new Error();
    const takenAccountId = takenSubmitted.response.account.id;
    assert.equal((await repository.changeStatus(
      takenAccountId,
      "REJECTED",
      { ...rejectInput, confirmLoginId: takenSignup.loginId },
      0,
      statusCommand(admin, takenAccountId, "REJECTED", 0, { ...rejectInput, confirmLoginId: takenSignup.loginId }),
    )).type, "success");
    const competing = await seedLinkedAccount(
      database,
      "claim_competitor",
      "USER",
      await hashPassword("competing-password-2026"),
    );
    await database.delete(players).where(eq(players.id, competing.playerId));
    await database.update(players).set({ userAccountId: competing.id }).where(eq(players.id, takenPlayerId));
    assert.deepEqual(
      await repository.changeStatus(
        takenAccountId,
        "PENDING",
        { ...pendingInput, confirmLoginId: takenSignup.loginId },
        1,
        statusCommand(admin, takenAccountId, "PENDING", 1, { ...pendingInput, confirmLoginId: takenSignup.loginId }),
      ),
      { type: "conflict", reason: "PLAYER_CLAIM_TAKEN" },
    );
    const afterTakenConflict = (
      await database.select().from(userAccounts).where(eq(userAccounts.id, takenAccountId))
    )[0];
    assert.equal(afterTakenConflict?.status, "REJECTED");
    assert.equal(afterTakenConflict?.revision, 1);

    const nullable = await seedLinkedAccount(database, "nullable_password");
    await database.insert(passwordResetRequests).values({
      id: randomUUID(),
      userAccountId: nullable.id,
      loginIdHash: randomBytes(32),
      status: "PENDING",
      requestedAt: new Date(Date.now() - 120_000),
      expiresAt: new Date(Date.now() - 60_000),
    });
    assert.equal((await repository.findAdmin(nullable.id, "SUPER_ADMIN"))?.resetRequestPending, false);
    await database.delete(passwordResetRequests).where(eq(passwordResetRequests.userAccountId, nullable.id));

    const selfPasswordOriginal = "self-password-original-2026";
    const selfPasswordNext = "self-password-next-2026";
    const selfPasswordAccount = await seedLinkedAccount(
      database,
      "self_password_reset_cancel",
      "USER",
      await hashPassword(selfPasswordOriginal),
    );
    const selfPasswordSessionId = randomUUID();
    const selfPasswordSessionNow = new Date();
    await database.insert(authSessions).values({
      id: selfPasswordSessionId,
      tokenHash: randomBytes(32),
      userAccountId: selfPasswordAccount.id,
      authVersion: 0,
      role: "USER",
      purpose: "ACCOUNT",
      issuedAt: selfPasswordSessionNow,
      expiresAt: new Date(selfPasswordSessionNow.getTime() + 60 * 60_000),
    });
    const selfPasswordRequestId = randomUUID();
    const selfPasswordRequestedAt = new Date(Date.now() - 1_000);
    await database.insert(passwordResetRequests).values({
      id: selfPasswordRequestId,
      userAccountId: selfPasswordAccount.id,
      loginIdHash: randomBytes(32),
      status: "PENDING",
      requestedAt: selfPasswordRequestedAt,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    });
    const selfPasswordInput = {
      currentPassword: selfPasswordOriginal,
      newPassword: selfPasswordNext,
    };
    const selfPasswordActor = {
      id: selfPasswordAccount.id,
      role: "USER" as const,
      sessionId: selfPasswordSessionId,
      authVersion: 0,
    };
    const selfPasswordOutcome = await repository.changeOwnPassword(
      selfPasswordInput,
      await hashPassword(selfPasswordNext),
      0,
      command(
        selfPasswordActor,
        "account:password-change",
        fingerprintAccountMutation({
          action: "password-change",
          currentPassword: selfPasswordOriginal,
          newPassword: selfPasswordNext,
          revision: 0,
        }),
      ),
    );
    assert.equal(selfPasswordOutcome.type, "success");
    const selfCancelledRequest = (
      await database.select().from(passwordResetRequests).where(
        eq(passwordResetRequests.id, selfPasswordRequestId),
      )
    )[0];
    assert.equal(selfCancelledRequest?.status, "CANCELLED");
    assert.equal(selfCancelledRequest?.resolvedByUserAccountId, selfPasswordAccount.id);
    assert.ok(selfCancelledRequest?.resolvedAt);
    assert.ok(selfCancelledRequest!.resolvedAt!.getTime() >= selfPasswordRequestedAt.getTime());
    assert.equal(
      (await repository.findAdmin(selfPasswordAccount.id, "SUPER_ADMIN"))?.resetRequestPending,
      false,
    );
    assert.equal((await database.select({ value: count() }).from(auditEvents).where(and(
      eq(auditEvents.targetId, selfPasswordAccount.id),
      eq(auditEvents.action, "PASSWORD_RESET_REQUESTS_CANCELLED_ON_PASSWORD_CHANGE"),
    )))[0]?.value, 1);
    assert.ok((await database.select().from(authSessions).where(
      eq(authSessions.id, selfPasswordSessionId),
    ))[0]?.revokedAt);

    const queuedSelfOriginal = "queued-self-password-original-2026";
    const queuedSelfNext = "queued-self-password-next-2026";
    const queuedSelfAccount = await seedLinkedAccount(
      database,
      "queued_self_recovery",
      "USER",
      await hashPassword(queuedSelfOriginal),
    );
    const queuedSelfSessionId = randomUUID();
    const queuedSelfSessionNow = new Date();
    await database.insert(authSessions).values({
      id: queuedSelfSessionId,
      tokenHash: randomBytes(32),
      userAccountId: queuedSelfAccount.id,
      authVersion: 0,
      role: "USER",
      purpose: "ACCOUNT",
      issuedAt: queuedSelfSessionNow,
      expiresAt: new Date(queuedSelfSessionNow.getTime() + 60 * 60_000),
    });
    const queuedSelfBlocker = await pool.connect();
    try {
      await queuedSelfBlocker.query("begin");
      await queuedSelfBlocker.query(
        "select id from auth.user_accounts where id = $1 for update",
        [queuedSelfAccount.id],
      );
      const queuedSelfPasswordPromise = repository.changeOwnPassword(
        { currentPassword: queuedSelfOriginal, newPassword: queuedSelfNext },
        await hashPassword(queuedSelfNext),
        0,
        command(
          {
            id: queuedSelfAccount.id,
            role: "USER",
            sessionId: queuedSelfSessionId,
            authVersion: 0,
          },
          "account:password-change",
          fingerprintAccountMutation({
            action: "queued-self-password-change",
            currentPassword: queuedSelfOriginal,
            newPassword: queuedSelfNext,
            revision: 0,
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 120));
      const queuedRecoveryPromise = repository.requestPasswordReset(
        queuedSelfAccount.loginId,
        randomBytes(32),
        command(
          null,
          "account:reset-request",
          fingerprintAccountMutation({
            action: "queued-after-self-password-change",
            loginId: queuedSelfAccount.loginId,
          }),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 120));
      await queuedSelfBlocker.query("commit");
      assert.equal((await queuedSelfPasswordPromise).type, "success");
      assert.equal((await queuedRecoveryPromise).type, "success");
    } finally {
      await queuedSelfBlocker.query("rollback").catch(() => undefined);
      queuedSelfBlocker.release();
    }
    assert.equal((await database.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.userAccountId, queuedSelfAccount.id),
      eq(passwordResetRequests.status, "PENDING"),
    ))).length, 0, "recovery admitted before a queued self password change must be suppressed");
    assert.equal((await repository.requestPasswordReset(
      queuedSelfAccount.loginId,
      randomBytes(32),
      command(
        null,
        "account:reset-request",
        fingerprintAccountMutation({
          action: "recovery-after-self-password-change-complete",
          loginId: queuedSelfAccount.loginId,
        }),
      ),
    )).type, "success");
    assert.equal((await database.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.userAccountId, queuedSelfAccount.id),
      eq(passwordResetRequests.status, "PENDING"),
    ))).length, 1, "recovery admitted after the password change must remain available");

    const queuedRecovery = await seedLinkedAccount(database, "queued_recovery_clock");
    const queuedRecoveryRequestId = randomUUID();
    await database.insert(passwordResetRequests).values({
      id: queuedRecoveryRequestId,
      userAccountId: queuedRecovery.id,
      loginIdHash: randomBytes(32),
      status: "PENDING",
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 120),
    });
    const recoveryBlocker = await pool.connect();
    try {
      await recoveryBlocker.query("begin");
      await recoveryBlocker.query(
        "select id from auth.user_accounts where id = $1 for update",
        [queuedRecovery.id],
      );
      const queuedCommand = command(
        null,
        "account:reset-request",
        fingerprintAccountMutation({
          action: "queued-recovery-clock",
          loginId: queuedRecovery.loginId,
        }),
        { now: new Date() },
      );
      const queuedOutcomePromise = repository.requestPasswordReset(
        queuedRecovery.loginId,
        randomBytes(32),
        queuedCommand,
      );
      await new Promise((resolve) => setTimeout(resolve, 240));
      await recoveryBlocker.query("commit");
      const queuedOutcome = await queuedOutcomePromise;
      assert.equal(queuedOutcome.type, "success");
      if (queuedOutcome.type === "success") assert.equal(queuedOutcome.replayed, false);
    } finally {
      await recoveryBlocker.query("rollback").catch(() => undefined);
      recoveryBlocker.release();
    }
    assert.equal((await database.select().from(passwordResetRequests).where(
      eq(passwordResetRequests.id, queuedRecoveryRequestId),
    ))[0]?.status, "EXPIRED");
    const queuedActiveRequests = await database.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.userAccountId, queuedRecovery.id),
      eq(passwordResetRequests.status, "PENDING"),
    ));
    assert.equal(queuedActiveRequests.length, 1, "expiry during an account lock wait must create a fresh intent");
    assert.ok(queuedActiveRequests[0]!.requestedAt.getTime() > Date.now() - 2_000);

    const queuedReceiptAccount = await seedLinkedAccount(database, "queued_receipt_clock");
    const queuedReceiptCommand = command(
      null,
      "account:reset-request",
      fingerprintAccountMutation({
        action: "queued-receipt-clock",
        loginId: queuedReceiptAccount.loginId,
      }),
      { now: new Date() },
    );
    const receiptPrincipalHash = createHash("sha256")
      .update(queuedReceiptCommand.principalKeyMaterial)
      .digest();
    const receiptKeyHash = createHash("sha256")
      .update(queuedReceiptCommand.idempotencyKeyMaterial)
      .digest();
    const receiptRequestHash = createHash("sha256")
      .update(queuedReceiptCommand.requestFingerprint)
      .digest();
    await database.insert(accountMutationReceipts).values({
      actorUserAccountId: null,
      principalKeyHash: receiptPrincipalHash,
      scope: "account:reset-request",
      keyHash: receiptKeyHash,
      requestHash: receiptRequestHash,
      responseStatus: 202,
      responseJson: { message: "stale request-time replay must not be returned" },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 120),
    });
    const advisoryMaterial = createHash("sha256")
      .update(Buffer.concat([receiptPrincipalHash, receiptKeyHash]))
      .digest("hex");
    const receiptBlocker = await pool.connect();
    try {
      await receiptBlocker.query(
        "select pg_advisory_lock(hashtextextended($1, 0))",
        [advisoryMaterial],
      );
      const queuedReceiptOutcomePromise = repository.requestPasswordReset(
        queuedReceiptAccount.loginId,
        randomBytes(32),
        queuedReceiptCommand,
      );
      await new Promise((resolve) => setTimeout(resolve, 240));
      await receiptBlocker.query(
        "select pg_advisory_unlock(hashtextextended($1, 0))",
        [advisoryMaterial],
      );
      const queuedReceiptOutcome = await queuedReceiptOutcomePromise;
      assert.equal(queuedReceiptOutcome.type, "success");
      if (queuedReceiptOutcome.type === "success") assert.equal(
        queuedReceiptOutcome.replayed,
        false,
        "receipt expiry must be checked after advisory-lock wait with the DB wall clock",
      );
    } finally {
      await receiptBlocker.query(
        "select pg_advisory_unlock(hashtextextended($1, 0))",
        [advisoryMaterial],
      ).catch(() => undefined);
      receiptBlocker.release();
    }
    assert.equal((await database.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.userAccountId, queuedReceiptAccount.id),
      eq(passwordResetRequests.status, "PENDING"),
    ))).length, 1);

    const credentialReceiptAccount = await seedLinkedAccount(
      database,
      "credential_receipt_wait",
      "USER",
      await hashPassword("credential-receipt-original-2026"),
    );
    const credentialReceiptCommand = command(
      null,
      "account:reset-request",
      fingerprintAccountMutation({
        action: "credential-change-during-receipt-wait",
        loginId: credentialReceiptAccount.loginId,
      }),
    );
    const credentialReceiptPrincipalHash = createHash("sha256")
      .update(credentialReceiptCommand.principalKeyMaterial)
      .digest();
    const credentialReceiptKeyHash = createHash("sha256")
      .update(credentialReceiptCommand.idempotencyKeyMaterial)
      .digest();
    const credentialReceiptAdvisoryMaterial = createHash("sha256")
      .update(Buffer.concat([credentialReceiptPrincipalHash, credentialReceiptKeyHash]))
      .digest("hex");
    const credentialReceiptBlocker = await pool.connect();
    try {
      await credentialReceiptBlocker.query(
        "select pg_advisory_lock(hashtextextended($1, 0))",
        [credentialReceiptAdvisoryMaterial],
      );
      const queuedCredentialReceiptPromise = repository.requestPasswordReset(
        credentialReceiptAccount.loginId,
        randomBytes(32),
        credentialReceiptCommand,
      );
      await new Promise((resolve) => setTimeout(resolve, 160));
      await database.update(userAccounts).set({
        passwordHash: await hashPassword("credential-receipt-changed-2026"),
        passwordChangedAt: sql`clock_timestamp()`,
        authVersion: sql`${userAccounts.authVersion} + 1`,
        revision: sql`${userAccounts.revision} + 1`,
        updatedAt: sql`clock_timestamp()`,
      }).where(eq(userAccounts.id, credentialReceiptAccount.id));
      await credentialReceiptBlocker.query(
        "select pg_advisory_unlock(hashtextextended($1, 0))",
        [credentialReceiptAdvisoryMaterial],
      );
      assert.equal((await queuedCredentialReceiptPromise).type, "success");
    } finally {
      await credentialReceiptBlocker.query(
        "select pg_advisory_unlock(hashtextextended($1, 0))",
        [credentialReceiptAdvisoryMaterial],
      ).catch(() => undefined);
      credentialReceiptBlocker.release();
    }
    assert.equal((await database.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.userAccountId, credentialReceiptAccount.id),
      eq(passwordResetRequests.status, "PENDING"),
    ))).length, 0, "receipt-lock wait must not reclassify an older recovery as post-password-change");
    assert.equal((await repository.requestPasswordReset(
      credentialReceiptAccount.loginId,
      randomBytes(32),
      command(
        null,
        "account:reset-request",
        fingerprintAccountMutation({
          action: "credential-change-complete-fresh-recovery",
          loginId: credentialReceiptAccount.loginId,
        }),
      ),
    )).type, "success");
    assert.equal((await database.select().from(passwordResetRequests).where(and(
      eq(passwordResetRequests.userAccountId, credentialReceiptAccount.id),
      eq(passwordResetRequests.status, "PENDING"),
    ))).length, 1);

    for (const invalid of [
      { status: "PENDING" as const, resolvedAt: null, resolvedByUserAccountId: superAdmin.id },
      { status: "RESOLVED" as const, resolvedAt: new Date(), resolvedByUserAccountId: null },
      { status: "EXPIRED" as const, resolvedAt: new Date(), resolvedByUserAccountId: superAdmin.id },
    ]) {
      await assert.rejects(
        database.insert(passwordResetRequests).values({
          id: randomUUID(),
          userAccountId: nullable.id,
          loginIdHash: randomBytes(32),
          requestedAt: new Date(Date.now() - 1_000),
          expiresAt: new Date(Date.now() + 60_000),
          ...invalid,
        }),
        postgresConstraint("password_reset_requests_resolution_consistency"),
      );
    }
    const invalidResolvedRequestedAt = new Date();
    await assert.rejects(
      database.insert(passwordResetRequests).values({
        id: randomUUID(),
        userAccountId: nullable.id,
        loginIdHash: randomBytes(32),
        status: "CANCELLED",
        requestedAt: invalidResolvedRequestedAt,
        expiresAt: new Date(invalidResolvedRequestedAt.getTime() + 60_000),
        resolvedAt: new Date(invalidResolvedRequestedAt.getTime() - 1),
        resolvedByUserAccountId: superAdmin.id,
      }),
      postgresConstraint("password_reset_requests_resolution_after_request"),
    );
    assert.deepEqual(
      await repository.authenticateUser({ loginId: nullable.loginId, password: "anything" }, new Date()),
      { type: "invalid-credentials" },
    );
    const temporaryPassword = `Temp-${randomBytes(18).toString("base64url")}9A`;
    const resetScope = accountMutationScope("password-reset", nullable.id);
    const resetKey = key("nullable-reset");
    const resetCommand = command(
      superAdmin,
      resetScope,
      fingerprintAccountMutation({ action: "password-reset", target: nullable.id, revision: 0 }),
      { idempotencyKey: resetKey },
    );
    const passwordReset = await repository.resetPassword(
      nullable.id,
      await hashPassword(temporaryPassword),
      temporaryPassword,
      "V1 nullable password 계정 복구",
      nullable.loginId,
      0,
      resetCommand,
    );
    assert.equal(passwordReset.type, "success");
    if (passwordReset.type !== "success") throw new Error();
    assert.equal(passwordReset.oneTimeSecret, temporaryPassword);
    const resetAccount = (
      await database.select().from(userAccounts).where(eq(userAccounts.id, nullable.id))
    )[0];
    assert.equal(resetAccount?.mustChangePassword, true);
    assert.equal(identifyPasswordHash(resetAccount?.passwordHash ?? null), "SCRYPT");
    assert.deepEqual(
      await repository.resetPassword(
        nullable.id,
        await hashPassword(temporaryPassword),
        temporaryPassword,
        "V1 nullable password 계정 복구",
        nullable.loginId,
        0,
        resetCommand,
      ),
      { type: "conflict", reason: "ONE_TIME_SECRET_ALREADY_ISSUED" },
    );
    const leakedSecret = await pool.query(
      `select 1
         from audit.events
        where position($1 in coalesce(before_json::text, '')) > 0
           or position($1 in coalesce(after_json::text, '')) > 0
           or position($1 in coalesce(metadata_json::text, '')) > 0
        union all
       select 1
         from auth.account_mutation_receipts
        where position($1 in response_json::text) > 0`,
      [temporaryPassword],
    );
    assert.equal(leakedSecret.rowCount, 0);

    const totpResetTarget = await seedLinkedAccount(
      database,
      "totp_reset_admin",
      "ADMIN",
      await hashPassword("totp-reset-target-password-2026"),
    );
    const totpResetSessionId = randomUUID();
    await database.insert(authSessions).values({
      id: totpResetSessionId,
      tokenHash: randomBytes(32),
      userAccountId: totpResetTarget.id,
      authVersion: 0,
      role: "ADMIN",
      purpose: "ADMIN",
      totpVerifiedAt: new Date(),
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    await database.insert(adminTotpCredentials).values({
      userAccountId: totpResetTarget.id,
      secretCiphertext: randomBytes(32),
      secretIv: randomBytes(12),
      secretAuthTag: randomBytes(16),
      keyVersion: 1,
      enabledAt: new Date(),
    });
    const resetTotpScope = accountMutationScope("2fa-reset", totpResetTarget.id);
    const resetTotp = await repository.resetAdminTotp(
      totpResetTarget.id,
      "관리자 기기 분실 신고",
      totpResetTarget.loginId,
      0,
      command(
        superAdmin,
        resetTotpScope,
        fingerprintAccountMutation({
          action: "2fa-reset",
          target: totpResetTarget.id,
          revision: 0,
          confirmLoginId: totpResetTarget.loginId,
        }),
      ),
    );
    assert.equal(resetTotp.type, "success");
    assert.equal((await database.select({ value: count() }).from(adminTotpCredentials).where(
      eq(adminTotpCredentials.userAccountId, totpResetTarget.id),
    ))[0]?.value, 0);
    assert.ok((await database.select().from(authSessions).where(
      eq(authSessions.id, totpResetSessionId),
    ))[0]?.revokedAt);
    assert.equal((await database.select().from(userAccounts).where(
      eq(userAccounts.id, totpResetTarget.id),
    ))[0]?.revision, 1);

    const totpProjectionTarget = await seedLinkedAccount(
      database,
      "totp_projection_revision",
      "ADMIN",
      await hashPassword("totp-projection-target-password-2026"),
    );
    const totpProjectionSessionId = randomUUID();
    const totpProjectionNow = new Date();
    await database.insert(authSessions).values({
      id: totpProjectionSessionId,
      tokenHash: randomBytes(32),
      userAccountId: totpProjectionTarget.id,
      authVersion: 0,
      role: "ADMIN",
      purpose: "ADMIN",
      totpVerifiedAt: null,
      issuedAt: totpProjectionNow,
      expiresAt: new Date(totpProjectionNow.getTime() + 30 * 60_000),
    });
    const totpProjectionRepository = new PostgresAuthRepository(database);
    const totpProjectionKeyring = parseTotpEncryptionKeyring(JSON.stringify({
      current: 1,
      keys: { 1: randomBytes(32).toString("base64url") },
    }));
    assert.deepEqual(await totpProjectionRepository.beginOwnTotpSetup({
      actor: {
        userAccountId: totpProjectionTarget.id,
        sessionId: totpProjectionSessionId,
        role: "ADMIN",
        authVersion: 0,
      },
      envelope: encryptTotpSecret(
        totpProjectionTarget.id,
        generateTotpSecret(),
        totpProjectionKeyring,
      ),
      now: totpProjectionNow,
      requestId: randomUUID(),
    }), { ok: true });
    const pendingProjectionCredential = await totpProjectionRepository.getTotpCredential(
      totpProjectionTarget.id,
    );
    assert.ok(pendingProjectionCredential);
    const enabledProjection = await totpProjectionRepository.enableOwnTotp({
      actor: {
        userAccountId: totpProjectionTarget.id,
        sessionId: totpProjectionSessionId,
        role: "ADMIN",
        authVersion: 0,
      },
      candidateStep: 400_000,
      expectedCredentialFingerprint: fingerprintTotpCredential(pendingProjectionCredential),
      now: new Date(totpProjectionNow.getTime() + 1),
      requestId: randomUUID(),
    });
    assert.equal(enabledProjection.ok, true);
    assert.equal((await database.select().from(userAccounts).where(
      eq(userAccounts.id, totpProjectionTarget.id),
    ))[0]?.revision, 2);
    const staleProjectionResetScope = accountMutationScope("2fa-reset", totpProjectionTarget.id);
    const staleProjectionReset = await repository.resetAdminTotp(
      totpProjectionTarget.id,
      "설정 중 변경된 2FA projection stale revision 검증",
      totpProjectionTarget.loginId,
      0,
      command(
        superAdmin,
        staleProjectionResetScope,
        fingerprintAccountMutation({
          action: "2fa-reset",
          target: totpProjectionTarget.id,
          revision: 0,
          confirmLoginId: totpProjectionTarget.loginId,
        }),
      ),
    );
    assert.deepEqual(staleProjectionReset, { type: "precondition-failed", currentRevision: 2 });
    assert.ok(await totpProjectionRepository.getTotpCredential(totpProjectionTarget.id));
    assert.equal((await database.select({ value: count() }).from(auditEvents).where(and(
      eq(auditEvents.targetId, totpProjectionTarget.id),
      eq(auditEvents.action, "ADMIN_TOTP_RESET_BY_SUPER"),
    )))[0]?.value, 0);

    const totpRaceTarget = await seedLinkedAccount(
      database,
      "totp_reset_disable_race",
      "ADMIN",
      await hashPassword("totp-race-target-password-2026"),
    );
    const totpRaceSessionId = randomUUID();
    const totpRaceNow = new Date();
    await database.insert(authSessions).values({
      id: totpRaceSessionId,
      tokenHash: randomBytes(32),
      userAccountId: totpRaceTarget.id,
      authVersion: 0,
      role: "ADMIN",
      purpose: "ADMIN",
      totpVerifiedAt: totpRaceNow,
      issuedAt: totpRaceNow,
      expiresAt: new Date(totpRaceNow.getTime() + 30 * 60_000),
    });
    await database.insert(adminTotpCredentials).values({
      userAccountId: totpRaceTarget.id,
      secretCiphertext: randomBytes(32),
      secretIv: randomBytes(12),
      secretAuthTag: randomBytes(16),
      keyVersion: 1,
      enabledAt: totpRaceNow,
    });
    const authRepository = new PostgresAuthRepository(database);
    const totpRaceCredential = await authRepository.getTotpCredential(totpRaceTarget.id);
    assert.ok(totpRaceCredential);
    const [superResetRace, selfDisableRace] = await Promise.all([
      repository.resetAdminTotp(
        totpRaceTarget.id,
        "SUPER reset과 self-disable 직렬화 검증",
        totpRaceTarget.loginId,
        0,
        command(
          superAdmin,
          accountMutationScope("2fa-reset", totpRaceTarget.id),
          fingerprintAccountMutation({
            action: "2fa-reset-race",
            target: totpRaceTarget.id,
            revision: 0,
          }),
        ),
      ),
      authRepository.disableOwnTotp({
        actor: {
          userAccountId: totpRaceTarget.id,
          sessionId: totpRaceSessionId,
          role: "ADMIN",
          authVersion: 0,
        },
        candidateStep: 500_000,
        expectedCredentialFingerprint: fingerprintTotpCredential(totpRaceCredential!),
        now: new Date(),
        requestId: randomUUID(),
      }),
    ]);
    assert.ok(
      superResetRace.type === "success" ||
      (superResetRace.type === "precondition-failed" && superResetRace.currentRevision === 1),
    );
    assert.ok(selfDisableRace.ok || selfDisableRace.reason === "SESSION_STALE");
    assert.equal((await database.select({ value: count() }).from(adminTotpCredentials).where(
      eq(adminTotpCredentials.userAccountId, totpRaceTarget.id),
    ))[0]?.value, 0);
    assert.ok((await database.select().from(authSessions).where(
      eq(authSessions.id, totpRaceSessionId),
    ))[0]?.revokedAt);
    const totpRaceAccount = (await database.select().from(userAccounts).where(
      eq(userAccounts.id, totpRaceTarget.id),
    ))[0];
    assert.ok((totpRaceAccount?.authVersion ?? 0) >= 1);
    assert.equal(totpRaceAccount?.revision, 1);
    assert.equal(
      (await database.select({ value: count() }).from(auditEvents).where(
        and(
          eq(auditEvents.targetId, totpRaceTarget.id),
          eq(auditEvents.action, "ADMIN_TOTP_RESET_BY_SUPER"),
        ),
      ))[0]?.value,
      superResetRace.type === "success" ? 1 : 0,
    );

    const peerSuper = await seedAdministrator(database, "SUPER_ADMIN", "account_peer_super");
    const oppositeSuperMutations = await Promise.race([
      Promise.all([
        repository.changeRole(
          superAdmin.id,
          "USER",
          "반대 방향 정렬 잠금 검증 A",
          superAdmin.loginId,
          0,
          command(
            peerSuper,
            accountMutationScope("role", superAdmin.id),
            fingerprintAccountMutation({ action: "role", target: superAdmin.id, direction: "A" }),
          ),
        ),
        repository.changeRole(
          peerSuper.id,
          "USER",
          "반대 방향 정렬 잠금 검증 B",
          peerSuper.loginId,
          0,
          command(
            superAdmin,
            accountMutationScope("role", peerSuper.id),
            fingerprintAccountMutation({ action: "role", target: peerSuper.id, direction: "B" }),
          ),
        ),
      ]),
      new Promise<never>((_, reject) => setTimeout(
        () => reject(new Error("Opposite-direction account locks did not settle.")),
        4_000,
      )),
    ]);
    assert.deepEqual(oppositeSuperMutations.map((outcome) => outcome.type), ["forbidden", "forbidden"]);

    const adminTarget = await seedLinkedAccount(
      database,
      "delete_admin",
      "ADMIN",
      await hashPassword("admin-target-password-2026"),
    );
    await database.insert(adminTotpCredentials).values({
      userAccountId: adminTarget.id,
      secretCiphertext: randomBytes(32),
      secretIv: randomBytes(12),
      secretAuthTag: randomBytes(16),
      keyVersion: 1,
      enabledAt: new Date(),
    });
    const adminDeleteScope = accountMutationScope("delete", adminTarget.id);
    assert.equal((await repository.softDelete(
      adminTarget.id,
      "관리자 계정 폐기 보안 초기화",
      adminTarget.loginId,
      0,
      command(
        superAdmin,
        adminDeleteScope,
        fingerprintAccountMutation({ action: "delete", target: adminTarget.id, revision: 0 }),
      ),
    )).type, "success");
    const deletedAdmin = (
      await database.select().from(userAccounts).where(eq(userAccounts.id, adminTarget.id))
    )[0];
    assert.equal(deletedAdmin?.mustChangePassword, true);
    assert.equal((await database.select({ value: count() }).from(adminTotpCredentials).where(
      eq(adminTotpCredentials.userAccountId, adminTarget.id),
    ))[0]?.value, 0);

    const bcryptPassword = "legacy-bcrypt-password-2026";
    const bcryptAccount = await seedLinkedAccount(
      database,
      "bcrypt_login",
      "USER",
      await bcrypt.hash(bcryptPassword, 4),
    );
    const bcryptLogin = await repository.authenticateUser(
      { loginId: bcryptAccount.loginId, password: bcryptPassword },
      new Date(),
    );
    assert.equal(bcryptLogin.type, "authenticated");
    const migratedBcrypt = (
      await database.select().from(userAccounts).where(eq(userAccounts.id, bcryptAccount.id))
    )[0];
    assert.equal(identifyPasswordHash(migratedBcrypt?.passwordHash ?? null), "SCRYPT");
    assert.equal((await database.select({ value: count() }).from(auditEvents).where(
      and(
        eq(auditEvents.targetId, bcryptAccount.id),
        eq(auditEvents.action, "ACCOUNT_PASSWORD_HASH_UPGRADED"),
      ),
    ))[0]?.value, 1);

    const oldPassword = "reset-race-old-password-2026";
    const newPassword = "reset-race-new-password-2026";
    const raceAccount = await seedLinkedAccount(
      database,
      "login_reset_race",
      "USER",
      await hashPassword(oldPassword),
    );
    const blocker = await pool.connect();
    try {
      await blocker.query("begin");
      await blocker.query("select id from auth.user_accounts where id = $1 for update", [raceAccount.id]);
      const authentication = repository.authenticateUser(
        { loginId: raceAccount.loginId, password: oldPassword },
        new Date(),
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      await blocker.query(
        `update auth.user_accounts
            set password_hash = $2,
                auth_version = auth_version + 1,
                revision = revision + 1
          where id = $1`,
        [raceAccount.id, await hashPassword(newPassword)],
      );
      await blocker.query("commit");
      assert.deepEqual(await authentication, { type: "invalid-credentials" });
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      blocker.release();
    }

    const rollbackAccount = await seedLinkedAccount(
      database,
      "audit_rollback",
      "USER",
      await hashPassword("audit-rollback-password-2026"),
    );
    const rollbackInput = {
      publicReason: "거절 rollback",
      internalReason: "감사 실패 시 전체 rollback",
      confirmLoginId: rollbackAccount.loginId,
    };
    await assert.rejects(repository.changeStatus(
      rollbackAccount.id,
      "REJECTED",
      rollbackInput,
      0,
      statusCommand(admin, rollbackAccount.id, "REJECTED", 0, rollbackInput, {
        requestId: "not-a-uuid",
      }),
    ));
    const rollbackState = (
      await database.select().from(userAccounts).where(eq(userAccounts.id, rollbackAccount.id))
    )[0];
    const rollbackPlayer = (
      await database.select().from(players).where(eq(players.id, rollbackAccount.playerId))
    )[0];
    assert.equal(rollbackState?.status, "APPROVED");
    assert.equal(rollbackState?.revision, 0);
    assert.equal(rollbackPlayer?.status, "ACTIVE");

    const riotSearch = await repository.listAdmin({
      query: `${claimNick}#CLAIM`,
      status: "ALL",
      role: "ALL",
      deleted: "ALL",
      page: 1,
      pageSize: 20,
    }, "SUPER_ADMIN");
    assert.equal(riotSearch.items.some((account) => account.id === claimAccountId), true);
    const tagSearch = await repository.listAdmin({
      query: "claim",
      status: "ALL",
      role: "ALL",
      deleted: "ALL",
      page: 1,
      pageSize: 20,
    }, "SUPER_ADMIN");
    assert.equal(tagSearch.items.some((account) => account.id === claimAccountId), true);

    const batchAccounts = Array.from({ length: 50 }, (_, index) => {
      const suffix = `${index}_${randomBytes(3).toString("hex")}`;
      return {
        id: randomUUID(),
        loginId: `batch_account_${suffix}`,
        loginIdNormalized: `batch_account_${suffix}`,
        role: "USER" as const,
        status: "APPROVED" as const,
      };
    });
    await database.insert(userAccounts).values(batchAccounts);
    await database.insert(players).values(batchAccounts.map((account, index) => ({
      id: randomUUID(),
      userAccountId: account.id,
      memberName: `일괄 회원 ${index}`,
      memberNameNormalized: `일괄 회원 ${index}`,
      nickname: `Batch${index}${randomBytes(3).toString("hex")}`,
      nicknameNormalized: `batch${index}${randomBytes(3).toString("hex")}`,
      tagLine: "S01",
      tagLineNormalized: "s01",
    })));
    const mutablePool = pool as unknown as { query: (...args: unknown[]) => unknown };
    const originalPoolQuery = mutablePool.query;
    let listQueryCount = 0;
    mutablePool.query = (...args: unknown[]) => {
      listQueryCount += 1;
      return originalPoolQuery.apply(pool, args);
    };
    try {
      const batchPage = await repository.listAdmin({
        query: "",
        status: "ALL",
        role: "ALL",
        deleted: "ALL",
        page: 1,
        pageSize: 50,
      }, "SUPER_ADMIN");
      assert.equal(batchPage.items.length, 50);
      assert.equal(listQueryCount, 5, "50-row admin list must use five constant batch queries");
    } finally {
      mutablePool.query = originalPoolQuery;
    }

    const claimPlanAccountId = randomUUID();
    const claimPlanLogin = `claim_plan_${randomBytes(4).toString("hex")}`;
    await database.insert(userAccounts).values({
      id: claimPlanAccountId,
      loginId: claimPlanLogin,
      loginIdNormalized: claimPlanLogin,
      role: "USER",
      status: "REJECTED",
    });
    await pool.query(
      `insert into registry.players
        (id, member_name, member_name_normalized, nickname, nickname_normalized,
         tag_line, tag_line_normalized, status, deactivated_at)
       select md5('s01-claim-plan-player-' || item)::uuid,
              'claim plan member ' || item,
              'claim plan member ' || item,
              'ClaimPlan' || item,
              'claimplan' || item,
              'S01',
              's01',
              'INACTIVE',
              clock_timestamp()
         from generate_series(1, 2500) as item`,
    );
    await pool.query(
      `insert into registry.player_account_claims
        (id, user_account_id, player_id, requested_member_name, requested_riot_id,
         status, reviewed_by_user_account_id, reviewed_at, created_at, updated_at)
       select md5('s01-claim-plan-claim-' || item)::uuid,
              $1,
              md5('s01-claim-plan-player-' || item)::uuid,
              'claim plan member ' || item,
              'ClaimPlan' || item || '#S01',
              'REJECTED',
              $2,
              clock_timestamp() - (item || ' seconds')::interval,
              clock_timestamp() - (item || ' seconds')::interval,
              clock_timestamp() - (item || ' seconds')::interval
         from generate_series(1, 2500) as item`,
      [claimPlanAccountId, admin.id],
    );
    await pool.query("analyze registry.player_account_claims");
    const claimPlanClient = await pool.connect();
    try {
      await claimPlanClient.query("begin");
      await claimPlanClient.query("set local enable_seqscan = off");
      const explained = await claimPlanClient.query(
        `explain (analyze, buffers, format json)
         select id, player_id, status, updated_at
           from registry.player_account_claims
          where user_account_id = $1
          order by updated_at desc, id
          limit 1`,
        [claimPlanAccountId],
      );
      const planJson = explained.rows[0]?.["QUERY PLAN"];
      assert.match(
        JSON.stringify(planJson),
        /player_account_claims_account_updated_idx/,
        "latest claim projection must use the full account-history index at scale",
      );
      await claimPlanClient.query("rollback");
    } finally {
      await claimPlanClient.query("rollback").catch(() => undefined);
      claimPlanClient.release();
    }
    const claimIndex = await pool.query<{ indexdef: string }>(
      `select indexdef
         from pg_indexes
        where schemaname = 'registry'
          and tablename = 'player_account_claims'
          and indexname = 'player_account_claims_account_updated_idx'`,
    );
    assert.equal(claimIndex.rowCount, 1);
    assert.match(
      claimIndex.rows[0]!.indexdef,
      /\(user_account_id, updated_at DESC NULLS LAST, id\)/,
    );

    const rawSecretSearch = await database.execute(
      sql`select 1 from auth.account_mutation_receipts where position(${temporaryPassword} in response_json::text) > 0`,
    );
    assert.equal(rawSecretSearch.rows.length, 0);
    assert.ok((await database.select({ value: count() }).from(accountMutationReceipts))[0]!.value > 0);
  } finally {
    await pool.end();
  }
});
