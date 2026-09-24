/** Synthetic provider shapes, never production player data. */
export const analyticsPuuid = "synthetic-analytics-player";
export function analyticsMatch(id = "KR_100", startedAt = new Date().getTime(), queueId = 420) {
  return { metadata: { matchId: id, participants: [analyticsPuuid] }, info: {
    queueId, gameType: "MATCHED_GAME", gameMode: "CLASSIC", mapId: 11, gameStartTimestamp: startedAt, gameDuration: 1_800, gameVersion: "16.19.1",
    participants: Array.from({ length: 10 }, (_, index) => ({
      puuid: index === 0 ? analyticsPuuid : `synthetic-other-${index}`, summonerId: "private-not-for-projection", summonerName: "legacy-not-for-projection",
      participantId: index + 1, teamId: index < 5 ? 100 : 200, win: index < 5, championId: index + 1, championName: `Champion${index + 1}`,
      riotIdGameName: `Synthetic${index}`, riotIdTagline: "TEST", teamPosition: ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][index % 5],
      kills: 6, deaths: 2, assists: 8, champLevel: 16, totalMinionsKilled: 150, neutralMinionsKilled: 20,
      goldEarned: 12_000, totalDamageDealtToChampions: 20_000, totalDamageTaken: 25_000, visionScore: 25,
      challenges: { turretPlatesTaken: index % 3 },
      wardsPlaced: 10, wardsKilled: 4, visionWardsBoughtInGame: 2, summoner1Id: 4, summoner2Id: 12,
      item0: 1001, item1: 1055, item2: 0, item3: 0, item4: 0, item5: 0, item6: 3340,
      perks: { styles: [{ style: 8000, selections: [{ perk: 8005 }] }, { style: 8100, selections: [{ perk: 8139 }] }], statPerks: { offense: 5005, flex: 5008, defense: 5001 } },
    })),
    teams: [100, 200].map((teamId) => ({ teamId, win: teamId === 100, objectives: { dragon: { kills: 2, first: true }, tower: { kills: 5, first: false } }, bans: [{ championId: 1, pickTurn: 1 }] })),
  } };
}
export function analyticsTimeline(id = "KR_100") {
  return { metadata: { matchId: id, participants: [analyticsPuuid] }, info: { frameInterval: 60_000, frames: [0, 600_000, 900_000].map((timestamp) => ({
    timestamp,
    participantFrames: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), {
      participantId: index + 1, totalGold: 500 + timestamp / 100, xp: timestamp / 100, level: 1 + timestamp / 100_000,
      minionsKilled: timestamp / 10_000, jungleMinionsKilled: 0, position: { x: 1_000, y: 2_000 }, privateIdentity: analyticsPuuid,
    }])),
    events: [
      { timestamp, type: "ITEM_PURCHASED", participantId: 1, itemId: 1001, puuid: analyticsPuuid },
      { timestamp, type: "ITEM_PURCHASED", participantId: 2, itemId: 1001 },
      { timestamp, type: "SKILL_LEVEL_UP", participantId: 1, skillSlot: 1 },
      { timestamp, type: "CHAMPION_KILL", killerId: 1, victimId: 6, assistingParticipantIds: [2], position: { x: 1_000, y: 2_000 } },
      { timestamp, type: "UNKNOWN_FUTURE_EVENT", secret: "must-not-leak" },
    ],
  })) } };
}
