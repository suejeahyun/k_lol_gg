import { findDataDragonChampion } from "../../champions/domain/champion-image";

export const HOME_GUIDE_CHAMPION_COUNT = 68;

export type HomeGuideTone = "sky" | "lilac" | "peach" | "mint";

export type HomeGuideChampionProfile = Readonly<{
  id: string;
  message: string;
  tone: HomeGuideTone;
  artWebpSrc: string;
}>;

const guide = (
  id: string,
  message: string,
  tone: HomeGuideTone,
): HomeGuideChampionProfile => Object.freeze({
  id,
  message,
  tone,
  artWebpSrc: `/images/home/champions-v2/${id.toLocaleLowerCase("en-US")}.webp`,
});

/**
 * Home guide policy: champions that are unambiguously female, including four
 * officially female non-human champions. Everything else is denied.
 */
export const HOME_GUIDE_CHAMPIONS = Object.freeze([
  guide("Ahri", "아리의 여우불처럼 반짝이는 호흡으로 오늘 한 판을 열어 봐요.", "lilac"),
  guide("Akali", "아칼리처럼 연막 사이를 톡 뛰어넘으며 짜릿한 기회를 잡아 봐요.", "mint"),
  guide("Ambessa", "암베사처럼 힘차게 돌진하되 팀의 발맞춤도 꼭 챙겨 봐요.", "peach"),
  guide("Annie", "애니와 티버처럼 든든한 짝꿍을 만나 포근한 승리를 노려 봐요.", "sky"),
  guide("Ashe", "애쉬의 수정 화살처럼 또렷한 신호로 팀의 길을 밝혀 봐요.", "mint"),
  guide("Aurora", "오로라처럼 폴짝이는 발걸음으로 신비로운 한 판을 시작해 봐요.", "lilac"),
  guide("Caitlyn", "케이틀린처럼 함정을 꼼꼼히 놓고 멋진 순간을 정조준해 봐요.", "sky"),
  guide("Camille", "카밀의 갈고리처럼 가볍게 날아들어 완벽한 타이밍을 만들어 봐요.", "peach"),
  guide("Cassiopeia", "카시오페아처럼 부드럽게 움직이다 반짝이는 석화 한 번을 노려 봐요.", "lilac"),
  guide("Diana", "다이애나의 달빛처럼 은은하게 합류해 팀의 밤을 환하게 밝혀 봐요.", "sky"),
  guide("Elise", "엘리스의 거미줄처럼 빈틈없이 연결된 팀워크를 만들어 봐요.", "peach"),
  guide("Evelynn", "이블린처럼 살며시 다가가 기분 좋은 반전 한 장면을 선물해 봐요.", "lilac"),
  guide("Fiora", "피오라의 응수처럼 침착하게 받아치며 우아한 승부를 즐겨 봐요.", "mint"),
  guide("Gwen", "그웬의 가위처럼 흐트러진 판을 야무지게 다듬어 봐요.", "sky"),
  guide("Illaoi", "일라오이처럼 힘찬 물결을 일으켜 팀에 씩씩한 기운을 더해 봐요.", "peach"),
  guide("Irelia", "이렐리아의 칼날처럼 사뿐히 이어지는 연계로 전장을 수놓아 봐요.", "lilac"),
  guide("Janna", "잔나의 산들바람처럼 편안한 호흡으로 팀을 살랑살랑 이끌어 봐요.", "mint"),
  guide("Jinx", "징크스의 로켓처럼 통통 튀는 에너지로 신나는 한 판을 만들어 봐요.", "peach"),
  guide("Kaisa", "카이사처럼 정확히 표식을 따라가며 팀과 멋진 추격전을 펼쳐 봐요.", "lilac"),
  guide("Kalista", "칼리스타의 맹세처럼 서로를 믿고 창끝까지 호흡을 맞춰 봐요.", "sky"),
  guide("Karma", "카르마의 만트라처럼 따뜻한 응원 한마디로 팀의 힘을 키워 봐요.", "mint"),
  guide("Katarina", "카타리나의 단검처럼 경쾌하게 움직여 눈부신 기회를 이어 봐요.", "peach"),
  guide("Kayle", "케일의 날개처럼 차근차근 성장해 찬란한 후반을 맞이해 봐요.", "sky"),
  guide("Leblanc", "르블랑의 환영처럼 재치 있는 움직임으로 상대를 깜짝 놀라게 해 봐요.", "lilac"),
  guide("Leona", "레오나의 햇살처럼 따뜻하고 든든하게 팀의 앞을 밝혀 봐요.", "peach"),
  guide("Lillia", "릴리아처럼 꽃길을 사뿐사뿐 달리며 포근한 꿈의 한타를 열어 봐요.", "mint"),
  guide("Lissandra", "리산드라의 얼음꽃처럼 차분하게 판을 묶고 시원한 승리를 그려 봐요.", "sky"),
  guide("Lulu", "룰루와 픽스처럼 통통 튀는 마법으로 아군의 하루를 반짝여 봐요.", "lilac"),
  guide("Lux", "럭스의 빛처럼 환한 미소와 정확한 스킬로 오늘 판을 밝혀 봐요.", "sky"),
  guide("Mel", "멜의 황금빛 반사처럼 위기를 반짝이는 기회로 되돌려 봐요.", "peach"),
  guide("MissFortune", "미스 포츈의 쌍권총처럼 경쾌한 리듬으로 교전을 풀어 봐요.", "mint"),
  guide("Morgana", "모르가나의 보호막처럼 서로의 실수를 포근하게 감싸 줘요.", "lilac"),
  guide("Neeko", "니코처럼 알록달록 변신하며 예상 못 한 즐거움을 만들어 봐요.", "peach"),
  guide("Nidalee", "니달리처럼 날렵하게 도약해 꼭 필요한 곳에 창을 꽂아 봐요.", "mint"),
  guide("Nilah", "닐라의 기쁨처럼 웃음 가득한 물결로 팀 분위기를 띄워 봐요.", "sky"),
  guide("Orianna", "오리아나의 구체처럼 팀 곁을 맴돌며 예쁜 연계를 완성해 봐요.", "lilac"),
  guide("Poppy", "뽀삐의 망치처럼 씩씩하게 길을 열고 든든한 한 방을 준비해 봐요.", "peach"),
  guide("Qiyana", "키아나처럼 원소를 알맞게 골라 화려한 무대를 만들어 봐요.", "mint"),
  guide("Quinn", "퀸과 발러처럼 가벼운 날갯짓으로 필요한 곳에 먼저 도착해 봐요.", "sky"),
  guide("Rell", "렐처럼 단단히 달려들어 흩어진 팀을 자석처럼 모아 봐요.", "lilac"),
  guide("Renata", "레나타처럼 여유로운 손짓으로 팀의 멋진 재도전을 도와 봐요.", "peach"),
  guide("Riven", "리븐의 룬 검처럼 조각난 기회를 이어 눈부신 콤보를 완성해 봐요.", "mint"),
  guide("Samira", "사미라처럼 스타일 점수를 쌓으며 짜릿하고 멋진 한 판을 즐겨 봐요.", "sky"),
  guide("Sejuani", "세주아니와 브리슬처럼 씩씩하게 달려 팀의 시원한 길을 열어 봐요.", "lilac"),
  guide("Senna", "세나의 빛처럼 멀리 있는 아군에게도 따뜻한 도움을 건네 봐요.", "mint"),
  guide("Seraphine", "세라핀의 노래처럼 다섯 마음을 맞춰 신나는 합주를 시작해 봐요.", "peach"),
  guide("Shyvana", "쉬바나처럼 작은 불씨를 키워 멋진 용의 순간을 펼쳐 봐요.", "sky"),
  guide("Sivir", "시비르의 부메랑처럼 좋은 흐름을 팀에게 예쁘게 돌려줘 봐요.", "lilac"),
  guide("Sona", "소나의 선율처럼 말없이도 착착 맞는 포근한 팀워크를 들려줘 봐요.", "mint"),
  guide("Soraka", "소라카의 별빛처럼 지친 아군에게 다정한 숨을 채워 줘요.", "sky"),
  guide("Syndra", "신드라의 구체처럼 기회를 하나씩 모아 우아한 한 방을 완성해 봐요.", "lilac"),
  guide("Taliyah", "탈리야의 바위 물결처럼 팀이 달릴 포근한 길을 펼쳐 봐요.", "peach"),
  guide("Tristana", "트리스타나처럼 통통 뛰어오르며 대포 가득 신나는 기세를 담아 봐요.", "mint"),
  guide("Vayne", "베인의 은빛 화살처럼 또렷하게 약점을 찾아 멋진 역전을 노려 봐요.", "sky"),
  guide("Vi", "바이의 주먹처럼 시원하게 목표를 정하고 팀과 함께 돌파해 봐요.", "peach"),
  guide("Vex", "벡스와 그림자처럼 조용히 있다가 꼭 맞는 순간에 톡 나서 봐요.", "lilac"),
  guide("Xayah", "자야의 깃털처럼 예쁜 흔적을 모아 한 번에 멋지게 불러와 봐요.", "mint"),
  guide("Yuumi", "유미와 마법책처럼 포근히 곁을 지키며 아군의 모험을 도와 봐요.", "sky"),
  guide("Zeri", "제리의 전기처럼 톡톡 튀는 속도로 팀에 생기를 충전해 봐요.", "peach"),
  guide("Zoe", "조이의 별방울처럼 반짝이는 장난 한 스푼으로 기회를 열어 봐요.", "lilac"),
  guide("Zyra", "자이라의 꽃처럼 좋은 자리를 골라 화사한 한타를 피워 봐요.", "mint"),
  guide("Briar", "브라이어처럼 신나는 에너지는 가득, 목표는 야무지게 골라 봐요.", "peach"),
  guide("Nami", "나미의 물방울처럼 통통 떠오르는 연계로 시원한 흐름을 타 봐요.", "sky"),
  guide("Yunara", "유나라의 영혼꽃처럼 고운 빛을 모아 우아한 한 판을 피워 봐요.", "lilac"),
  guide("Anivia", "애니비아의 얼음 날개처럼 시원하게 날아올라 새로운 기회를 열어 봐요.", "mint"),
  guide("Belveth", "벨베스의 공허 물결처럼 부드럽게 헤엄치며 전장의 흐름을 바꿔 봐요.", "sky"),
  guide("Naafiri", "나피리의 무리처럼 발맞춰 달리며 팀의 목표를 신나게 쫓아 봐요.", "peach"),
  guide("RekSai", "렉사이처럼 땅굴로 쏙 나타나 예상 못 한 활약을 선물해 봐요.", "lilac"),
] satisfies readonly HomeGuideChampionProfile[]);

const profileByOfficialId = new Map(HOME_GUIDE_CHAMPIONS.map((profile) => [profile.id, profile]));

if (
  HOME_GUIDE_CHAMPIONS.length !== HOME_GUIDE_CHAMPION_COUNT ||
  profileByOfficialId.size !== HOME_GUIDE_CHAMPION_COUNT
) {
  throw new Error("HOME_GUIDE_CHAMPION_POLICY_INVALID");
}

/** Canonicalizes through Riot's catalog before applying the default-deny policy. */
export function findHomeGuideChampion(
  championKey: unknown,
  displayName?: unknown,
): HomeGuideChampionProfile | null {
  const official = findDataDragonChampion(championKey, displayName);
  return official ? profileByOfficialId.get(official.id) ?? null : null;
}
