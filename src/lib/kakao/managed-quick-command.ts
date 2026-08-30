export type ManagedQuickCommand =
  | {
      kind: "DISCIPLINE";
      nickname: string;
      tag: string;
      category: "GENERAL" | "INHOUSE";
      evidenceCount: number;
    }
  | {
      kind: "INHOUSE_RESULT";
      gameCount: 2 | 3;
      seriesNumber: number;
      teamBalanceDraftId: number | null;
      note: string;
    };

export type ManagedQuickCommandResult =
  | { matched: false }
  | { matched: true; ok: true; command: ManagedQuickCommand }
  | { matched: true; ok: false; kind: ManagedQuickCommand["kind"]; message: string };

function normalize(value: string) {
  return value
    .replace(/[\u00a0\u3000]/g, " ")
    .replace(/＃/g, "#")
    .replace(/：/g, ":")
    .replace(/\s+/g, " ")
    .trim();
}

function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : null;
}

function parseNicknameTag(value: string) {
  const splitAt = value.lastIndexOf("#");
  if (splitAt <= 0 || splitAt >= value.length - 1) return null;
  const nickname = value.slice(0, splitAt).trim();
  const tag = value.slice(splitAt + 1).trim();
  return nickname && tag ? { nickname, tag } : null;
}

export function parseManagedQuickCommand(rawMessage: string): ManagedQuickCommandResult {
  const message = normalize(rawMessage);

  const discipline = message.match(/^\/?(?:경고|경고등록)\s+(.+)$/);
  if (discipline) {
    const fields = discipline[1].match(/^(.+?)\s+(일반|내전)(?:\s+(사진:?([0-3])(?:장)?))?$/);
    const nicknameTag = parseNicknameTag(fields?.[1] ?? "");
    const category = fields?.[2] === "일반" ? "GENERAL" : fields?.[2] === "내전" ? "INHOUSE" : null;
    const evidenceCount = fields?.[4] ? Number(fields[4]) : 0;

    if (!fields || !nicknameTag || !category) {
      return {
        matched: true,
        ok: false,
        kind: "DISCIPLINE",
        message: "사용법: /경고 닉네임#태그 일반|내전 [사진0~3]",
      };
    }

    return {
      matched: true,
      ok: true,
      command: {
        kind: "DISCIPLINE",
        nickname: nicknameTag.nickname,
        tag: nicknameTag.tag,
        category,
        evidenceCount,
      },
    };
  }

  const inhouse = message.match(/^\/?(?:내전등록|결과등록|내전결과)\s+(.+)$/);
  if (inhouse) {
    const noteMatch = inhouse[1].match(/(?:^|\s)메모:(.*)$/);
    const note = noteMatch?.[1]?.trim() || "없음";
    const tokenText = noteMatch ? inhouse[1].slice(0, noteMatch.index).trim() : inhouse[1];
    const tokens = tokenText.split(" ").filter(Boolean);
    const gameTokens = tokens.filter((token) => /^[23](?:세트)?$/.test(token));
    const seriesTokens = tokens.filter((token) => /^\d+(?:회|회차)$/.test(token));
    const balanceTokens = tokens.filter((token) => /^(?:밸런스)?#\d+$/.test(token));
    const gameMatch = gameTokens[0]?.match(/^([23])/);
    const seriesMatch = seriesTokens[0]?.match(/^(\d+)/);
    const balanceToken = balanceTokens[0];
    const balanceMatch = balanceToken?.match(/#(\d+)$/);
    const knownTokens = tokens.filter((token) =>
      /^[23](?:세트)?$/.test(token)
      || /^\d+(?:회|회차)$/.test(token)
      || /^(?:밸런스)?#\d+$/.test(token),
    );
    const seriesNumber = positiveInteger(seriesMatch?.[1]);
    const teamBalanceDraftId = balanceMatch ? positiveInteger(balanceMatch[1]) : null;

    if (
      !gameMatch
      || !seriesNumber
      || gameTokens.length !== 1
      || seriesTokens.length !== 1
      || balanceTokens.length > 1
      || knownTokens.length !== tokens.length
      || (balanceMatch && !teamBalanceDraftId)
      || note.length > 1_000
    ) {
      return {
        matched: true,
        ok: false,
        kind: "INHOUSE_RESULT",
        message: "사용법: /결과등록 3세트 1회차 [밸런스#2] [메모:내용]",
      };
    }

    return {
      matched: true,
      ok: true,
      command: {
        kind: "INHOUSE_RESULT",
        gameCount: Number(gameMatch[1]) as 2 | 3,
        seriesNumber,
        teamBalanceDraftId,
        note,
      },
    };
  }

  return { matched: false };
}
