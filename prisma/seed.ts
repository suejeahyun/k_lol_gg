import { prisma } from "@/lib/prisma/client";

type RiotChampionSummary = {
  id: string;
  key: string;
  name: string;
  image: {
    full: string;
  };
};

type RiotChampionResponse = {
  data: Record<string, RiotChampionSummary>;
};

const POSITIONS = ["TOP", "JGL", "MID", "ADC", "SUP"] as const;

async function getLatestDdragonVersion(): Promise<string> {
  const res = await fetch(
    "https://ddragon.leagueoflegends.com/api/versions.json",
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch versions.json: ${res.status}`);
  }

  const versions = (await res.json()) as string[];

  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error("No Data Dragon versions found.");
  }

  return versions[0];
}

async function getChampions(version: string): Promise<RiotChampionSummary[]> {
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/champion.json`;

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to fetch champion.json: ${res.status}`);
  }

  const json = (await res.json()) as RiotChampionResponse;

  return Object.values(json.data);
}

async function seedChampions() {
  const version = await getLatestDdragonVersion();
  const champions = await getChampions(version);

  console.log(`Data Dragon version: ${version}`);
  console.log(`Champion count: ${champions.length}`);

  for (const champion of champions) {
    const imageUrl = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion.image.full}`;

    await prisma.champion.upsert({
      where: {
        name: champion.name,
      },
      update: {
        imageUrl,
      },
      create: {
        name: champion.name,
        imageUrl,
      },
    });
  }

  console.log("전체 챔피언 시드 완료");
}

async function seedEventParticipants() {
  const eventId = 1;

  const event = await prisma.eventMatch.findUnique({
    where: { id: eventId },
    select: { id: true },
  });

  if (!event) {
    console.log(`eventId ${eventId} 이벤트가 없어 참가자 시드를 건너뜁니다.`);
    return;
  }

  const players = await prisma.player.findMany({
    take: 30,
    orderBy: {
      id: "asc",
    },
  });

  if (players.length < 30) {
    console.log(`플레이어가 ${players.length}명뿐이라 참가자 시드를 건너뜁니다.`);
    return;
  }

  await prisma.eventParticipant.deleteMany({
    where: {
      eventId,
    },
  });

  await prisma.eventParticipant.createMany({
    data: players.map((player, index) => ({
      eventId,
      playerId: player.id,
      position: POSITIONS[index % POSITIONS.length],
    })),
  });

  console.log("이벤트 참가자 30명 시드 완료");
}

async function main() {
  await seedChampions();
  await seedEventParticipants();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });