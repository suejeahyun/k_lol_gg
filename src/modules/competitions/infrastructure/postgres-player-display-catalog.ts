import { asc, eq, inArray } from "drizzle-orm";

import type { V2Database } from "@/platform/db/database";
import { players } from "@/platform/db/schema/registry";

import type { CompetitionPlayerOption } from "../core/display-projection";

const ADMIN_OPTION_LIMIT = 40;

function option(row: Pick<typeof players.$inferSelect, "id" | "nickname" | "tagLine" | "status">): CompetitionPlayerOption {
  return Object.freeze({ value: row.id, label: `${row.nickname}#${row.tagLine}`, status: row.status });
}

export async function loadCompetitionPlayerDisplayCatalog(
  database: V2Database,
  playerIds: readonly string[],
  includeActiveOptions = false,
) {
  const uniqueIds = [...new Set(playerIds)];
  const selected = uniqueIds.length === 0 ? [] : await database
    .select({ id: players.id, nickname: players.nickname, tagLine: players.tagLine, status: players.status })
    .from(players)
    .where(inArray(players.id, uniqueIds));
  const active = includeActiveOptions ? await database
    .select({ id: players.id, nickname: players.nickname, tagLine: players.tagLine, status: players.status })
    .from(players)
    .where(eq(players.status, "ACTIVE"))
    .orderBy(asc(players.nicknameNormalized), asc(players.tagLineNormalized), asc(players.id))
    .limit(ADMIN_OPTION_LIMIT) : [];
  const options = new Map<string, CompetitionPlayerOption>();
  for (const row of [...selected, ...active]) options.set(row.id, option(row));
  const items = [...options.values()].sort((left, right) =>
    left.label.localeCompare(right.label, "ko-KR") || left.value.localeCompare(right.value, "en-US"));
  return Object.freeze({
    labels: new Map(items.map((item) => [item.value, item.label])),
    options: Object.freeze(items),
  });
}
