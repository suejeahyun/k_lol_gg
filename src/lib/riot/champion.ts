type DdragonChampionItem = {
  id: string;
  key: string;
  name: string;
};

type DdragonChampionResponse = {
  type: string;
  format: string;
  version: string;
  data: Record<string, DdragonChampionItem>;
};

const DDRAGON_VERSION = "15.24.1";
const CHAMPION_LANGUAGE = "ko_KR";

let cachedChampionNameMap: Map<string, string> | null = null;

export async function getKoreanChampionNameMap() {
  if (cachedChampionNameMap) {
    return cachedChampionNameMap;
  }

  const response = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/data/${CHAMPION_LANGUAGE}/champion.json`,
    {
      cache: "force-cache",
    }
  );

  if (!response.ok) {
    throw new Error("Data Dragon 챔피언 데이터를 불러오지 못했습니다.");
  }

  const data = (await response.json()) as DdragonChampionResponse;
  const championMap = new Map<string, string>();

  Object.values(data.data).forEach((champion) => {
    championMap.set(champion.id, champion.name);
    championMap.set(champion.key, champion.name);
  });

  cachedChampionNameMap = championMap;

  return championMap;
}

export function getChampionNameKo(
  championMap: Map<string, string>,
  championName: string,
  championId: number
) {
  return (
    championMap.get(championName) ??
    championMap.get(String(championId)) ??
    championName
  );
}