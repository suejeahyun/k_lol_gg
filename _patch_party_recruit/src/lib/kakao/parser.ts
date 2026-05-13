export function parseNickname(input: string) {
  let text = input.trim();

  // 명령어 제거
  text = text.replace(/^전적\s*/i, "");
  text = text.replace(/^최근전적\s*/i, "");

  // 공백 제거
  text = text.trim();

  // 닉네임#태그 분리
  if (text.includes("#")) {
    const [nickname, tag] = text.split("#");
    return {
      nickname: nickname.trim(),
      tag: tag.trim(),
    };
  }

  return {
    nickname: text,
    tag: null,
  };
}