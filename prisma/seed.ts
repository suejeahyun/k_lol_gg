import "dotenv/config";
import { PrismaClient, Position, Team } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL이 설정되어 있지 않습니다.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const POSITIONS: Position[] = [
  Position.TOP,
  Position.JGL,
  Position.MID,
  Position.ADC,
  Position.SUP,
];

type RiotChampionSummary = {
  id: string;
  key: string;
  name: string;
  title: string;
  image: {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
};

type RiotChampionResponse = {
  type: string;
  format: string;
  version: string;
  data: Record<string, RiotChampionSummary>;
};

type AggregateStats = {
  totalGames: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  totalGold: number;
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, digits = 2): number {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(digits));
}

function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

async function fetchLatestDDragonVersion(): Promise<string> {
  const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");

  if (!response.ok) {
    throw new Error(`Data Dragon versions fetch failed: ${response.status}`);
  }

  const versions = (await response.json()) as string[];

  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("No Data Dragon versions returned.");
  }

  return versions[0];
}

async function fetchKoreanChampions() {
  const version = await fetchLatestDDragonVersion();
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Champion data fetch failed: ${response.status}`);
  }

  const json = (await response.json()) as RiotChampionResponse;
  const champions = Object.values(json.data);

  return {
    version,
    champions: champions.map((champion) => ({
      name: champion.name, // 한글명
      imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`,
    })),
  };
}

async function clearDatabase() {
  await prisma.adminLog.deleteMany();
  await prisma.seasonResult.deleteMany();
  await prisma.playerPositionStat.deleteMany();
  await prisma.playerChampionStat.deleteMany();
  await prisma.playerSeasonStat.deleteMany();
  await prisma.matchParticipant.deleteMany();
  await prisma.matchGame.deleteMany();
  await prisma.matchSeries.deleteMany();
  await prisma.season.deleteMany();
  await prisma.champion.deleteMany();
  await prisma.player.deleteMany();
}

async function seedPlayers() {
  const players = [];

  for (let i = 1; i <= 50; i += 1) {
    players.push({
      name: `플레이어${i}`,
      nickname: `user${i}`,
      tag: `KR${1000 + i}`,
    });
  }

  await prisma.player.createMany({
    data: players,
  });

  return prisma.player.findMany({
    orderBy: { id: "asc" },
  });
}

async function seedSeasons() {
  await prisma.season.createMany({
    data: [
      { name: "시즌 1", isActive: false },
      { name: "시즌 2", isActive: false },
      { name: "시즌 3", isActive: true },
    ],
  });

  return prisma.season.findMany({
    orderBy: { id: "asc" },
  });
}

async function seedChampions() {
  const { champions, version } = await fetchKoreanChampions();

  await prisma.champion.createMany({
    data: champions,
    skipDuplicates: true,
  });

  const inserted = await prisma.champion.findMany({
    orderBy: { id: "asc" },
  });

  console.log(`챔피언 ${inserted.length}개 생성 완료 (Data Dragon ${version})`);

  return inserted;
}

async function seedMatchesAndStats() {
  const players = await prisma.player.findMany({ orderBy: { id: "asc" } });
  const seasons = await prisma.season.findMany({ orderBy: { id: "asc" } });
  const champions = await prisma.champion.findMany({ orderBy: { id: "asc" } });

  const playerSeasonMap = new Map<string, AggregateStats>();
  const playerChampionMap = new Map<string, AggregateStats>();
  const playerPositionMap = new Map<string, { games: number; wins: number }>();

  for (const season of seasons) {
    for (let seriesIndex = 1; seriesIndex <= 100; seriesIndex += 1) {
      const matchDate = new Date();
      matchDate.setDate(matchDate.getDate() - randomInt(0, 180));
      matchDate.setHours(randomInt(18, 23), randomInt(0, 59), 0, 0);

      const series = await prisma.matchSeries.create({
        data: {
          title: `${season.name} 내전 ${seriesIndex}`,
          matchDate,
          seasonId: season.id,
        },
      });

      const gameCount = randomInt(1, 3);

      for (let gameNumber = 1; gameNumber <= gameCount; gameNumber += 1) {
        const winnerTeam = Math.random() > 0.5 ? Team.BLUE : Team.RED;
        const durationMin = randomInt(20, 50);

        const game = await prisma.matchGame.create({
          data: {
            seriesId: series.id,
            gameNumber,
            durationMin,
            winnerTeam,
          },
        });

        const selectedPlayers = shuffle(players).slice(0, 10);
        const bluePlayers = selectedPlayers.slice(0, 5);
        const redPlayers = selectedPlayers.slice(5, 10);

        const participantsData = [];

        for (let i = 0; i < 5; i += 1) {
          const blueChampion = champions[randomInt(0, champions.length - 1)];
          const redChampion = champions[randomInt(0, champions.length - 1)];

          participantsData.push({
            gameId: game.id,
            playerId: bluePlayers[i].id,
            championId: blueChampion.id,
            team: Team.BLUE,
            position: POSITIONS[i],
            kills: randomInt(0, 20),
            deaths: randomInt(0, 20),
            assists: randomInt(0, 20),
            cs: randomInt(80, 450),
            gold: randomInt(8000, 30000),
          });

          participantsData.push({
            gameId: game.id,
            playerId: redPlayers[i].id,
            championId: redChampion.id,
            team: Team.RED,
            position: POSITIONS[i],
            kills: randomInt(0, 20),
            deaths: randomInt(0, 20),
            assists: randomInt(0, 20),
            cs: randomInt(80, 450),
            gold: randomInt(8000, 30000),
          });
        }

        await prisma.matchParticipant.createMany({
          data: participantsData,
        });

        for (const participant of participantsData) {
          const isWin = participant.team === winnerTeam ? 1 : 0;

          const seasonKey = `${participant.playerId}:${season.id}`;
          const championKey = `${participant.playerId}:${participant.championId}`;
          const positionKey = `${participant.playerId}:${participant.position}`;

          const seasonAgg = playerSeasonMap.get(seasonKey) ?? {
            totalGames: 0,
            wins: 0,
            losses: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            totalGold: 0,
          };

          seasonAgg.totalGames += 1;
          seasonAgg.wins += isWin;
          seasonAgg.losses += isWin ? 0 : 1;
          seasonAgg.kills += participant.kills;
          seasonAgg.deaths += participant.deaths;
          seasonAgg.assists += participant.assists;
          seasonAgg.totalGold += participant.gold;
          playerSeasonMap.set(seasonKey, seasonAgg);

          const champAgg = playerChampionMap.get(championKey) ?? {
            totalGames: 0,
            wins: 0,
            losses: 0,
            kills: 0,
            deaths: 0,
            assists: 0,
            totalGold: 0,
          };

          champAgg.totalGames += 1;
          champAgg.wins += isWin;
          champAgg.losses += isWin ? 0 : 1;
          champAgg.kills += participant.kills;
          champAgg.deaths += participant.deaths;
          champAgg.assists += participant.assists;
          champAgg.totalGold += participant.gold;
          playerChampionMap.set(championKey, champAgg);

          const posAgg = playerPositionMap.get(positionKey) ?? {
            games: 0,
            wins: 0,
          };

          posAgg.games += 1;
          posAgg.wins += isWin;
          playerPositionMap.set(positionKey, posAgg);
        }
      }
    }
  }

  const seasonStatsData = [...playerSeasonMap.entries()].map(([key, value]) => {
    const [playerId, seasonId] = key.split(":").map(Number);
    const kda =
      (value.kills + value.assists) / Math.max(1, value.deaths);
    const avgGold = value.totalGold / Math.max(1, value.totalGames);

    return {
      playerId,
      seasonId,
      totalGames: value.totalGames,
      wins: value.wins,
      losses: value.losses,
      kda: Number(kda.toFixed(2)),
      avgGold: Number(avgGold.toFixed(2)),
    };
  });

  const championStatsData = [...playerChampionMap.entries()].map(([key, value]) => {
    const [playerId, championId] = key.split(":").map(Number);
    const kda =
      (value.kills + value.assists) / Math.max(1, value.deaths);

    return {
      playerId,
      championId,
      games: value.totalGames,
      wins: value.wins,
      kda: Number(kda.toFixed(2)),
    };
  });

  const positionStatsData = [...playerPositionMap.entries()].map(([key, value]) => {
    const [playerId, position] = key.split(":");

    return {
      playerId: Number(playerId),
      position: position as Position,
      games: value.games,
      wins: value.wins,
    };
  });

  await prisma.playerSeasonStat.createMany({
    data: seasonStatsData,
  });

  await prisma.playerChampionStat.createMany({
    data: championStatsData,
  });

  await prisma.playerPositionStat.createMany({
    data: positionStatsData,
  });

  for (const season of seasons) {
    const seasonStats = seasonStatsData.filter((stat) => stat.seasonId === season.id);

    const topByWinRate = [...seasonStats]
      .filter((stat) => stat.totalGames >= 5)
      .sort((a, b) => {
        const aWinRate = a.wins / Math.max(1, a.totalGames);
        const bWinRate = b.wins / Math.max(1, b.totalGames);
        return bWinRate - aWinRate;
      })
      .slice(0, 3);

    const topByKda = [...seasonStats]
      .filter((stat) => stat.totalGames >= 5)
      .sort((a, b) => b.kda - a.kda)
      .slice(0, 3);

    const seasonResultsData = [
      ...topByWinRate.map((stat, index) => ({
        seasonId: season.id,
        category: `WIN_RATE_TOP_${index + 1}`,
        playerId: stat.playerId,
        value: Number((stat.wins / Math.max(1, stat.totalGames)).toFixed(4)),
      })),
      ...topByKda.map((stat, index) => ({
        seasonId: season.id,
        category: `KDA_TOP_${index + 1}`,
        playerId: stat.playerId,
        value: stat.kda,
      })),
    ];

    if (seasonResultsData.length > 0) {
      await prisma.seasonResult.createMany({
        data: seasonResultsData,
      });
    }
  }

  await prisma.adminLog.create({
    data: {
      action: "SEED",
      target: "Initial large test data inserted",
    },
  });
}

async function main() {
  console.log("시드 시작");

  await clearDatabase();
  console.log("기존 데이터 삭제 완료");

  await seedPlayers();
  console.log("플레이어 생성 완료");

  await seedSeasons();
  console.log("시즌 생성 완료");

  await seedChampions();
  console.log("챔피언 생성 완료");

  await seedMatchesAndStats();
  console.log("매치/통계 생성 완료");

  const [playerCount, championCount, seasonCount, seriesCount, gameCount, participantCount] =
    await Promise.all([
      prisma.player.count(),
      prisma.champion.count(),
      prisma.season.count(),
      prisma.matchSeries.count(),
      prisma.matchGame.count(),
      prisma.matchParticipant.count(),
    ]);

  console.log({
    playerCount,
    championCount,
    seasonCount,
    seriesCount,
    gameCount,
    participantCount,
  });

  console.log("시드 종료");
}

main()
  .catch((error) => {
    console.error("시드 실패:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });