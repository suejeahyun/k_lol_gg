export type DisciplineStatisticsRecord = {
  userAccountId: number | null;
  playerId: number | null;
  targetName: string;
  targetNickname: string | null;
  targetTag: string | null;
  type: string;
  player?: { name: string; nickname: string; tag: string } | null;
};

export type DisciplinePersonStatistic = {
  key: string;
  name: string;
  nickname: string;
  rawCautions: number;
  cautionCount: number;
  directWarnings: number;
  convertedWarnings: number;
  warningCount: number;
  isBanned: boolean;
};

function normalizeIdentityPart(value: string | null | undefined) {
  return String(value || "").trim().toLocaleLowerCase("ko-KR");
}

function identityKey(record: DisciplineStatisticsRecord) {
  if (record.playerId) return `player:${record.playerId}`;
  if (record.userAccountId) return `user:${record.userAccountId}`;
  return `direct:${normalizeIdentityPart(record.targetName)}|${normalizeIdentityPart(record.targetNickname)}|${normalizeIdentityPart(record.targetTag)}`;
}

export function buildDisciplineStatistics(records: DisciplineStatisticsRecord[]) {
  const grouped = new Map<string, DisciplinePersonStatistic>();

  for (const record of records) {
    const key = identityKey(record);
    const playerName = record.player?.name?.trim();
    const playerNickname = record.player?.nickname?.trim();
    const playerTag = record.player?.tag?.trim();
    const nickname = playerNickname || record.targetNickname?.trim() || "-";
    const tag = playerTag || record.targetTag?.trim();
    const displayNickname = nickname === "-" ? nickname : `${nickname}${tag ? `#${tag}` : ""}`;
    const current = grouped.get(key) || {
      key,
      name: playerName || record.targetName.trim() || "이름 미상",
      nickname: displayNickname,
      rawCautions: 0,
      cautionCount: 0,
      directWarnings: 0,
      convertedWarnings: 0,
      warningCount: 0,
      isBanned: false,
    };

    if (record.type === "CAUTION") current.rawCautions += 1;
    if (record.type === "WARNING") current.directWarnings += 1;
    if (record.type === "BAN") current.isBanned = true;
    if (playerName) current.name = playerName;
    if (playerNickname) current.nickname = displayNickname;
    grouped.set(key, current);
  }

  return Array.from(grouped.values())
    .map((person) => {
      const convertedWarnings = Math.floor(person.rawCautions / 3);
      return {
        ...person,
        cautionCount: person.rawCautions % 3,
        convertedWarnings,
        warningCount: person.directWarnings + convertedWarnings,
      };
    })
    .sort((a, b) => {
      if (a.isBanned !== b.isBanned) return a.isBanned ? -1 : 1;
      if (a.warningCount !== b.warningCount) return b.warningCount - a.warningCount;
      if (a.cautionCount !== b.cautionCount) return b.cautionCount - a.cautionCount;
      return a.name.localeCompare(b.name, "ko-KR");
    });
}
